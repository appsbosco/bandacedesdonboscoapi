const assert = require("node:assert/strict");
const { test } = require("node:test");

const engine = require("../../src/graphql/modules/academicEvaluations/services/academicRequirementEngine.service");

const subjects = [
  { _id: "math", name: "Matemáticas", subjectType: "EXAM_BASED", grades: [], isActive: true, order: 1 },
  { _id: "ethics", name: "Ética", subjectType: "SEMESTER_FINAL_ONLY", grades: [], isActive: true, order: 2 },
  {
    _id: "biology",
    name: "Biología",
    subjectType: "EXAM_BASED",
    grades: ["Undécimo"],
    isActive: true,
    order: 3,
  },
];

const primaryGrades = [
  "Tercero Primaria",
  "Cuarto Primaria",
  "Quinto Primaria",
  "Sexto Primaria",
];

const slots = [
  {
    _id: "s1e1",
    academicYear: 2026,
    semester: 1,
    slotKey: "S1_EXAM_1",
    label: "I Semestre - Evaluación 1",
    evaluationType: "EXAM",
    subjectType: "EXAM_BASED",
    appliesToGrades: [],
    excludedGrades: primaryGrades,
    isActive: true,
    order: 1,
  },
  {
    _id: "s1e2",
    academicYear: 2026,
    semester: 1,
    slotKey: "S1_EXAM_2",
    label: "I Semestre - Evaluación 2",
    evaluationType: "EXAM",
    subjectType: "EXAM_BASED",
    appliesToGrades: [],
    excludedGrades: primaryGrades,
    isActive: true,
    order: 2,
  },
  {
    _id: "s1primary",
    academicYear: 2026,
    semester: 1,
    slotKey: "S1_PRIMARY_EXAM",
    label: "I Semestre - Evaluación",
    evaluationType: "EXAM",
    subjectType: "EXAM_BASED",
    appliesToGrades: primaryGrades,
    excludedGrades: [],
    isActive: true,
    order: 1,
  },
  {
    _id: "s1final",
    academicYear: 2026,
    semester: 1,
    slotKey: "S1_FINAL",
    label: "I Semestre - Nota final",
    evaluationType: "FINAL_GRADE",
    subjectType: "SEMESTER_FINAL_ONLY",
    appliesToGrades: [],
    excludedGrades: [],
    isActive: true,
    order: 3,
  },
];

test("secondary students receive two exam slots and one final-only slot per semester", () => {
  const requirements = engine.getExpectedRequirementsForStudentFromData(
    { _id: "student1", grade: "Undécimo" },
    subjects,
    slots,
    { academicYear: 2026, semester: 1 }
  );

  assert.deepEqual(
    requirements.map((item) => `${item.subjectName}:${item.slotKey}`),
    [
      "Matemáticas:S1_EXAM_1",
      "Matemáticas:S1_EXAM_2",
      "Ética:S1_FINAL",
      "Biología:S1_EXAM_1",
      "Biología:S1_EXAM_2",
    ]
  );
});

test("primary students receive one exam slot per semester for exam-based subjects", () => {
  const requirements = engine.getExpectedRequirementsForStudentFromData(
    { _id: "student2", grade: "Quinto Primaria" },
    subjects,
    slots,
    { academicYear: 2026, semester: 1 }
  );

  assert.deepEqual(
    requirements.map((item) => `${item.subjectName}:${item.slotKey}`),
    ["Matemáticas:S1_PRIMARY_EXAM", "Ética:S1_FINAL"]
  );
});

test("subject grade restrictions exclude non-applicable science variants", () => {
  assert.equal(engine.subjectAppliesToGrade(subjects[2], "Décimo"), false);
  assert.equal(engine.subjectAppliesToGrade(subjects[2], "Undécimo"), true);
});

test("coverage matches submitted evaluations by subject year semester and slot", () => {
  const requirements = engine.getExpectedRequirementsForStudentFromData(
    { _id: "student1", grade: "Undécimo" },
    subjects,
    slots,
    { academicYear: 2026, semester: 1 }
  );
  const coverage = engine.buildAcademicCoverageForStudent(
    { _id: "student1", grade: "Undécimo" },
    [
      {
        _id: "eval1",
        subject: "math",
        assessmentSlot: "s1e1",
        academicYear: 2026,
        semester: 1,
        status: "approved",
        scoreNormalized100: 91,
      },
    ],
    requirements
  );

  assert.equal(coverage.summary.expectedCount, 5);
  assert.equal(coverage.summary.submittedCount, 1);
  assert.equal(coverage.summary.missingCount, 4);
  assert.equal(coverage.summary.coveragePercentage, 20);
  assert.equal(coverage.requirements[0].status, "approved");
});
