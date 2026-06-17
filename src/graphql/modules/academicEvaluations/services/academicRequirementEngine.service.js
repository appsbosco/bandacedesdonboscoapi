"use strict";

const PRIMARY_GRADES = new Set([
  "Tercero Primaria",
  "Cuarto Primaria",
  "Quinto Primaria",
  "Sexto Primaria",
]);

const RISK_RULES = {
  redAverageBelow: 70,
  yellowAverageBelow: 80,
  redCoverageBelow: 60,
  yellowCoverageBelowOrEqual: 85,
};

function normalizeId(value) {
  if (!value) return "";
  return String(value._id || value.id || value);
}

function subjectAppliesToGrade(subject, grade) {
  const grades = Array.isArray(subject?.grades) ? subject.grades.filter(Boolean) : [];
  return grades.length === 0 || grades.includes(grade);
}

function slotAppliesToGrade(slot, grade) {
  const applies = Array.isArray(slot?.appliesToGrades)
    ? slot.appliesToGrades.filter(Boolean)
    : [];
  const excluded = Array.isArray(slot?.excludedGrades)
    ? slot.excludedGrades.filter(Boolean)
    : [];

  if (excluded.includes(grade)) return false;
  return applies.length === 0 || applies.includes(grade);
}

function slotAppliesToSubject(slot, subject) {
  return Boolean(slot?.subjectType && subject?.subjectType && slot.subjectType === subject.subjectType);
}

function sortRequirements(a, b) {
  const subjectOrder = (a.subject?.order || 0) - (b.subject?.order || 0);
  if (subjectOrder !== 0) return subjectOrder;
  const subjectName = String(a.subject?.name || "").localeCompare(String(b.subject?.name || ""));
  if (subjectName !== 0) return subjectName;
  return (a.assessmentSlot?.order || 0) - (b.assessmentSlot?.order || 0);
}

function getExpectedRequirementsForStudentFromData(student, subjects, slots, options = {}) {
  const grade = student?.grade;
  if (!grade) return [];

  const academicYear = options.academicYear ? Number(options.academicYear) : null;
  const semester = options.semester ? Number(options.semester) : null;

  const applicableSubjects = subjects.filter((subject) => {
    if (subject?.isActive === false) return false;
    if (!subject?.subjectType) return false; // salta materias sin subjectType (docs legacy sin campo)
    return subjectAppliesToGrade(subject, grade);
  });
  const applicableSlots = slots.filter((slot) => {
    if (slot?.isActive === false) return false;
    if (academicYear && Number(slot.academicYear) !== academicYear) return false;
    if (semester && Number(slot.semester) !== semester) return false;
    return slotAppliesToGrade(slot, grade);
  });

  const requirements = [];
  for (const subject of applicableSubjects) {
    for (const slot of applicableSlots) {
      if (!slotAppliesToSubject(slot, subject)) continue;
      requirements.push({
        studentId: normalizeId(student),
        subject,
        assessmentSlot: slot,
        subjectId: normalizeId(subject),
        subjectName: subject.name,
        subjectType: subject.subjectType,
        assessmentSlotId: normalizeId(slot),
        slotKey: slot.slotKey,
        slotLabel: slot.label,
        evaluationType: slot.evaluationType,
        academicYear: Number(slot.academicYear),
        semester: Number(slot.semester),
        required: true,
      });
    }
  }

  return requirements.sort(sortRequirements);
}

function buildEvaluationKey(evaluation) {
  const slotId = normalizeId(evaluation.assessmentSlot);
  if (!slotId) return null;
  return [
    normalizeId(evaluation.subject),
    Number(evaluation.academicYear),
    Number(evaluation.semester),
    slotId,
  ].join(":");
}

function buildRequirementKey(requirement) {
  return [
    requirement.subjectId,
    Number(requirement.academicYear),
    Number(requirement.semester),
    requirement.assessmentSlotId,
  ].join(":");
}

function evaluationPriority(status) {
  if (status === "approved") return 3;
  if (status === "pending") return 2;
  if (status === "rejected") return 1;
  return 0;
}

function shouldReplaceEvaluation(existing, candidate) {
  if (!existing) return true;

  const existingPriority = evaluationPriority(existing.status);
  const candidatePriority = evaluationPriority(candidate.status);
  if (candidatePriority !== existingPriority) {
    return candidatePriority > existingPriority;
  }

  const existingUpdatedAt = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
  const candidateUpdatedAt = new Date(candidate.updatedAt || candidate.createdAt || 0).getTime();
  if (candidateUpdatedAt !== existingUpdatedAt) {
    return candidateUpdatedAt > existingUpdatedAt;
  }

  return false;
}

function buildAcademicCoverageForStudent(student, evaluations, requirements) {
  const evaluationByRequirement = new Map();
  for (const evaluation of evaluations || []) {
    const key = buildEvaluationKey(evaluation);
    if (!key) continue;
    const existing = evaluationByRequirement.get(key);
    if (shouldReplaceEvaluation(existing, evaluation)) {
      evaluationByRequirement.set(key, evaluation);
    }
  }

  const statuses = requirements.map((requirement) => {
    const evaluation = evaluationByRequirement.get(buildRequirementKey(requirement));
    return {
      subject: requirement.subject,
      assessmentSlot: requirement.assessmentSlot,
      subjectId: requirement.subjectId,
      subjectName: requirement.subjectName,
      subjectType: requirement.subjectType,
      assessmentSlotId: requirement.assessmentSlotId,
      slotKey: requirement.slotKey,
      slotLabel: requirement.slotLabel,
      evaluationType: requirement.evaluationType,
      academicYear: requirement.academicYear,
      semester: requirement.semester,
      required: true,
      submitted: Boolean(evaluation),
      status: evaluation?.status || null,
      evaluation: evaluation || null,
      evaluationId: evaluation ? normalizeId(evaluation) : null,
      scoreNormalized100: evaluation?.scoreNormalized100 ?? null,
    };
  });

  const summary = {
    expectedCount: statuses.length,
    submittedCount: statuses.filter((item) => item.submitted).length,
    missingCount: statuses.filter((item) => !item.submitted).length,
    approvedCount: statuses.filter((item) => item.status === "approved").length,
    pendingCount: statuses.filter((item) => item.status === "pending").length,
    rejectedCount: statuses.filter((item) => item.status === "rejected").length,
  };

  summary.allSubmitted = summary.expectedCount > 0 && summary.missingCount === 0;
  summary.coveragePercentage =
    summary.expectedCount === 0
      ? 100
      : Math.round((summary.submittedCount / summary.expectedCount) * 1000) / 10;

  return {
    studentId: normalizeId(student),
    student,
    academicYear: statuses[0]?.academicYear || null,
    semester: statuses.length > 0 ? statuses[0].semester : null,
    summary,
    requirements: statuses,
    missingRequirements: statuses.filter((item) => !item.submitted),
    completedRequirements: statuses.filter((item) => item.submitted),
  };
}

function calculateRiskLevel({ averageFromSubmittedApproved, coveragePercentage }) {
  const average = Number(averageFromSubmittedApproved || 0);
  const coverage = Number(coveragePercentage || 0);

  // Risk level is based on academic performance (average) only.
  // Coverage is tracked and shown in riskReasons but does NOT change the level —
  // missing submissions often reflect upcoming evaluations, not academic failure.
  if (average < RISK_RULES.redAverageBelow) return "RED";
  if (average < RISK_RULES.yellowAverageBelow) return "YELLOW";
  return "GREEN";
}

module.exports = {
  PRIMARY_GRADES,
  RISK_RULES,
  subjectAppliesToGrade,
  slotAppliesToGrade,
  slotAppliesToSubject,
  getExpectedRequirementsForStudentFromData,
  buildAcademicCoverageForStudent,
  calculateRiskLevel,
  __test: {
    buildRequirementKey,
    buildEvaluationKey,
  },
};
