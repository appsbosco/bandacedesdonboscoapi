"use strict";

const mongoose = require("mongoose");
const AcademicSubject = require("../../../../../models/academic/AcademicSubject");
const AcademicPeriod = require("../../../../../models/academic/AcademicPeriod");
const AcademicEvaluation = require("../../../../../models/academic/AcademicEvaluation");
const AcademicAssessmentSlot = require("../../../../../models/academic/AcademicAssessmentSlot");
const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const { inferSectionFromInstrument } = require("../../../../../utils/sections");
const { buildThumbnailUrl, buildPreviewUrl } = require("../../../../../utils/cloudinaryTransform");
const requirementEngine = require("./academicRequirementEngine.service");

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);
const SECTION_ACADEMIC_REVIEWER_ROLES = new Set(["Principal de sección"]);

function getUser(ctx) {
  return ctx?.user || ctx?.me || ctx?.currentUser;
}

function requireAuth(ctx) {
  const user = getUser(ctx);
  if (!user) throw new Error("No autenticado");
  return user;
}

function isAdmin(user) {
  return ADMIN_ROLES.has(user.role);
}

function isSectionAcademicViewer(user) {
  return (
    user?.entityType !== "Parent" &&
    SECTION_ACADEMIC_REVIEWER_ROLES.has(user?.role) &&
    user?.state === "Exalumno" &&
    Boolean(String(user?.instrument || "").trim())
  );
}

function isSectionAcademicReviewer(user) {
  return (
    user?.entityType !== "Parent" &&
    SECTION_ACADEMIC_REVIEWER_ROLES.has(user?.role) &&
    user?.state === "Exalumno" &&
    Boolean(String(user?.instrument || "").trim())
  );
}

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (!isAdmin(user)) throw new Error("No autorizado: se requiere rol de administrador");
  return user;
}

/** Solo usuarios regulares (no padres) pueden subir/editar sus evaluaciones */
function requireStudentSelf(ctx) {
  const user = requireAuth(ctx);
  if (user.entityType === "Parent") {
    throw new Error("Los padres no pueden gestionar evaluaciones directamente");
  }
  return user;
}

/** Admin o el mismo estudiante */
async function requireStudentAccess(ctx, studentId) {
  const user = requireAuth(ctx);
  if (isAdmin(user)) return user;
  if (user.entityType === "Parent") throw new Error("No autorizado");
  if (String(user._id || user.id) !== String(studentId)) {
    if (await hasSectionStudentAccess(user, studentId)) return user;
    throw new Error("Solo puedes ver tus propias evaluaciones");
  }
  return user;
}

/** Admin o padre cuyo children[] incluye a childId */
async function requireParentChildAccess(ctx, childId) {
  const user = requireAuth(ctx);
  if (isAdmin(user)) return user;

  if (user.entityType !== "Parent") {
    throw new Error("No autorizado");
  }

  // Refetch para tener children actualizado (el contexto solo carga campos limitados)
  const parent = await Parent.findById(user._id || user.id).select("children").lean();
  if (!parent) throw new Error("Padre no encontrado");

  const childrenIds = (parent.children || []).map((id) => String(id));
  if (!childrenIds.includes(String(childId))) {
    throw new Error("No autorizado: este estudiante no está vinculado a tu cuenta");
  }
  return user;
}

async function requireSectionInstrumentLeader(ctx) {
  const user = requireAuth(ctx);
  const userFull = await User.findById(user._id || user.id)
    .select("_id role state instrument")
    .lean();

  if (!isSectionAcademicViewer(userFull)) {
    throw new Error(
      "No autorizado: se requiere ser Principal de sección con estado Exalumno e instrumento asignado"
    );
  }

  return {
    ...user,
    role: userFull.role,
    state: userFull.state,
    instrument: userFull.instrument,
    section: inferSectionFromInstrument(userFull.instrument),
  };
}

async function requireSectionReviewerAccessToStudent(ctx, studentId) {
  const user = requireAuth(ctx);
  const userFull = await User.findById(user._id || user.id)
    .select("_id role state instrument")
    .lean();

  if (!isSectionAcademicReviewer(userFull)) {
    throw new Error(
      "No autorizado: se requiere ser Principal de sección con estado Exalumno e instrumento asignado"
    );
  }

  const canAccess = await hasSectionStudentAccess(
    {
      ...user,
      role: userFull.role,
      state: userFull.state,
      instrument: userFull.instrument,
    },
    studentId
  );

  if (!canAccess) {
    throw new Error("No autorizado para revisar evaluaciones de este integrante");
  }

  return {
    ...user,
    role: userFull.role,
    state: userFull.state,
    instrument: userFull.instrument,
  };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function normalizeScore(scoreRaw, scaleMin, scaleMax) {
  if (scaleMax <= scaleMin) throw new Error("scaleMax debe ser mayor que scaleMin");
  const norm = ((scoreRaw - scaleMin) / (scaleMax - scaleMin)) * 100;
  return Math.round(norm * 100) / 100;
}

function normalizeSemester(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (![1, 2].includes(n)) throw new Error("El semestre debe ser 1 o 2");
  return n;
}

function periodSemester(period) {
  const semester = Number(period?.semester);
  if ([1, 2].includes(semester)) return semester;
  return null;
}

function periodAcademicYear(period) {
  return Number(period?.academicYear || period?.year);
}

function slotOrder(slot) {
  const order = Number(slot?.order);
  return Number.isFinite(order) && order > 0 ? order : null;
}

async function resolveCanonicalPeriodForSlot(period, slot) {
  const academicYear = Number(slot?.academicYear);
  const semester = Number(slot?.semester);
  if (!academicYear || !semester) return period;

  // Hay exactamente 1 período por semestre — lo resolvemos por año+semestre
  const canonicalPeriod = await AcademicPeriod.findOne({
    isActive: true,
    semester,
    $or: [{ academicYear }, { year: academicYear }],
  }).lean();

  return canonicalPeriod || period;
}

async function hydrateAssessmentSlots(evaluations) {
  const slotIds = [...new Set(
    (evaluations || [])
      .map((evaluation) => evaluation?.assessmentSlot)
      .filter(Boolean)
      .map((slot) => String(slot._id || slot.id || slot))
  )];

  if (slotIds.length === 0) return evaluations;

  const slots = await AcademicAssessmentSlot.find({ _id: { $in: slotIds } }).lean();
  const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));

  return (evaluations || []).map((evaluation) => {
    const current = evaluation?.assessmentSlot;
    if (!current) return evaluation;
    const slotId = String(current._id || current.id || current);
    return {
      ...evaluation,
      assessmentSlot: slotMap.get(slotId) || null,
    };
  });
}

async function loadEvaluationForGraphQL(id) {
  const evaluation = await AcademicEvaluation.findById(id)
    .select(EVAL_LIST_SELECT + " student")
    .populate("student", "name firstSurName email grade instrument avatar _id")
    .populate("subject", "name code isActive bands grades subjectType scienceGroup order _id")
    .populate("period", "name year academicYear semester order isActive _id")
    .populate("assessmentSlot", "academicYear semester slotKey label evaluationType subjectType appliesToGrades excludedGrades order isActive requiresEvidence _id")
    .populate("reviewedByAdmin", "name firstSurName email _id")
    .lean();

  if (!evaluation) return null;
  return (await hydrateAssessmentSlots([evaluation]))[0];
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSubjectGradeQuery(grade) {
  if (!grade) return {};
  return {
    $or: [
      { grades: grade },
      { grades: { $size: 0 } },
      { grades: { $exists: false } },
      { grades: null },
    ],
  };
}

async function hasSectionStudentAccess(user, studentId) {
  const leader = await User.findById(user._id || user.id)
    .select("_id role state instrument")
    .lean();

  if (!isSectionAcademicViewer(leader)) return false;

  const target = await User.findById(studentId)
    .select("instrument state grade")
    .lean();

  if (!target) throw new Error("Integrante no encontrado");
  if (target.state !== "Estudiante Activo") {
    throw new Error("Solo puedes ver integrantes activos de tu sección");
  }
  if (!target.grade) {
    throw new Error("El integrante no tiene nivel académico asignado");
  }

  const leaderSection = inferSectionFromInstrument(leader.instrument);
  const targetSection = inferSectionFromInstrument(target.instrument);

  if (!leaderSection || !targetSection || targetSection !== leaderSection) {
    throw new Error("Solo puedes ver integrantes de tu misma sección");
  }

  return true;
}

async function getStudentEvaluationCoverage(studentId, grade, filters = {}) {
  const coverageByStudent = await getEvaluationCoverageForStudents(
    [{ _id: studentId, grade }],
    filters
  );
  return coverageByStudent.get(String(studentId));
}

async function getAcademicCoverageForStudentDoc(student, filters = {}) {
  if (!student?.grade) throw new Error("El integrante no tiene nivel académico asignado");
  const academicYear = filters.academicYear || filters.year || new Date().getFullYear();
  const semester = normalizeSemester(filters.semester);

  const slotQuery = { academicYear: Number(academicYear), isActive: true };
  if (semester) slotQuery.semester = semester;

  const evalQuery = { student: student._id || student.id, academicYear: Number(academicYear) };
  if (semester) evalQuery.semester = semester;

  const [subjects, slots, evaluations] = await Promise.all([
    AcademicSubject.find({ isActive: true })
      .select("_id name code isActive bands grades subjectType scienceGroup order")
      .sort({ order: 1, name: 1 })
      .lean(),
    AcademicAssessmentSlot.find(slotQuery).sort({ semester: 1, order: 1 }).lean(),
    AcademicEvaluation.find(evalQuery)
      .select(EVAL_LIST_SELECT + " assessmentSlot academicYear semester evaluationType")
      .populate("subject", "name code isActive bands grades subjectType scienceGroup order _id")
      .populate("period", "name year academicYear semester order isActive _id")
      .populate("student", "name firstSurName email grade instrument avatar _id")
      .populate("reviewedByAdmin", "name firstSurName _id")
      .lean()
      .then(hydrateAssessmentSlots),
  ]);

  const requirements = requirementEngine.getExpectedRequirementsForStudentFromData(
    student,
    subjects,
    slots,
    { academicYear, semester }
  );
  const coverage = requirementEngine.buildAcademicCoverageForStudent(
    student,
    evaluations,
    requirements
  );

  return {
    ...coverage,
    studentId: String(student._id || student.id),
    student,
    academicYear: Number(academicYear),
    semester,
  };
}

async function getMyAcademicRequirements(academicYear, semester, ctx) {
  const user = requireStudentSelf(ctx);
  const student = await User.findById(user._id || user.id)
    .select("name firstSurName email grade instrument avatar _id")
    .lean();
  if (!student) throw new Error("Estudiante no encontrado");
  return getAcademicCoverageForStudentDoc(student, { academicYear, semester });
}

async function getStudentAcademicRequirements(studentId, academicYear, semester, ctx) {
  await requireStudentAccess(ctx, studentId);
  const student = await User.findById(studentId)
    .select("name firstSurName email grade instrument avatar _id")
    .lean();
  if (!student) throw new Error("Estudiante no encontrado");
  return getAcademicCoverageForStudentDoc(student, { academicYear, semester });
}

async function getAdminAcademicCoverage(filter = {}, ctx) {
  requireAdmin(ctx);
  const { academicYear, year, semester, grade, instrument, status } = filter;
  const query = { grade: { $nin: [null, ""] } };
  if (grade) query.grade = grade;
  if (instrument) query.instrument = new RegExp(escapeRegex(String(instrument).trim()), "i");

  const students = await User.find(query)
    .select("name firstSurName secondSurName email grade instrument avatar _id")
    .sort({ firstSurName: 1, secondSurName: 1, name: 1 })
    .lean();

  const results = await getAcademicCoverageForStudents(students, {
    academicYear: academicYear || year || new Date().getFullYear(),
    semester,
  });

  if (!status) return results;
  return results.filter((coverage) => {
    if (status === "missing") return coverage.summary.missingCount > 0;
    return coverage.requirements.some((requirement) => requirement.status === status);
  });
}

async function getAcademicCoverageForStudents(students, filters = {}) {
  if (!students.length) return [];
  const academicYear = filters.academicYear || filters.year || new Date().getFullYear();
  const semester = normalizeSemester(filters.semester);

  const slotQuery = { academicYear: Number(academicYear), isActive: true };
  if (semester) slotQuery.semester = semester;

  const [subjects, slots] = await Promise.all([
    AcademicSubject.find({ isActive: true })
      .select("_id name code isActive bands grades subjectType scienceGroup order")
      .sort({ order: 1, name: 1 })
      .lean(),
    AcademicAssessmentSlot.find(slotQuery).sort({ semester: 1, order: 1 }).lean(),
  ]);

  const studentIds = students.map((student) => student._id || student.id);
  const evalQuery = { student: { $in: studentIds }, academicYear: Number(academicYear) };
  if (semester) evalQuery.semester = semester;

  const evaluations = await AcademicEvaluation.find(evalQuery)
    .select(EVAL_LIST_SELECT + " assessmentSlot academicYear semester evaluationType")
    .populate("subject", "name code isActive bands grades subjectType scienceGroup order _id")
    .populate("period", "name year academicYear semester order isActive _id")
    .populate("student", "name firstSurName email grade instrument avatar _id")
    .populate("reviewedByAdmin", "name firstSurName _id")
    .lean()
    .then(hydrateAssessmentSlots);

  const evalsByStudent = new Map();
  for (const evaluation of evaluations) {
    const sid = String(evaluation.student?._id || evaluation.student);
    if (!evalsByStudent.has(sid)) evalsByStudent.set(sid, []);
    evalsByStudent.get(sid).push(evaluation);
  }

  return students.map((student) => {
    const requirements = requirementEngine.getExpectedRequirementsForStudentFromData(
      student,
      subjects,
      slots,
      { academicYear, semester }
    );
    const coverage = requirementEngine.buildAcademicCoverageForStudent(
      student,
      evalsByStudent.get(String(student._id || student.id)) || [],
      requirements
    );
    return {
      ...coverage,
      academicYear: Number(academicYear),
      semester,
    };
  });
}

async function getEvaluationCoverageForStudents(students, filters = {}) {
  if (students.length === 0) return new Map();

  const academicYear = filters.academicYear || filters.year || new Date().getFullYear();
  const semester = normalizeSemester(filters.semester);
  const slotQuery = { isActive: true, academicYear: Number(academicYear) };
  if (semester) slotQuery.semester = semester;

  const periodQuery = { isActive: true, year: Number(academicYear) };
  if (filters.periodId) periodQuery._id = filters.periodId;
  if (semester) periodQuery.semester = semester;

  const [subjects, slots, periods] = await Promise.all([
    AcademicSubject.find({
      isActive: true,
    })
      .select("_id name grades subjectType scienceGroup order")
      .lean(),
    AcademicAssessmentSlot.find(slotQuery).sort({ semester: 1, order: 1 }).lean(),
    AcademicPeriod.find(periodQuery).select("_id name year order").sort({ year: -1, order: 1 }).lean(),
  ]);

  const studentIds = students.map((student) => String(student._id || student.id));
  const subjectIds = subjects.map((subject) => subject._id);
  const slotIds = slots.map((slot) => slot._id);

  const evalQuery = {
    student: { $in: studentIds },
    subject: { $in: subjectIds },
    academicYear: Number(academicYear),
  };
  if (semester) evalQuery.semester = semester;
  if (slotIds.length > 0) evalQuery.assessmentSlot = { $in: slotIds };

  const evaluations = await AcademicEvaluation.find(evalQuery)
    .select("student subject period assessmentSlot academicYear semester status scoreNormalized100")
    .populate("subject", "name code isActive grades subjectType scienceGroup order _id")
    .populate("period", "name year academicYear semester order isActive _id")
    .lean()
    .then(hydrateAssessmentSlots);

  const evaluationsByStudent = new Map();
  for (const evaluation of evaluations) {
    const studentId = String(evaluation.student);
    if (!evaluationsByStudent.has(studentId)) evaluationsByStudent.set(studentId, []);
    evaluationsByStudent.get(studentId).push(evaluation);
  }

  return new Map(
    students.map((student) => {
      const studentId = String(student._id || student.id);
      const requirements = requirementEngine.getExpectedRequirementsForStudentFromData(
        student,
        subjects,
        slots,
        { academicYear, semester }
      );

      const coverage = requirementEngine.buildAcademicCoverageForStudent(
        student,
        evaluationsByStudent.get(studentId) || [],
        requirements
      );

      const periodsBySemester = new Map();
      for (const period of periods) {
        const sem = periodSemester(period);
        if (![1, 2].includes(sem)) continue;
        if (!periodsBySemester.has(sem)) periodsBySemester.set(sem, period);
      }

      const semesterGroups = new Map();
      for (const requirement of coverage.requirements) {
        if (!semesterGroups.has(requirement.semester)) semesterGroups.set(requirement.semester, []);
        semesterGroups.get(requirement.semester).push(requirement);
      }

      const coverageByPeriod = [...semesterGroups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([sem, items]) => {
          const period = periodsBySemester.get(Number(sem)) || periods[0] || {};
          const missing = items.filter((item) => !item.submitted);
          return {
            periodId: String(period._id || `${academicYear}-S${sem}`),
            periodName: period.name || `${sem === 1 ? "I" : "II"} Semestre`,
            year: Number(period.year || academicYear),
            semester: Number(sem),
            expectedEvaluationsCount: items.length,
            submittedEvaluationsCount: items.filter((item) => item.submitted).length,
            missingEvaluationsCount: missing.length,
            missingSubjects: missing.map((item) => ({
              subjectId: item.subjectId,
              subjectName: item.subjectName,
              assessmentSlotId: item.assessmentSlotId,
              slotKey: item.slotKey,
              slotLabel: item.slotLabel,
              evaluationType: item.evaluationType,
            })),
          };
        });

      return [
        studentId,
        {
          allEvaluationsSubmitted: coverage.summary.allSubmitted,
          expectedEvaluationsCount: coverage.summary.expectedCount,
          submittedEvaluationsCount: coverage.summary.submittedCount,
          missingEvaluationsCount: coverage.summary.missingCount,
          summary: coverage.summary,
          requirements: coverage.requirements,
          missingRequirements: coverage.missingRequirements,
          completedRequirements: coverage.completedRequirements,
          coverageByPeriod,
        },
      ];
    })
  );
}

// ─── Subjects ─────────────────────────────────────────────────────────────────

async function getAcademicSubjects({ grade, isActive } = {}, ctx) {
  requireAuth(ctx);
  const query = {};
  if (isActive !== undefined) query.isActive = isActive;
  if (grade) {
    Object.assign(query, buildSubjectGradeQuery(grade));
  }
  return AcademicSubject.find(query).sort({ name: 1 });
}

const SCIENCE_GROUPS = new Set(["GENERAL_SCIENCE", "BIOLOGY", "CHEMISTRY", "PHYSICS"]);

function validateSubjectInput(input, { requireCode = true } = {}) {
  const name = String(input.name || "").trim();
  const code = String(input.code || "").trim();
  const scienceGroup = input.scienceGroup ?? null;

  if (!name) throw new Error("El nombre de la materia es requerido");
  if (requireCode && !code) throw new Error("El código de la materia es requerido");
  if (code && !/^[A-Z0-9\-]+$/i.test(code)) {
    throw new Error("El código solo puede contener letras, números y guiones");
  }
  if (scienceGroup !== null && scienceGroup !== undefined && !SCIENCE_GROUPS.has(scienceGroup)) {
    throw new Error(`scienceGroup inválido. Valores permitidos: ${[...SCIENCE_GROUPS].join(", ")}`);
  }
}

async function createAcademicSubject(input, ctx) {
  requireAdmin(ctx);
  validateSubjectInput(input);
  const {
    name,
    code,
    isActive = true,
    bands = [],
    grades = [],
    subjectType = "EXAM_BASED",
    scienceGroup = null,
    order = 0,
  } = input;
  return AcademicSubject.create({
    name: name.trim(),
    code: code.trim(),
    isActive,
    bands,
    grades,
    subjectType,
    scienceGroup: scienceGroup || null,
    order,
  });
}

async function updateAcademicSubject(id, input, ctx) {
  requireAdmin(ctx);
  validateSubjectInput(input);
  const subject = await AcademicSubject.findById(id);
  if (!subject) throw new Error("Materia no encontrada");
  // Normalize grades/bands: treat null as [] so queries using $size:0 keep working
  const sanitized = { ...input };
  if (sanitized.grades == null) sanitized.grades = [];
  if (sanitized.bands == null) sanitized.bands = [];
  if (sanitized.name) sanitized.name = sanitized.name.trim();
  if (sanitized.code) sanitized.code = sanitized.code.trim();
  if (sanitized.scienceGroup === undefined || sanitized.scienceGroup === "") {
    sanitized.scienceGroup = null;
  }
  Object.assign(subject, sanitized);
  await subject.save();
  return subject;
}

async function deleteAcademicSubject(id, ctx) {
  requireAdmin(ctx);

  const subject = await AcademicSubject.findById(id);
  if (!subject) throw new Error("Materia no encontrada");

  const linkedEvaluations = await AcademicEvaluation.exists({ subject: id });
  if (linkedEvaluations) {
    throw new Error(
      "No se puede eliminar la materia porque ya tiene evaluaciones registradas. Puedes desactivarla en su lugar."
    );
  }

  await subject.deleteOne();
  return "Materia eliminada correctamente";
}

// ─── Periods ──────────────────────────────────────────────────────────────────

async function getAcademicPeriods({ year, isActive } = {}, ctx) {
  requireAuth(ctx);
  const query = {};
  if (year) query.year = year;
  if (isActive !== undefined) query.isActive = isActive;
  return AcademicPeriod.find(query).sort({ year: -1, semester: 1, order: 1 });
}

async function createAcademicPeriod(input, ctx) {
  requireAdmin(ctx);
  const { name, year, semester, order, isActive = true } = input;
  if (!name) throw new Error("El nombre del período es requerido");
  if (!year) throw new Error("El año es requerido");
  if (!semester) throw new Error("El semestre es requerido");
  if (order === undefined || order === null) throw new Error("El orden es requerido");
  return AcademicPeriod.create({ name, year, semester, academicYear: year, order, isActive });
}

async function updateAcademicPeriod(id, input, ctx) {
  requireAdmin(ctx);
  const period = await AcademicPeriod.findById(id);
  if (!period) throw new Error("Período no encontrado");
  if (input.semester === undefined || input.semester === null) {
    throw new Error("El semestre es requerido");
  }
  Object.assign(period, input);
  if (!period.academicYear && period.year) {
    period.academicYear = period.year;
  }
  await period.save();
  return period;
}

// ─── Assessment slots ────────────────────────────────────────────────────────

async function getAcademicAssessmentSlots({ academicYear, semester, isActive } = {}, ctx) {
  requireAuth(ctx);
  const query = {};
  if (academicYear) query.academicYear = Number(academicYear);
  if (semester) query.semester = normalizeSemester(semester);
  if (isActive !== undefined) query.isActive = isActive;
  return AcademicAssessmentSlot.find(query).sort({ academicYear: -1, semester: 1, order: 1 }).lean();
}

function sanitizeSlotInput(input) {
  const semester = normalizeSemester(input.semester);
  if (!input.academicYear) throw new Error("El año académico es requerido");
  if (!semester) throw new Error("El semestre es requerido");
  if (!input.slotKey) throw new Error("La clave del slot es requerida");
  if (!input.label) throw new Error("La etiqueta del slot es requerida");
  if (!["EXAM", "FINAL_GRADE"].includes(input.evaluationType)) {
    throw new Error("Tipo de evaluación inválido");
  }
  if (!["EXAM_BASED", "SEMESTER_FINAL_ONLY"].includes(input.subjectType)) {
    throw new Error("Tipo de materia inválido");
  }

  return {
    academicYear: Number(input.academicYear),
    semester,
    slotKey: String(input.slotKey).trim().toUpperCase(),
    label: String(input.label).trim(),
    evaluationType: input.evaluationType,
    subjectType: input.subjectType,
    appliesToGrades: Array.isArray(input.appliesToGrades) ? input.appliesToGrades.filter(Boolean) : [],
    excludedGrades: Array.isArray(input.excludedGrades) ? input.excludedGrades.filter(Boolean) : [],
    order: input.order ?? 0,
    isActive: input.isActive ?? true,
    requiresEvidence: input.requiresEvidence ?? true,
  };
}

async function createAcademicAssessmentSlot(input, ctx) {
  requireAdmin(ctx);
  return AcademicAssessmentSlot.create(sanitizeSlotInput(input));
}

async function updateAcademicAssessmentSlot(id, input, ctx) {
  requireAdmin(ctx);
  const slot = await AcademicAssessmentSlot.findById(id);
  if (!slot) throw new Error("Slot académico no encontrado");
  Object.assign(slot, sanitizeSlotInput(input));
  await slot.save();
  return slot;
}

async function deleteOrDeactivateAcademicAssessmentSlot(id, ctx) {
  requireAdmin(ctx);
  const slot = await AcademicAssessmentSlot.findById(id);
  if (!slot) throw new Error("Slot académico no encontrado");

  const linked = await AcademicEvaluation.exists({ assessmentSlot: id });
  if (linked) {
    slot.isActive = false;
    await slot.save();
    return "Slot académico desactivado correctamente";
  }

  await slot.deleteOne();
  return "Slot académico eliminado correctamente";
}

async function upsertSubject(seed) {
  const update = {
    $set: {
      name: seed.name,
      code: seed.code,
      subjectType: seed.subjectType,
      grades: seed.grades || [],
      bands: seed.bands || [],
      scienceGroup: seed.scienceGroup || null,
      order: seed.order || 0,
      isActive: true,
    },
  };
  const doc = await AcademicSubject.findOneAndUpdate(
    { name: seed.name },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return doc;
}

async function upsertPeriod(seed) {
  return AcademicPeriod.findOneAndUpdate(
    { year: seed.year, semester: seed.semester },
    { $set: seed },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

async function upsertSlot(seed) {
  return AcademicAssessmentSlot.findOneAndUpdate(
    { academicYear: seed.academicYear, slotKey: seed.slotKey },
    { $set: seed },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

async function seedAcademicRulesForYear(year, ctx) {
  requireAdmin(ctx);
  const academicYear = Number(year);
  if (!academicYear || academicYear < 2000) throw new Error("Año académico inválido");

  const primaryGrades = [...requirementEngine.PRIMARY_GRADES];

  const subjectSeeds = [
    { name: "Matemáticas", code: "MAT", subjectType: "EXAM_BASED", grades: [], order: 10 },
    { name: "Estudios Sociales", code: "SOC", subjectType: "EXAM_BASED", grades: [], order: 20 },
    { name: "Inglés Académico", code: "ING-ACA", subjectType: "EXAM_BASED", grades: [], order: 30 },
    { name: "Español", code: "ESP", subjectType: "EXAM_BASED", grades: [], order: 40 },
    {
      name: "Ciencias",
      code: "CIE",
      subjectType: "EXAM_BASED",
      grades: ["Septimo", "Octavo", "Noveno", ...primaryGrades],
      scienceGroup: "GENERAL_SCIENCE",
      order: 50,
    },
    {
      name: "Biología",
      code: "BIO",
      subjectType: "EXAM_BASED",
      grades: ["Undécimo", "Duodécimo"],
      scienceGroup: "BIOLOGY",
      order: 51,
    },
    {
      name: "Química",
      code: "QUI",
      subjectType: "EXAM_BASED",
      grades: ["Undécimo", "Duodécimo"],
      scienceGroup: "CHEMISTRY",
      order: 52,
    },
    {
      name: "Física Matemática",
      code: "FIS-MAT",
      subjectType: "EXAM_BASED",
      grades: ["Décimo"],
      scienceGroup: "PHYSICS",
      order: 53,
    },
    { name: "Ética", code: "ETI", subjectType: "SEMESTER_FINAL_ONLY", grades: [], order: 60 },
    { name: "Cívica", code: "CIV", subjectType: "SEMESTER_FINAL_ONLY", grades: [], order: 61 },
    {
      name: "Inglés Conversacional",
      code: "ING-CON",
      subjectType: "SEMESTER_FINAL_ONLY",
      grades: ["Septimo", "Octavo", "Noveno"],
      order: 62,
    },
    {
      name: "Inglés Técnico",
      code: "ING-TEC",
      subjectType: "SEMESTER_FINAL_ONLY",
      grades: ["Décimo", "Undécimo", "Duodécimo"],
      order: 63,
    },
    { name: "Religión", code: "REL", subjectType: "SEMESTER_FINAL_ONLY", grades: [], order: 64 },
  ];

  const periodSeeds = [
    { name: `I Semestre ${academicYear}`,  year: academicYear, academicYear, semester: 1, order: 1, isActive: true  },
    // El segundo semestre se crea desactivado — activar manualmente cuando corresponda
    { name: `II Semestre ${academicYear}`, year: academicYear, academicYear, semester: 2, order: 2, isActive: false },
  ];

  const slotSeeds = [
    {
      academicYear,
      semester: 1,
      slotKey: "S1_EXAM_1",
      label: "I Semestre - Evaluación 1",
      evaluationType: "EXAM",
      subjectType: "EXAM_BASED",
      appliesToGrades: [],
      excludedGrades: primaryGrades,
      order: 1,
      isActive: true,
      requiresEvidence: true,
    },
    {
      academicYear,
      semester: 1,
      slotKey: "S1_EXAM_2",
      label: "I Semestre - Evaluación 2",
      evaluationType: "EXAM",
      subjectType: "EXAM_BASED",
      appliesToGrades: [],
      excludedGrades: primaryGrades,
      order: 2,
      isActive: true,
      requiresEvidence: true,
    },
    // Semestre 2 — desactivado hasta apertura oficial
    {
      academicYear,
      semester: 2,
      slotKey: "S2_EXAM_1",
      label: "II Semestre - Evaluación 1",
      evaluationType: "EXAM",
      subjectType: "EXAM_BASED",
      appliesToGrades: [],
      excludedGrades: primaryGrades,
      order: 1,
      isActive: false,
      requiresEvidence: true,
    },
    {
      academicYear,
      semester: 2,
      slotKey: "S2_EXAM_2",
      label: "II Semestre - Evaluación 2",
      evaluationType: "EXAM",
      subjectType: "EXAM_BASED",
      appliesToGrades: [],
      excludedGrades: primaryGrades,
      order: 2,
      isActive: false,
      requiresEvidence: true,
    },
    {
      academicYear,
      semester: 1,
      slotKey: "S1_PRIMARY_EXAM",
      label: "I Semestre - Evaluación",
      evaluationType: "EXAM",
      subjectType: "EXAM_BASED",
      appliesToGrades: primaryGrades,
      excludedGrades: [],
      order: 1,
      isActive: true,
      requiresEvidence: true,
    },
    // Semestre 2 — desactivado hasta apertura oficial
    {
      academicYear,
      semester: 2,
      slotKey: "S2_PRIMARY_EXAM",
      label: "II Semestre - Evaluación",
      evaluationType: "EXAM",
      subjectType: "EXAM_BASED",
      appliesToGrades: primaryGrades,
      excludedGrades: [],
      order: 1,
      isActive: false,
      requiresEvidence: true,
    },
    {
      academicYear,
      semester: 1,
      slotKey: "S1_FINAL",
      label: "I Semestre - Nota final",
      evaluationType: "FINAL_GRADE",
      subjectType: "SEMESTER_FINAL_ONLY",
      appliesToGrades: [],
      excludedGrades: [],
      order: 3,
      isActive: true,
      requiresEvidence: true,
    },
    // Semestre 2 — desactivado hasta apertura oficial
    {
      academicYear,
      semester: 2,
      slotKey: "S2_FINAL",
      label: "II Semestre - Nota final",
      evaluationType: "FINAL_GRADE",
      subjectType: "SEMESTER_FINAL_ONLY",
      appliesToGrades: [],
      excludedGrades: [],
      order: 3,
      isActive: false,
      requiresEvidence: true,
    },
    // Nota final semestre 1 para materias EXAM_BASED (secundaria/bachillerato)
    {
      academicYear,
      semester: 1,
      slotKey: "S1_EXAM_FINAL",
      label: "I Semestre - Nota final",
      evaluationType: "FINAL_GRADE",
      subjectType: "EXAM_BASED",
      appliesToGrades: [],
      excludedGrades: primaryGrades,
      order: 3,
      isActive: true,
      requiresEvidence: false,
    },
    // Nota final semestre 1 para materias EXAM_BASED (primaria)
    {
      academicYear,
      semester: 1,
      slotKey: "S1_PRIMARY_FINAL",
      label: "I Semestre - Nota final",
      evaluationType: "FINAL_GRADE",
      subjectType: "EXAM_BASED",
      appliesToGrades: primaryGrades,
      excludedGrades: [],
      order: 2,
      isActive: true,
      requiresEvidence: false,
    },
    // Semestre 2 — desactivado hasta apertura oficial
    {
      academicYear,
      semester: 2,
      slotKey: "S2_EXAM_FINAL",
      label: "II Semestre - Nota final",
      evaluationType: "FINAL_GRADE",
      subjectType: "EXAM_BASED",
      appliesToGrades: [],
      excludedGrades: primaryGrades,
      order: 3,
      isActive: false,
      requiresEvidence: false,
    },
    {
      academicYear,
      semester: 2,
      slotKey: "S2_PRIMARY_FINAL",
      label: "II Semestre - Nota final",
      evaluationType: "FINAL_GRADE",
      subjectType: "EXAM_BASED",
      appliesToGrades: primaryGrades,
      excludedGrades: [],
      order: 2,
      isActive: false,
      requiresEvidence: false,
    },
  ];

  const [subjects, periods, slots] = await Promise.all([
    Promise.all(subjectSeeds.map(upsertSubject)),
    Promise.all(periodSeeds.map(upsertPeriod)),
    Promise.all(slotSeeds.map(upsertSlot)),
  ]);

  return {
    academicYear,
    subjectsUpserted: subjects.length,
    periodsUpserted: periods.length,
    slotsUpserted: slots.length,
    message: `Reglas académicas ${academicYear} inicializadas`,
  };
}

// ─── Semester activation ─────────────────────────────────────────────────────

async function toggleAcademicSemester(year, semester, activate, ctx) {
  requireAdmin(ctx);
  const academicYear = Number(year);
  const sem = Number(semester);
  if (!academicYear || academicYear < 2000) throw new Error("Año académico inválido");
  if (![1, 2].includes(sem)) throw new Error("El semestre debe ser 1 o 2");

  const [slotResult, periodResult] = await Promise.all([
    AcademicAssessmentSlot.updateMany(
      { academicYear, semester: sem },
      { $set: { isActive: activate } }
    ),
    AcademicPeriod.updateMany(
      { $or: [{ academicYear }, { year: academicYear }], semester: sem },
      { $set: { isActive: activate } }
    ),
  ]);

  const label = sem === 1 ? "I" : "II";
  const action = activate ? "habilitado" : "deshabilitado";
  return {
    success: true,
    academicYear,
    semester: sem,
    slotsAffected: slotResult.modifiedCount,
    periodsAffected: periodResult.modifiedCount,
    message: `${label} Semestre ${academicYear} ${action} correctamente (${slotResult.modifiedCount} slot(s), ${periodResult.modifiedCount} período(s))`,
  };
}

async function activateAcademicSemester(year, semester, ctx) {
  return toggleAcademicSemester(year, semester, true, ctx);
}

async function deactivateAcademicSemester(year, semester, ctx) {
  return toggleAcademicSemester(year, semester, false, ctx);
}

// ─── Evaluations — CRUD ───────────────────────────────────────────────────────

async function submitAcademicEvaluation(input, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);

  const {
    subjectId,
    periodId,
    assessmentSlotId,
    scoreRaw,
    scaleMin = 0,
    scaleMax = 100,
    evidenceUrl,
    evidencePublicId,
    evidenceResourceType = "image",
    evidenceOriginalName,
  } = input;

  if (!subjectId) throw new Error("La materia es requerida");
  if (!periodId) throw new Error("El período es requerido");
  if (!assessmentSlotId) throw new Error("La obligación académica es requerida");
  if (scoreRaw === undefined || scoreRaw === null) throw new Error("La nota es requerida");
  if (scaleMax <= scaleMin) throw new Error("scaleMax debe ser mayor que scaleMin");
  if (scoreRaw < scaleMin || scoreRaw > scaleMax) {
    throw new Error(`La nota debe estar entre ${scaleMin} y ${scaleMax}`);
  }

  const [subject, period, slot, studentFull] = await Promise.all([
    AcademicSubject.findById(subjectId),
    AcademicPeriod.findById(periodId),
    AcademicAssessmentSlot.findById(assessmentSlotId),
    User.findById(userId).select("grade").lean(),
  ]);

  if (!subject || !subject.isActive) throw new Error("Materia no encontrada o inactiva");
  if (!period || !period.isActive) throw new Error("Período no encontrado o inactivo");
  if (!slot || !slot.isActive) throw new Error("Obligación académica no encontrada o inactiva");

  // Verifica que el semestre del slot tenga un período activo — bloquea S2 mientras no esté habilitado
  const activeSemesterPeriod = await AcademicPeriod.findOne({
    $or: [{ academicYear: Number(slot.academicYear) }, { year: Number(slot.academicYear) }],
    semester: Number(slot.semester),
    isActive: true,
  }).lean();
  if (!activeSemesterPeriod) {
    const label = slot.semester === 1 ? "I" : "II";
    throw new Error(
      `El ${label} Semestre aún no está habilitado para recibir evaluaciones`
    );
  }

  if (!studentFull?.grade) throw new Error("Tu perfil no tiene nivel académico asignado");
  if (slot.requiresEvidence !== false && (!evidenceUrl || !evidencePublicId)) {
    throw new Error("La evidencia es requerida");
  }

  if (!requirementEngine.subjectAppliesToGrade(subject, studentFull.grade)) {
    throw new Error(`Esta materia no aplica al nivel ${studentFull.grade}`);
  }
  if (!requirementEngine.slotAppliesToGrade(slot, studentFull.grade)) {
    throw new Error(`Esta obligación académica no aplica al nivel ${studentFull.grade}`);
  }
  if (!requirementEngine.slotAppliesToSubject(slot, subject)) {
    throw new Error("La obligación académica no aplica al tipo de materia seleccionado");
  }

  const academicYear = Number(slot.academicYear);
  const semester = Number(slot.semester);
  if (periodAcademicYear(period) !== academicYear || periodSemester(period) !== semester) {
    throw new Error("El período no coincide con el año y semestre de la obligación académica");
  }

  const resolvedPeriod = await resolveCanonicalPeriodForSlot(period, slot);

  const existing = await AcademicEvaluation.exists({
    student: userId,
    subject: subjectId,
    academicYear,
    semester,
    assessmentSlot: assessmentSlotId,
  });
  if (existing) {
    throw new Error("Ya existe una evaluación para esta obligación académica");
  }

  const scoreNormalized100 = normalizeScore(scoreRaw, scaleMin, scaleMax);

  const evaluation = await AcademicEvaluation.create({
    student: userId,
    subject: subjectId,
    period: resolvedPeriod._id,
    assessmentSlot: assessmentSlotId,
    academicYear,
    semester,
    evaluationType: slot.evaluationType,
    scoreRaw,
    scaleMin,
    scaleMax,
    scoreNormalized100,
    evidenceUrl: evidenceUrl || "",
    evidencePublicId: evidencePublicId || "",
    evidenceResourceType,
    evidenceOriginalName,
    evidenceThumbnailUrl: evidencePublicId
      ? buildThumbnailUrl(evidencePublicId, evidenceResourceType)
      : null,
    evidencePreviewUrl: evidencePublicId
      ? buildPreviewUrl(evidencePublicId, evidenceResourceType)
      : null,
    status: "pending",
    submittedByStudentAt: new Date(),
    migrationStatus: "MIGRATED",
  });

  return loadEvaluationForGraphQL(evaluation._id);
}

async function updateOwnPendingEvaluation(id, input, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);

  const evaluation = await AcademicEvaluation.findById(id);
  if (!evaluation) throw new Error("Evaluación no encontrada");
  if (String(evaluation.student) !== userId) throw new Error("Solo puedes editar tus propias evaluaciones");
  if (evaluation.status === "approved") throw new Error("No puedes editar una evaluación ya aprobada");

  const {
    scoreRaw,
    scaleMin,
    scaleMax,
    evidenceUrl,
    evidencePublicId,
    evidenceResourceType,
    evidenceOriginalName,
  } = input;

  const newScaleMin = scaleMin ?? evaluation.scaleMin;
  const newScaleMax = scaleMax ?? evaluation.scaleMax;
  const newScoreRaw = scoreRaw ?? evaluation.scoreRaw;

  if (newScaleMax <= newScaleMin) throw new Error("scaleMax debe ser mayor que scaleMin");
  if (newScoreRaw < newScaleMin || newScoreRaw > newScaleMax) {
    throw new Error(`La nota debe estar entre ${newScaleMin} y ${newScaleMax}`);
  }

  const hasCorrections =
    newScoreRaw !== evaluation.scoreRaw ||
    newScaleMin !== evaluation.scaleMin ||
    newScaleMax !== evaluation.scaleMax ||
    (evidenceUrl && evidenceUrl !== evaluation.evidenceUrl) ||
    (evidencePublicId && evidencePublicId !== evaluation.evidencePublicId) ||
    (evidenceResourceType && evidenceResourceType !== evaluation.evidenceResourceType) ||
    (evidenceOriginalName !== undefined && evidenceOriginalName !== evaluation.evidenceOriginalName);

  if (evaluation.status === "rejected" && !hasCorrections) {
    throw new Error("Corrige la nota o reemplaza la evidencia antes de reenviar la evaluación");
  }

  evaluation.scoreRaw = newScoreRaw;
  evaluation.scaleMin = newScaleMin;
  evaluation.scaleMax = newScaleMax;
  evaluation.scoreNormalized100 = normalizeScore(newScoreRaw, newScaleMin, newScaleMax);
  if (evidenceUrl) evaluation.evidenceUrl = evidenceUrl;
  if (evidencePublicId) {
    evaluation.evidencePublicId = evidencePublicId;
    const resType = evidenceResourceType || evaluation.evidenceResourceType;
    evaluation.evidenceThumbnailUrl = buildThumbnailUrl(evidencePublicId, resType);
    evaluation.evidencePreviewUrl = buildPreviewUrl(evidencePublicId, resType);
  }
  if (evidenceResourceType) evaluation.evidenceResourceType = evidenceResourceType;
  if (evidenceOriginalName !== undefined) evaluation.evidenceOriginalName = evidenceOriginalName;

  // Si estaba rechazada, vuelve a pending
  if (evaluation.status === "rejected") {
    evaluation.status = "pending";
    evaluation.submittedByStudentAt = new Date();
    evaluation.reviewedByAdmin = undefined;
    evaluation.reviewedAt = undefined;
    evaluation.reviewComment = undefined;
  }

  await evaluation.save();
  return loadEvaluationForGraphQL(evaluation._id);
}

async function updateAcademicEvaluationAsAdmin(id, input, ctx) {
  requireAdmin(ctx);

  const evaluation = await AcademicEvaluation.findById(id);
  if (!evaluation) throw new Error("Evaluación no encontrada");

  const { scoreRaw, scaleMin, scaleMax } = input;

  const newScaleMin = scaleMin ?? evaluation.scaleMin;
  const newScaleMax = scaleMax ?? evaluation.scaleMax;
  const newScoreRaw = scoreRaw ?? evaluation.scoreRaw;

  if (newScaleMax <= newScaleMin) throw new Error("scaleMax debe ser mayor que scaleMin");
  if (newScoreRaw < newScaleMin || newScoreRaw > newScaleMax) {
    throw new Error(`La nota debe estar entre ${newScaleMin} y ${newScaleMax}`);
  }

  evaluation.scoreRaw = newScoreRaw;
  evaluation.scaleMin = newScaleMin;
  evaluation.scaleMax = newScaleMax;
  evaluation.scoreNormalized100 = normalizeScore(newScoreRaw, newScaleMin, newScaleMax);

  await evaluation.save();
  return loadEvaluationForGraphQL(evaluation._id);
}

async function deleteAcademicEvaluationAsAdmin(id, ctx) {
  requireAdmin(ctx);

  const evaluation = await AcademicEvaluation.findById(id);
  if (!evaluation) throw new Error("Evaluación no encontrada");

  await evaluation.deleteOne();
  return "Evaluación eliminada correctamente";
}

async function deleteOwnPendingEvaluation(id, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);

  const evaluation = await AcademicEvaluation.findById(id);
  if (!evaluation) throw new Error("Evaluación no encontrada");
  if (String(evaluation.student) !== userId) throw new Error("Solo puedes eliminar tus propias evaluaciones");
  if (evaluation.status === "approved") throw new Error("No puedes eliminar una evaluación aprobada");

  await evaluation.deleteOne();
  return "Evaluación eliminada correctamente";
}

async function reviewAcademicEvaluation(id, status, reviewComment, ctx) {
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Estado inválido. Use 'approved' o 'rejected'");
  }

  const actor = requireAuth(ctx);
  const evaluation = await AcademicEvaluation.findById(id);
  if (!evaluation) throw new Error("Evaluación no encontrada");

  let reviewer;
  if (isAdmin(actor)) {
    reviewer = actor;
  } else {
    reviewer = await requireSectionReviewerAccessToStudent(ctx, evaluation.student);
    if (evaluation.status !== "pending") {
      const populated = await evaluation.populate([
        "student",
        "subject",
        "period",
        "assessmentSlot",
        "reviewedByAdmin",
      ]);
      return (await hydrateAssessmentSlots([populated]))[0];
    }
  }

  evaluation.status = status;
  evaluation.reviewedByAdmin = String(reviewer._id || reviewer.id);
  evaluation.reviewedAt = new Date();
  evaluation.reviewComment = reviewComment || null;

  await evaluation.save();
  return loadEvaluationForGraphQL(evaluation._id);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

// Campos de lista: excluye evidenceUrl (imagen original pesada).
// El frontend usa evidenceThumbnailUrl para el thumbnail en tabla.
// Para ver la imagen completa, se usa GET_EVALUATION_DETAIL (lazy, solo en modal).
const EVAL_LIST_SELECT =
  "student subject period assessmentSlot academicYear semester evaluationType migrationStatus " +
  "scoreRaw scaleMin scaleMax scoreNormalized100 " +
  "status submittedByStudentAt reviewedAt reviewComment " +
  "parentAcknowledged parentAcknowledgedAt parentComment " +
  "evidenceThumbnailUrl evidencePublicId evidenceResourceType evidenceOriginalName " +
  "createdAt updatedAt";

async function getMyEvaluations(filter = {}, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);

  const query = { student: userId };
  if (filter.periodId) query.period = new mongoose.Types.ObjectId(String(filter.periodId));
  if (filter.subjectId) query.subject = new mongoose.Types.ObjectId(String(filter.subjectId));
  if (filter.status) query.status = filter.status;

  return AcademicEvaluation.find(query)
    .select(EVAL_LIST_SELECT)
    .populate("subject", "name code isActive bands grades subjectType scienceGroup order _id")
    .populate("period", "name year academicYear semester order isActive _id")
    .populate("reviewedByAdmin", "name firstSurName _id")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()
    .then(hydrateAssessmentSlots);
}

async function getStudentEvaluations(studentId, filter = {}, ctx) {
  await requireStudentAccess(ctx, studentId);

  const query = { student: studentId };
  if (filter.periodId) query.period = new mongoose.Types.ObjectId(String(filter.periodId));
  if (filter.subjectId) query.subject = new mongoose.Types.ObjectId(String(filter.subjectId));
  if (filter.status) query.status = filter.status;

  return AcademicEvaluation.find(query)
    .select(EVAL_LIST_SELECT + " student")
    .populate("subject", "name code isActive bands grades subjectType scienceGroup order _id")
    .populate("period", "name year academicYear semester order isActive _id")
    .populate("student", "name firstSurName email grade instrument _id")
    .populate("reviewedByAdmin", "name firstSurName _id")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()
    .then(hydrateAssessmentSlots);
}

/**
 * Detalle completo de una evaluación (incluyendo evidenceUrl original).
 * Solo se llama cuando el usuario abre el modal de detalle.
 */
async function getEvaluationDetail(id, ctx) {
  const user = requireAuth(ctx);

  const evaluation = await AcademicEvaluation.findById(id)
    .populate("subject", "name code isActive bands grades subjectType scienceGroup order _id")
    .populate("period", "name year academicYear semester order _id")
    .populate("student", "name firstSurName email grade instrument avatar _id")
    .populate("reviewedByAdmin", "name firstSurName email _id")
    .lean();

  if (!evaluation) throw new Error("Evaluación no encontrada");
  const hydratedEvaluation = (await hydrateAssessmentSlots([evaluation]))[0];

  const studentId = String(hydratedEvaluation.student?._id || hydratedEvaluation.student);

  // Admin: acceso total
  if (isAdmin(user)) return hydratedEvaluation;

  // Padre: acceso a sus hijos
  if (user.entityType === "Parent") {
    await requireParentChildAccess(ctx, studentId);
    return hydratedEvaluation;
  }

  // El mismo estudiante
  if (String(user._id || user.id) === studentId) return hydratedEvaluation;

  // Principal de sección con acceso al estudiante
  if (await hasSectionStudentAccess(user, studentId)) return hydratedEvaluation;

  throw new Error("No autorizado");
}

// ─── Performance calculation ──────────────────────────────────────────────────

function buildRiskReasons({ avgGeneral, coveragePercentage, riskSubjects, trendDelta, approvedCount, pendingCount }) {
  const RULES = requirementEngine.RISK_RULES;

  if (approvedCount === 0) {
    if (pendingCount > 0) {
      return [`Sin evaluaciones aprobadas aún (${pendingCount} pendiente${pendingCount !== 1 ? "s" : ""} de revisión). El promedio se calculará cuando se aprueben.`];
    }
    return ["Sin evaluaciones registradas todavía."];
  }

  const avg = Math.round(avgGeneral * 10) / 10;
  const cov = Math.round(coveragePercentage);
  const reasons = [];

  if (avg < RULES.redAverageBelow) {
    reasons.push(`Promedio de ${avg}/100 — por debajo del mínimo aprobatorio (70).`);
  } else if (avg < RULES.yellowAverageBelow) {
    reasons.push(`Promedio de ${avg}/100 — en zona de alerta (se requiere superar 80 para estar en verde).`);
  } else {
    reasons.push(`Promedio de ${avg}/100 — satisfactorio.`);
  }

  if (cov < RULES.redCoverageBelow) {
    reasons.push(`Cobertura del ${cov}% — muy baja. Faltan muchas evaluaciones por entregar (mínimo requerido: 60%).`);
  } else if (cov <= RULES.yellowCoverageBelowOrEqual) {
    reasons.push(`Cobertura del ${cov}% — incompleta. Aún faltan evaluaciones por entregar.`);
  }

  const belowThreshold = riskSubjects.filter((s) => s.reason === "BELOW_THRESHOLD");
  const belowGeneral = riskSubjects.filter((s) => s.reason === "BELOW_GENERAL");

  if (belowThreshold.length > 0) {
    const names = belowThreshold.map((s) => `${s.subjectName} (${s.average})`).join(", ");
    reasons.push(`${belowThreshold.length === 1 ? "1 materia" : `${belowThreshold.length} materias`} con nota por debajo de 70: ${names}.`);
  }
  if (belowGeneral.length > 0) {
    const names = belowGeneral.map((s) => `${s.subjectName} (${s.average})`).join(", ");
    reasons.push(`${belowGeneral.length === 1 ? "1 materia" : `${belowGeneral.length} materias`} muy por debajo del promedio general: ${names}.`);
  }

  if (trendDelta <= -10) {
    reasons.push(`Caída importante: el promedio bajó ${Math.abs(trendDelta)} puntos respecto al período anterior.`);
  } else if (trendDelta <= -5) {
    reasons.push(`Tendencia a la baja: bajó ${Math.abs(trendDelta)} puntos respecto al período anterior.`);
  } else if (trendDelta >= 10) {
    reasons.push(`Tendencia positiva: el promedio subió ${trendDelta} puntos respecto al período anterior.`);
  }

  return reasons;
}

/**
 * Versión SINCRÓNICA de cálculo de rendimiento.
 * Recibe datos pre-cargados — cero queries adicionales a MongoDB.
 * Usada por las funciones bulk (dashboard, riskRanking, sectionOverview)
 * para transformar 150×2=300 queries en 0 queries extras.
 */
function computePerformanceFromData(studentId, approvedEvals, allEvals, filters = {}) {
  const { periodId, year } = filters;
  const coverageSummary = filters.coverageSummary || null;

  const approvedCount = allEvals.filter((e) => e.status === "approved").length;
  const pendingCount = allEvals.filter((e) => e.status === "pending").length;
  const rejectedCount = allEvals.filter((e) => e.status === "rejected").length;

  let filteredEvals = approvedEvals;
  if (periodId) {
    filteredEvals = approvedEvals.filter(
      (e) => String(e.period?._id || e.period) === String(periodId)
    );
  } else if (year) {
    filteredEvals = approvedEvals.filter((e) => e.period?.year === Number(year));
  }

  if (filteredEvals.length === 0) {
    return {
      studentId: String(studentId),
      averageGeneral: 0,
      approvedCount,
      pendingCount,
      rejectedCount,
      averagesBySubject: [],
      strongestSubjects: [],
      weakestSubjects: [],
      trendDirection: "STABLE",
      trendDelta: 0,
      riskSubjects: [],
      riskScore: 0,
      riskLevel: requirementEngine.calculateRiskLevel({
        averageFromSubmittedApproved: 0,
        coveragePercentage: coverageSummary?.coveragePercentage ?? 100,
      }),
      riskReasons: buildRiskReasons({
        avgGeneral: 0,
        coveragePercentage: coverageSummary?.coveragePercentage ?? 100,
        riskSubjects: [],
        trendDelta: 0,
        approvedCount,
        pendingCount,
      }),
      averageFromSubmittedApproved: 0,
      coveragePercentage: coverageSummary?.coveragePercentage ?? 100,
      expectedCount: coverageSummary?.expectedCount ?? 0,
      submittedCount: coverageSummary?.submittedCount ?? allEvals.length,
      missingCount: coverageSummary?.missingCount ?? 0,
      averagesBySemester: [],
      averagesByEvaluationType: [],
      recentEvaluations: [],
    };
  }

  const avgGeneral =
    filteredEvals.reduce((sum, e) => sum + e.scoreNormalized100, 0) / filteredEvals.length;

  const subjectMap = {};
  for (const e of filteredEvals) {
    const sid = String(e.subject?._id || e.subject);
    const sName = e.subject?.name || "Sin materia";
    if (!subjectMap[sid]) subjectMap[sid] = { subjectId: sid, subjectName: sName, scores: [] };
    subjectMap[sid].scores.push(e.scoreNormalized100);
  }

  const averagesBySubject = Object.values(subjectMap).map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    average: Math.round((s.scores.reduce((sum, v) => sum + v, 0) / s.scores.length) * 10) / 10,
    evaluationCount: s.scores.length,
  }));

  const sortedByAvg = [...averagesBySubject].sort((a, b) => b.average - a.average);
  const strongestSubjects = sortedByAvg.slice(0, 3);
  const weakestSubjects = sortedByAvg.slice(-3).reverse();

  let trendDirection = "STABLE";
  let trendDelta = 0;
  const byPeriod = {};
  for (const e of approvedEvals) {
    const pid = String(e.period?._id || e.period);
    if (!byPeriod[pid]) byPeriod[pid] = { period: e.period, scores: [] };
    byPeriod[pid].scores.push(e.scoreNormalized100);
  }
  const sortedPeriods = Object.values(byPeriod).sort((a, b) => {
    if (a.period?.year !== b.period?.year) return (a.period?.year || 0) - (b.period?.year || 0);
    return (a.period?.order || 0) - (b.period?.order || 0);
  });
  if (sortedPeriods.length >= 2) {
    const latest = sortedPeriods[sortedPeriods.length - 1];
    const previous = sortedPeriods[sortedPeriods.length - 2];
    const latestAvg = latest.scores.reduce((s, v) => s + v, 0) / latest.scores.length;
    const previousAvg = previous.scores.reduce((s, v) => s + v, 0) / previous.scores.length;
    trendDelta = Math.round((latestAvg - previousAvg) * 10) / 10;
    trendDirection = trendDelta > 5 ? "UP" : trendDelta < -5 ? "DOWN" : "STABLE";
  }

  const riskSubjects = averagesBySubject
    .filter((s) => s.average < 70 || avgGeneral - s.average >= 10)
    .map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      average: s.average,
      reason: s.average < 70 ? "BELOW_THRESHOLD" : "BELOW_GENERAL",
    }));

  const riskScore = riskSubjects.length;
  const coveragePercentage = coverageSummary?.coveragePercentage ?? 100;
  let riskLevel = requirementEngine.calculateRiskLevel({
    averageFromSubmittedApproved: avgGeneral,
    coveragePercentage,
  });
  if (riskLevel !== "RED" && (riskScore >= 2 || trendDelta <= -10)) riskLevel = "RED";
  if (riskLevel === "GREEN" && riskScore === 1) riskLevel = "YELLOW";

  const semesterMap = {};
  const evaluationTypeMap = {};
  for (const e of filteredEvals) {
    const semester = e.semester || e.period?.semester || periodSemester(e.period);
    if (![1, 2].includes(Number(semester))) continue;
    const evaluationType = e.evaluationType || "EXAM";
    if (!semesterMap[semester]) semesterMap[semester] = [];
    if (!evaluationTypeMap[evaluationType]) evaluationTypeMap[evaluationType] = [];
    semesterMap[semester].push(e.scoreNormalized100);
    evaluationTypeMap[evaluationType].push(e.scoreNormalized100);
  }
  const averagesBySemester = Object.entries(semesterMap).map(([semester, scores]) => ({
    semester: Number(semester),
    average: Math.round((scores.reduce((sum, v) => sum + v, 0) / scores.length) * 10) / 10,
    evaluationCount: scores.length,
  }));
  const averagesByEvaluationType = Object.entries(evaluationTypeMap).map(([evaluationType, scores]) => ({
    evaluationType,
    average: Math.round((scores.reduce((sum, v) => sum + v, 0) / scores.length) * 10) / 10,
    evaluationCount: scores.length,
  }));

  return {
    studentId: String(studentId),
    averageGeneral: Math.round(avgGeneral * 10) / 10,
    averageFromSubmittedApproved: Math.round(avgGeneral * 10) / 10,
    coveragePercentage,
    expectedCount: coverageSummary?.expectedCount ?? allEvals.length,
    submittedCount: coverageSummary?.submittedCount ?? allEvals.length,
    missingCount: coverageSummary?.missingCount ?? 0,
    approvedCount,
    pendingCount,
    rejectedCount,
    averagesBySubject,
    averagesBySemester,
    averagesByEvaluationType,
    strongestSubjects,
    weakestSubjects,
    trendDirection,
    trendDelta,
    riskSubjects,
    riskScore,
    riskLevel,
    riskReasons: buildRiskReasons({
      avgGeneral,
      coveragePercentage,
      riskSubjects,
      trendDelta,
      approvedCount,
      pendingCount,
    }),
    recentEvaluations: filteredEvals.slice(-5).reverse(),
  };
}

/**
 * Calcula el rendimiento de un estudiante individual (con queries propias).
 * Solo para contextos donde NO se tiene un dataset pre-cargado
 * (student detail, parent, section leader per-student).
 */
async function calculateStudentPerformance(studentId, filters = {}) {
  const { periodId, year } = filters;

  const [allApproved, allEvals, student] = await Promise.all([
    AcademicEvaluation.find({ student: studentId, status: "approved" })
      .select("subject period assessmentSlot academicYear semester evaluationType scoreNormalized100 status createdAt")
      .populate("subject", "name _id")
      .populate("period", "name year academicYear semester order _id")
      .sort({ createdAt: 1 })
      .lean(),
    AcademicEvaluation.find({ student: studentId })
      .select("status")
      .lean(),
    User.findById(studentId).select("_id grade").lean(),
  ]);

  let coverageSummary = null;
  if (student?.grade) {
    try {
      const coverage = await getAcademicCoverageForStudentDoc(student, {
        academicYear: year || new Date().getFullYear(),
      });
      coverageSummary = coverage.summary;
    } catch (e) {
      coverageSummary = null;
    }
  }

  return computePerformanceFromData(studentId, allApproved, allEvals, {
    periodId,
    year,
    coverageSummary,
  });
}

async function getMyPerformance(periodId, year, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);
  return calculateStudentPerformance(userId, { periodId, year });
}

async function getMyEvaluationCoverage(year, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);
  const student = await User.findById(userId).select("_id grade").lean();
  if (!student) throw new Error("Estudiante no encontrado");
  return getStudentEvaluationCoverage(userId, student.grade, { year });
}

async function getStudentPerformance(studentId, periodId, year, ctx) {
  await requireStudentAccess(ctx, studentId);
  return calculateStudentPerformance(studentId, { periodId, year });
}

// ─── Admin dashboard ──────────────────────────────────────────────────────────

async function getAdminDashboard(filter = {}, ctx) {
  requireAdmin(ctx);
  const t0 = Date.now();
  const { periodId, year, grade, band, instrument } = filter;

  // ── OPTIMIZACIÓN: 2 queries en lugar de 150×2=300 ────────────────────────────
  // Cargamos TODOS los datos una vez y computamos performance en memoria.
  const approvedQuery = { status: "approved" };
  if (periodId) approvedQuery.period = new mongoose.Types.ObjectId(String(periodId));

  // Query 1: todas las evaluaciones aprobadas con joins necesarios
  // Query 2: conteos de estado por estudiante (solo _id + status)
  const [approvedEvals, allEvalsCounts] = await Promise.all([
    AcademicEvaluation.find(approvedQuery)
      .select("student subject period scoreNormalized100 createdAt")
      .populate("subject", "name _id")
      .populate("period", "name year order _id")
      .populate("student", "name firstSurName grade bands instrument _id")
      .lean(),
    AcademicEvaluation.find({})
      .select("student status")
      .lean(),
  ]);

  // Aplicar filtros JS solo para campos que no pueden indexarse fácilmente
  let filtered = approvedEvals;
  if (grade) filtered = filtered.filter((e) => e.student?.grade === grade);
  if (band) filtered = filtered.filter((e) => (e.student?.bands || []).includes(band));
  if (instrument) filtered = filtered.filter((e) =>
    e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
  );
  if (year) filtered = filtered.filter((e) => e.period?.year === Number(year));

  const studentIds = [...new Set(filtered.map((e) => String(e.student?._id || e.student)))];

  if (studentIds.length === 0) {
    return {
      totalStudentsWithData: 0,
      studentsInGreen: 0,
      studentsInYellow: 0,
      studentsInRed: 0,
      worstPerformers: [],
      mostImproved: [],
      mostDeclined: [],
      subjectPerformanceSummary: [],
      periodComparisonSummary: [],
    };
  }

  // Agrupar datos por estudiante en O(n) — sin queries adicionales
  const approvedByStudent = {};
  const allByStudent = {};
  for (const e of filtered) {
    const sid = String(e.student?._id || e.student);
    if (!approvedByStudent[sid]) approvedByStudent[sid] = [];
    approvedByStudent[sid].push(e);
  }
  for (const e of allEvalsCounts) {
    const sid = String(e.student);
    if (studentIds.includes(sid)) {
      if (!allByStudent[sid]) allByStudent[sid] = [];
      allByStudent[sid].push(e);
    }
  }

  // Computar performance de cada estudiante SINCRÓNICAMENTE — 0 queries extra
  const performances = studentIds.map((sid) => {
    const approved = approvedByStudent[sid] || [];
    const all = allByStudent[sid] || [];
    const perf = computePerformanceFromData(sid, approved, all, { periodId, year });
    const studentDoc = approved[0]?.student;
    perf.studentName = studentDoc ? `${studentDoc.name} ${studentDoc.firstSurName}` : "Desconocido";
    perf.recentEvaluations = [];
    return perf;
  });

  console.log(
    `[adminDashboard] ${studentIds.length} estudiantes, ${filtered.length} evals, ${Date.now() - t0}ms (2 queries)`
  );

  const studentsInGreen = performances.filter((p) => p.riskLevel === "GREEN").length;
  const studentsInYellow = performances.filter((p) => p.riskLevel === "YELLOW").length;
  const studentsInRed = performances.filter((p) => p.riskLevel === "RED").length;

  const sortedByAvg = [...performances].sort((a, b) => a.averageGeneral - b.averageGeneral);
  const sortedByTrend = [...performances].sort((a, b) => b.trendDelta - a.trendDelta);

  const worstPerformers = sortedByAvg.slice(0, 10);
  const mostImproved = sortedByTrend.filter((p) => p.trendDelta > 0).slice(0, 10);
  const mostDeclined = sortedByTrend.filter((p) => p.trendDelta < 0).reverse().slice(0, 10);

  // Resumen por materia
  const subjectMap = {};
  for (const e of filtered) {
    const sid = String(e.subject?._id || e.subject);
    if (!subjectMap[sid]) {
      subjectMap[sid] = {
        subjectId: sid,
        subjectName: e.subject?.name || "Sin materia",
        scores: [],
        atRiskCount: 0,
      };
    }
    subjectMap[sid].scores.push(e.scoreNormalized100);
  }

  // Marcar materias en riesgo
  for (const perf of performances) {
    for (const rs of perf.riskSubjects) {
      if (subjectMap[rs.subjectId]) subjectMap[rs.subjectId].atRiskCount++;
    }
  }

  const subjectPerformanceSummary = Object.values(subjectMap).map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    overallAverage:
      Math.round((s.scores.reduce((sum, v) => sum + v, 0) / s.scores.length) * 10) / 10,
    studentsCount: new Set(
      filtered
        .filter((e) => String(e.subject?._id || e.subject) === s.subjectId)
        .map((e) => String(e.student?._id || e.student))
    ).size,
    atRiskCount: s.atRiskCount,
  }));

  // Resumen por período
  const periodMap = {};
  for (const e of filtered) {
    const pid = String(e.period?._id || e.period);
    if (!periodMap[pid]) {
      periodMap[pid] = {
        periodId: pid,
        periodName: e.period?.name || "Sin período",
        year: e.period?.year || 0,
        scores: [],
        studentIds: new Set(),
      };
    }
    periodMap[pid].scores.push(e.scoreNormalized100);
    periodMap[pid].studentIds.add(String(e.student?._id || e.student));
  }

  const periodComparisonSummary = Object.values(periodMap)
    .map((p) => ({
      periodId: p.periodId,
      periodName: p.periodName,
      year: p.year,
      overallAverage:
        Math.round((p.scores.reduce((sum, v) => sum + v, 0) / p.scores.length) * 10) / 10,
      studentsCount: p.studentIds.size,
    }))
    .sort((a, b) => a.year - b.year);

  return {
    totalStudentsWithData: studentIds.length,
    studentsInGreen,
    studentsInYellow,
    studentsInRed,
    worstPerformers,
    mostImproved,
    mostDeclined,
    subjectPerformanceSummary,
    periodComparisonSummary,
  };
}

async function getAdminPendingEvaluations(filter = {}, ctx) {
  requireAdmin(ctx);
  const { periodId, grade, subjectId, instrument } = filter;

  const query = { status: "pending" };
  if (periodId) query.period = new mongoose.Types.ObjectId(String(periodId));
  if (subjectId) query.subject = new mongoose.Types.ObjectId(String(subjectId));

  // Filtro de grado server-side: obtener studentIds primero (evita JS post-filter)
  if (grade) {
    const matchingStudents = await User.find({ grade }).select("_id").lean();
    query.student = { $in: matchingStudents.map((s) => s._id) };
  }

  const evals = await AcademicEvaluation.find(query)
    .select(EVAL_LIST_SELECT + " student")
    .populate("student", "name firstSurName email grade instrument _id")
    .populate("subject", "name code _id")
    .populate("period", "name year order _id")
    .sort({ submittedByStudentAt: 1 })
    .lean()
    .then(hydrateAssessmentSlots);

  // Filtro de instrumento en JS (no indexable directamente)
  if (instrument) {
    return evals.filter((e) =>
      e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
    );
  }
  return evals;
}

/**
 * Versión paginada de evaluaciones pendientes — para admin con muchos pendientes.
 * Usa cursor pagination basado en submittedByStudentAt.
 */
async function getAdminPendingEvaluationsPaginated(filter = {}, pagination = {}, ctx) {
  requireAdmin(ctx);
  const { periodId, grade, subjectId, instrument } = filter;
  const { limit = 25, cursor } = pagination;
  const pageLimit = Math.min(Number(limit) || 25, 100);

  const query = { status: "pending" };
  if (periodId) query.period = new mongoose.Types.ObjectId(String(periodId));
  if (subjectId) query.subject = new mongoose.Types.ObjectId(String(subjectId));
  if (cursor) query.submittedByStudentAt = { $lte: new Date(cursor) };

  if (grade) {
    const matchingStudents = await User.find({ grade }).select("_id").lean();
    query.student = { $in: matchingStudents.map((s) => s._id) };
  }

  const evals = await AcademicEvaluation.find(query)
    .select(EVAL_LIST_SELECT + " student")
    .populate("student", "name firstSurName email grade instrument _id")
    .populate("subject", "name code _id")
    .populate("period", "name year order _id")
    .sort({ submittedByStudentAt: -1 })
    .limit(pageLimit + 1)
    .lean()
    .then(hydrateAssessmentSlots);

  let items = evals;
  if (instrument) {
    items = items.filter((e) =>
      e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
    );
  }

  const hasNextPage = items.length > pageLimit;
  const page = hasNextPage ? items.slice(0, pageLimit) : items;
  const nextCursor = hasNextPage
    ? page[page.length - 1].submittedByStudentAt?.toISOString() || null
    : null;

  return { items: page, hasNextPage, nextCursor };
}

async function getAdminAcademicStudents(filter = {}, ctx) {
  requireAdmin(ctx);
  const { grade, instrument, periodId, year } = filter;

  const query = {
    grade: { $nin: [null, ""] },
  };

  if (grade) {
    query.grade = grade;
  }

  if (instrument) {
    query.instrument = new RegExp(escapeRegex(String(instrument).trim()), "i");
  }

  const students = await User.find(query)
    .select("name firstSurName secondSurName email grade instrument avatar")
    .sort({ firstSurName: 1, secondSurName: 1, name: 1 })
    .lean();

  const coverageByStudent = await getEvaluationCoverageForStudents(students, { periodId, year });
  return students.map((student) => ({
    ...student,
    ...coverageByStudent.get(String(student._id)),
  }));
}

async function getAdminRiskRanking(filter = {}, limit = 20, ctx) {
  requireAdmin(ctx);
  const { periodId, year, grade, instrument } = filter;

  const approvedQuery = { status: "approved" };
  if (periodId) approvedQuery.period = new mongoose.Types.ObjectId(String(periodId));

  // allEvals now populates student so we can filter by grade/instrument for pending-only students
  const [approvedEvals, allEvals] = await Promise.all([
    AcademicEvaluation.find(approvedQuery)
      .select("student subject period scoreNormalized100 createdAt")
      .populate("subject", "name _id")
      .populate("period", "name year order _id")
      .populate("student", "name firstSurName grade bands instrument _id")
      .lean(),
    AcademicEvaluation.find({})
      .select("student status")
      .populate("student", "name firstSurName grade instrument _id")
      .lean(),
  ]);

  // Filter approved by grade/instrument/year
  let filteredApproved = approvedEvals;
  if (grade) filteredApproved = filteredApproved.filter((e) => e.student?.grade === grade);
  if (instrument) filteredApproved = filteredApproved.filter((e) =>
    e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
  );
  if (year) filteredApproved = filteredApproved.filter((e) => e.period?.year === Number(year));

  // Filter all evals by grade/instrument to discover pending-only students
  let filteredAll = allEvals;
  if (grade) filteredAll = filteredAll.filter((e) => e.student?.grade === grade);
  if (instrument) filteredAll = filteredAll.filter((e) =>
    e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
  );

  // Union: students from approved + students who only have pending/rejected evals
  const approvedStudentSet = new Set(
    filteredApproved.map((e) => String(e.student?._id || e.student))
  );
  const allStudentIds = [
    ...new Set([
      ...approvedStudentSet,
      ...filteredAll.map((e) => String(e.student?._id || e.student)).filter(Boolean),
    ]),
  ];

  const approvedByStudent = {};
  const allByStudent = {};
  const studentDocById = {};

  for (const e of filteredApproved) {
    const sid = String(e.student?._id || e.student);
    if (!approvedByStudent[sid]) approvedByStudent[sid] = [];
    approvedByStudent[sid].push(e);
    if (e.student?._id && !studentDocById[sid]) studentDocById[sid] = e.student;
  }
  for (const e of filteredAll) {
    const sid = String(e.student?._id || e.student);
    if (!sid) continue;
    if (!allByStudent[sid]) allByStudent[sid] = [];
    allByStudent[sid].push(e);
    if (e.student?._id && !studentDocById[sid]) studentDocById[sid] = e.student;
  }

  const performances = allStudentIds.map((sid) => {
    const approved = approvedByStudent[sid] || [];
    const all = allByStudent[sid] || [];
    const perf = computePerformanceFromData(sid, approved, all, { periodId, year });
    const studentDoc = studentDocById[sid];
    perf.studentName = studentDoc ? `${studentDoc.name} ${studentDoc.firstSurName}` : "Desconocido";
    perf.recentEvaluations = [];
    return perf;
  });

  return performances
    .sort((a, b) => {
      // Students with approved evals: sort ascending by average (worst risk first)
      // Students with only pending/rejected evals: sort after, by pending count desc
      if (a.approvedCount > 0 && b.approvedCount === 0) return -1;
      if (a.approvedCount === 0 && b.approvedCount > 0) return 1;
      if (a.approvedCount === 0 && b.approvedCount === 0) {
        return b.pendingCount - a.pendingCount;
      }
      return a.averageGeneral - b.averageGeneral;
    })
    .slice(0, limit);
}

// ─── Parent child evaluations ─────────────────────────────────────────────────

async function getParentChildEvaluations(childId, filter = {}, ctx) {
  await requireParentChildAccess(ctx, childId);
  const { periodId, subjectId, status } = filter;

  const query = { student: childId };
  if (periodId) query.period = periodId;
  if (subjectId) query.subject = subjectId;
  if (status) query.status = status;

  return AcademicEvaluation.find(query)
    .populate("subject")
    .populate("period")
    .populate("student", "name firstSurName email grade instrument _id")
    .populate("reviewedByAdmin", "name firstSurName email _id")
    .sort({ createdAt: -1 })
    .lean()
    .then(hydrateAssessmentSlots);
}

// ─── Parent ────────────────────────────────────────────────────────────────────

async function getParentChildrenOverview(periodId, year, ctx) {
  const user = requireAuth(ctx);

  if (!isAdmin(user) && user.entityType !== "Parent") {
    throw new Error("No autorizado");
  }

  let childrenIds;

  if (isAdmin(user)) {
    // Admin no usa esta query normalmente, pero si la llama devuelve vacío
    return [];
  }

  const parent = await Parent.findById(user._id || user.id).select("children").lean();
  if (!parent) throw new Error("Padre no encontrado");
  childrenIds = (parent.children || []).map((id) => String(id));

  if (childrenIds.length === 0) return [];

  const children = await User.find({ _id: { $in: childrenIds } })
    .select("name firstSurName grade instrument _id")
    .lean();

  const result = await Promise.all(
    children.map(async (child) => {
      const performance = await calculateStudentPerformance(String(child._id), { periodId, year });

      // Evaluaciones aprobadas no acusadas por el padre
      const pendingAck = await AcademicEvaluation.find({
        student: child._id,
        status: "approved",
        parentAcknowledged: false,
      })
        .populate("subject", "name _id")
        .populate("period", "name year order _id")
        .lean();

      return {
        childId: String(child._id),
        childName: `${child.name} ${child.firstSurName}`,
        childGrade: child.grade || null,
        performance,
        pendingAcknowledgements: pendingAck,
      };
    })
  );

  return result;
}

async function getSectionInstrumentOverview(periodId, year, ctx) {
  const leader = await requireSectionInstrumentLeader(ctx);
  const section = inferSectionFromInstrument(leader.instrument);
  const instrument = String(leader.instrument || "").trim();
  const instrumentRegex = new RegExp(`^\\s*${escapeRegex(instrument)}\\s*$`, "i");

  let members = await User.find({
    instrument: instrumentRegex,
    state: "Estudiante Activo",
    grade: { $nin: [null, ""] },
  })
    .select("name firstSurName secondSurName grade instrument avatar _id")
    .sort({ firstSurName: 1, secondSurName: 1, name: 1 })
    .lean();

  if (members.length === 0 && section) {
    const candidates = await User.find({
      state: "Estudiante Activo",
      grade: { $nin: [null, ""] },
    })
      .select("name firstSurName secondSurName grade instrument avatar _id")
      .sort({ firstSurName: 1, secondSurName: 1, name: 1 })
      .lean();

    members = candidates.filter(
      (member) => inferSectionFromInstrument(member.instrument) === section
    );
  }

  if (members.length === 0) {
    const leaderFull = await User.findById(leader._id || leader.id)
      .select("students")
      .populate({
        path: "students",
        match: {
          state: "Estudiante Activo",
          grade: { $nin: [null, ""] },
        },
        select: "name firstSurName secondSurName grade instrument avatar _id",
      })
      .lean();

    members = Array.isArray(leaderFull?.students) ? leaderFull.students : [];
  }

  if (members.length === 0) return [];

  const coverageByStudent = await getEvaluationCoverageForStudents(members, { periodId, year });

  return Promise.all(
    members.map(async (member) => {
      const coverage = coverageByStudent.get(String(member._id));
      const performance = await calculateStudentPerformance(String(member._id), { periodId, year });

      return {
        memberId: String(member._id),
        memberName: `${member.name} ${member.firstSurName} ${member.secondSurName || ""}`.trim(),
        memberGrade: member.grade || null,
        memberInstrument: member.instrument || null,
        memberAvatar: member.avatar || null,
        ...coverage,
        performance: {
          ...performance,
          studentName: `${member.name} ${member.firstSurName} ${member.secondSurName || ""}`.trim(),
        },
      };
    })
  );
}

async function acknowledgeChildPerformance(childId, periodId, comment, ctx) {
  const user = requireAuth(ctx);

  if (user.entityType !== "Parent" && !isAdmin(user)) {
    throw new Error("Solo padres o administradores pueden acusar recibido");
  }

  if (user.entityType === "Parent") {
    await requireParentChildAccess(ctx, childId);
  }

  const query = { student: childId, status: "approved", parentAcknowledged: false };
  if (periodId) query.period = periodId;

  const count = await AcademicEvaluation.countDocuments(query);

  await AcademicEvaluation.updateMany(query, {
    parentAcknowledged: true,
    parentAcknowledgedAt: new Date(),
    parentAcknowledgedBy: String(user._id || user.id),
    ...(comment ? { parentComment: comment } : {}),
  });

  return {
    success: true,
    message: `${count} evaluación(es) marcadas como revisadas`,
  };
}

/**
 * Evaluaciones pendientes de la sección del líder autenticado.
 * Accessible por rol "Principal de sección" con estado "Exalumno".
 * Replica la lógica de getAdminPendingEvaluations pero scoped a la sección.
 */
async function getSectionPendingEvaluations(filter = {}, ctx) {
  const leader = await requireSectionInstrumentLeader(ctx);
  const instrument = String(leader.instrument || "").trim();
  const instrumentRegex = new RegExp(`^\\s*${escapeRegex(instrument)}\\s*$`, "i");

  // Buscar miembros activos de la sección (misma lógica que getSectionInstrumentOverview)
  let members = await User.find({
    instrument: instrumentRegex,
    state: "Estudiante Activo",
    grade: { $nin: [null, ""] },
  })
    .select("_id")
    .lean();

  // Fallback por sección si el regex de instrumento no encuentra nada
  if (members.length === 0 && leader.section) {
    const candidates = await User.find({
      state: "Estudiante Activo",
      grade: { $nin: [null, ""] },
    })
      .select("_id instrument")
      .lean();
    members = candidates.filter(
      (m) => inferSectionFromInstrument(m.instrument) === leader.section
    );
  }

  if (members.length === 0) return [];

  const memberIds = members.map((m) => m._id);

  const { periodId, subjectId } = filter;
  const query = { status: "pending", student: { $in: memberIds } };
  if (periodId) query.period = new mongoose.Types.ObjectId(String(periodId));
  if (subjectId) query.subject = new mongoose.Types.ObjectId(String(subjectId));

  return AcademicEvaluation.find(query)
    .select(EVAL_LIST_SELECT + " student")
    .populate("student", "name firstSurName email grade instrument avatar _id")
    .populate("subject", "name code _id")
    .populate("period", "name year order _id")
    .sort({ submittedByStudentAt: 1 })
    .lean()
    .then(hydrateAssessmentSlots);
}

module.exports = {
  getAcademicSubjects,
  getAdminPendingEvaluations,
  getAdminPendingEvaluationsPaginated,
  getAdminAcademicStudents,
  getAdminAcademicCoverage,
  getParentChildEvaluations,
  createAcademicSubject,
  updateAcademicSubject,
  deleteAcademicSubject,
  getAcademicPeriods,
  createAcademicPeriod,
  updateAcademicPeriod,
  getAcademicAssessmentSlots,
  createAcademicAssessmentSlot,
  updateAcademicAssessmentSlot,
  deleteOrDeactivateAcademicAssessmentSlot,
  seedAcademicRulesForYear,
  submitAcademicEvaluation,
  updateOwnPendingEvaluation,
  updateAcademicEvaluationAsAdmin,
  deleteAcademicEvaluationAsAdmin,
  deleteOwnPendingEvaluation,
  reviewAcademicEvaluation,
  getMyEvaluations,
  getStudentEvaluations,
  getEvaluationDetail,
  getMyPerformance,
  getMyEvaluationCoverage,
  getMyAcademicRequirements,
  getStudentAcademicRequirements,
  getStudentPerformance,
  getAdminDashboard,
  getAdminRiskRanking,
  getParentChildrenOverview,
  getSectionInstrumentOverview,
  getSectionPendingEvaluations,
  acknowledgeChildPerformance,
  activateAcademicSemester,
  deactivateAcademicSemester,
};
