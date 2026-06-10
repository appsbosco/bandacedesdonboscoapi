"use strict";

const mongoose = require("mongoose");
const AcademicSubject = require("../../../../../models/academic/AcademicSubject");
const AcademicPeriod = require("../../../../../models/academic/AcademicPeriod");
const AcademicEvaluation = require("../../../../../models/academic/AcademicEvaluation");
const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const { inferSectionFromInstrument } = require("../../../../../utils/sections");
const { buildThumbnailUrl, buildPreviewUrl } = require("../../../../../utils/cloudinaryTransform");

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

function subjectAppliesToGrade(subject, grade) {
  const grades = Array.isArray(subject.grades) ? subject.grades.filter(Boolean) : [];
  return grades.length === 0 || grades.includes(grade);
}

async function getEvaluationCoverageForStudents(students, filters = {}) {
  if (students.length === 0) return new Map();

  const periodQuery = { isActive: true };
  if (filters.periodId) {
    periodQuery._id = filters.periodId;
  } else if (filters.year) {
    periodQuery.year = Number(filters.year);
  }

  const [subjects, periods] = await Promise.all([
    AcademicSubject.find({
      isActive: true,
    })
      .select("_id name grades")
      .lean(),
    AcademicPeriod.find(periodQuery).select("_id name year order").sort({ year: -1, order: 1 }).lean(),
  ]);

  const studentIds = students.map((student) => String(student._id || student.id));
  const subjectIds = subjects.map((subject) => subject._id);
  const periodIds = periods.map((period) => String(period._id));

  const evaluations = await AcademicEvaluation.find({
    student: { $in: studentIds },
    subject: { $in: subjectIds },
    period: { $in: periodIds },
  })
    .select("student subject period")
    .lean();

  const submittedByStudent = new Map();
  for (const evaluation of evaluations) {
    const studentId = String(evaluation.student);
    if (!submittedByStudent.has(studentId)) submittedByStudent.set(studentId, new Set());
    submittedByStudent
      .get(studentId)
      .add(`${String(evaluation.subject)}:${String(evaluation.period)}`);
  }

  return new Map(
    students.map((student) => {
      const studentId = String(student._id || student.id);
      const studentSubjects = subjects.filter((subject) =>
        subjectAppliesToGrade(subject, student.grade)
      );
      const submittedKeys = submittedByStudent.get(studentId) || new Set();
      const coverageByPeriod = periods.map((period) => {
        const periodId = String(period._id);
        const missingSubjects = studentSubjects
          .filter((subject) => !submittedKeys.has(`${String(subject._id)}:${periodId}`))
          .map((subject) => ({
            subjectId: String(subject._id),
            subjectName: subject.name,
          }));
        const expectedEvaluationsCount = studentSubjects.length;
        const missingEvaluationsCount = missingSubjects.length;

        return {
          periodId,
          periodName: period.name,
          year: period.year,
          expectedEvaluationsCount,
          submittedEvaluationsCount: expectedEvaluationsCount - missingEvaluationsCount,
          missingEvaluationsCount,
          missingSubjects,
        };
      });
      const expectedEvaluationsCount = coverageByPeriod.reduce(
        (total, period) => total + period.expectedEvaluationsCount,
        0
      );
      const submittedEvaluationsCount = coverageByPeriod.reduce(
        (total, period) => total + period.submittedEvaluationsCount,
        0
      );
      const missingEvaluationsCount = coverageByPeriod.reduce(
        (total, period) => total + period.missingEvaluationsCount,
        0
      );

      return [
        studentId,
        {
          allEvaluationsSubmitted: expectedEvaluationsCount > 0 && missingEvaluationsCount === 0,
          expectedEvaluationsCount,
          submittedEvaluationsCount,
          missingEvaluationsCount,
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

async function createAcademicSubject(input, ctx) {
  requireAdmin(ctx);
  const { name, code, isActive = true, bands = [], grades = [] } = input;
  if (!name) throw new Error("El nombre de la materia es requerido");
  return AcademicSubject.create({ name, code, isActive, bands, grades });
}

async function updateAcademicSubject(id, input, ctx) {
  requireAdmin(ctx);
  const subject = await AcademicSubject.findById(id);
  if (!subject) throw new Error("Materia no encontrada");
  // Normalize grades/bands: treat null as [] so queries using $size:0 keep working
  const sanitized = { ...input };
  if (sanitized.grades == null) sanitized.grades = [];
  if (sanitized.bands == null) sanitized.bands = [];
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
  return AcademicPeriod.find(query).sort({ year: -1, order: 1 });
}

async function createAcademicPeriod(input, ctx) {
  requireAdmin(ctx);
  const { name, year, order, isActive = true } = input;
  if (!name) throw new Error("El nombre del período es requerido");
  if (!year) throw new Error("El año es requerido");
  if (order === undefined || order === null) throw new Error("El orden es requerido");
  return AcademicPeriod.create({ name, year, order, isActive });
}

async function updateAcademicPeriod(id, input, ctx) {
  requireAdmin(ctx);
  const period = await AcademicPeriod.findById(id);
  if (!period) throw new Error("Período no encontrado");
  Object.assign(period, input);
  await period.save();
  return period;
}

// ─── Evaluations — CRUD ───────────────────────────────────────────────────────

async function submitAcademicEvaluation(input, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);

  const {
    subjectId,
    periodId,
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
  if (scoreRaw === undefined || scoreRaw === null) throw new Error("La nota es requerida");
  if (!evidenceUrl || !evidencePublicId) throw new Error("La evidencia es requerida");
  if (scaleMax <= scaleMin) throw new Error("scaleMax debe ser mayor que scaleMin");
  if (scoreRaw < scaleMin || scoreRaw > scaleMax) {
    throw new Error(`La nota debe estar entre ${scaleMin} y ${scaleMax}`);
  }

  const [subject, period, studentFull] = await Promise.all([
    AcademicSubject.findById(subjectId),
    AcademicPeriod.findById(periodId),
    User.findById(userId).select("grade").lean(),
  ]);

  if (!subject || !subject.isActive) throw new Error("Materia no encontrada o inactiva");
  if (!period || !period.isActive) throw new Error("Período no encontrado o inactivo");

  // Validar que la materia aplique al grado del estudiante
  if (subject.grades && subject.grades.length > 0 && studentFull?.grade) {
    if (!subject.grades.includes(studentFull.grade)) {
      throw new Error(`Esta materia no aplica al nivel ${studentFull.grade}`);
    }
  }

  const scoreNormalized100 = normalizeScore(scoreRaw, scaleMin, scaleMax);

  const evaluation = await AcademicEvaluation.create({
    student: userId,
    subject: subjectId,
    period: periodId,
    scoreRaw,
    scaleMin,
    scaleMax,
    scoreNormalized100,
    evidenceUrl,
    evidencePublicId,
    evidenceResourceType,
    evidenceOriginalName,
    evidenceThumbnailUrl: buildThumbnailUrl(evidencePublicId, evidenceResourceType),
    evidencePreviewUrl: buildPreviewUrl(evidencePublicId, evidenceResourceType),
    status: "pending",
    submittedByStudentAt: new Date(),
  });

  return evaluation.populate(["student", "subject", "period", "reviewedByAdmin"]);
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
  return evaluation.populate(["student", "subject", "period", "reviewedByAdmin"]);
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
  return evaluation.populate(["student", "subject", "period", "reviewedByAdmin"]);
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
      throw new Error("Solo puedes revisar evaluaciones pendientes");
    }
  }

  evaluation.status = status;
  evaluation.reviewedByAdmin = String(reviewer._id || reviewer.id);
  evaluation.reviewedAt = new Date();
  evaluation.reviewComment = reviewComment || null;

  await evaluation.save();
  return evaluation.populate(["student", "subject", "period", "reviewedByAdmin"]);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

// Campos de lista: excluye evidenceUrl (imagen original pesada).
// El frontend usa evidenceThumbnailUrl para el thumbnail en tabla.
// Para ver la imagen completa, se usa GET_EVALUATION_DETAIL (lazy, solo en modal).
const EVAL_LIST_SELECT =
  "student subject period scoreRaw scaleMin scaleMax scoreNormalized100 " +
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
    .populate("subject", "name code isActive _id")
    .populate("period", "name year order isActive _id")
    .populate("reviewedByAdmin", "name firstSurName _id")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
}

async function getStudentEvaluations(studentId, filter = {}, ctx) {
  await requireStudentAccess(ctx, studentId);

  const query = { student: studentId };
  if (filter.periodId) query.period = new mongoose.Types.ObjectId(String(filter.periodId));
  if (filter.subjectId) query.subject = new mongoose.Types.ObjectId(String(filter.subjectId));
  if (filter.status) query.status = filter.status;

  return AcademicEvaluation.find(query)
    .select(EVAL_LIST_SELECT + " student")
    .populate("subject", "name code isActive _id")
    .populate("period", "name year order isActive _id")
    .populate("student", "name firstSurName email grade instrument _id")
    .populate("reviewedByAdmin", "name firstSurName _id")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
}

/**
 * Detalle completo de una evaluación (incluyendo evidenceUrl original).
 * Solo se llama cuando el usuario abre el modal de detalle.
 */
async function getEvaluationDetail(id, ctx) {
  const user = requireAuth(ctx);

  const evaluation = await AcademicEvaluation.findById(id)
    .populate("subject", "name code _id")
    .populate("period", "name year order _id")
    .populate("student", "name firstSurName email grade instrument avatar _id")
    .populate("reviewedByAdmin", "name firstSurName email _id")
    .lean();

  if (!evaluation) throw new Error("Evaluación no encontrada");

  const studentId = String(evaluation.student?._id || evaluation.student);

  // Admin: acceso total
  if (isAdmin(user)) return evaluation;

  // Padre: acceso a sus hijos
  if (user.entityType === "Parent") {
    await requireParentChildAccess(ctx, studentId);
    return evaluation;
  }

  // El mismo estudiante
  if (String(user._id || user.id) === studentId) return evaluation;

  // Principal de sección con acceso al estudiante
  if (await hasSectionStudentAccess(user, studentId)) return evaluation;

  throw new Error("No autorizado");
}

// ─── Performance calculation ──────────────────────────────────────────────────

/**
 * Versión SINCRÓNICA de cálculo de rendimiento.
 * Recibe datos pre-cargados — cero queries adicionales a MongoDB.
 * Usada por las funciones bulk (dashboard, riskRanking, sectionOverview)
 * para transformar 150×2=300 queries en 0 queries extras.
 */
function computePerformanceFromData(studentId, approvedEvals, allEvals, filters = {}) {
  const { periodId, year } = filters;

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
      riskLevel: "GREEN",
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
  let riskLevel;
  if (avgGeneral < 70 || riskScore >= 2 || trendDelta <= -10) riskLevel = "RED";
  else if ((avgGeneral >= 70 && avgGeneral < 80) || riskScore === 1) riskLevel = "YELLOW";
  else riskLevel = "GREEN";

  return {
    studentId: String(studentId),
    averageGeneral: Math.round(avgGeneral * 10) / 10,
    approvedCount,
    pendingCount,
    rejectedCount,
    averagesBySubject,
    strongestSubjects,
    weakestSubjects,
    trendDirection,
    trendDelta,
    riskSubjects,
    riskScore,
    riskLevel,
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

  const [allApproved, allEvals] = await Promise.all([
    AcademicEvaluation.find({ student: studentId, status: "approved" })
      .select("subject period scoreNormalized100 status createdAt")
      .populate("subject", "name _id")
      .populate("period", "name year order _id")
      .sort({ createdAt: 1 })
      .lean(),
    AcademicEvaluation.find({ student: studentId })
      .select("status")
      .lean(),
  ]);

  return computePerformanceFromData(studentId, allApproved, allEvals, { periodId, year });
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
    .lean();

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
    .lean();

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

  // ── OPTIMIZACIÓN: reutiliza datos del mismo dataset, sin N+1 ─────────────────
  const approvedQuery = { status: "approved" };
  if (periodId) approvedQuery.period = new mongoose.Types.ObjectId(String(periodId));

  const [approvedEvals, allEvalsCounts] = await Promise.all([
    AcademicEvaluation.find(approvedQuery)
      .select("student subject period scoreNormalized100 createdAt")
      .populate("subject", "name _id")
      .populate("period", "name year order _id")
      .populate("student", "name firstSurName grade bands instrument _id")
      .lean(),
    AcademicEvaluation.find({}).select("student status").lean(),
  ]);

  let filtered = approvedEvals;
  if (grade) filtered = filtered.filter((e) => e.student?.grade === grade);
  if (instrument) filtered = filtered.filter((e) =>
    e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
  );
  if (year) filtered = filtered.filter((e) => e.period?.year === Number(year));

  const studentIds = [...new Set(filtered.map((e) => String(e.student?._id || e.student)))];

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

  const performances = studentIds.map((sid) => {
    const approved = approvedByStudent[sid] || [];
    const all = allByStudent[sid] || [];
    const perf = computePerformanceFromData(sid, approved, all, { periodId, year });
    const studentDoc = approved[0]?.student;
    perf.studentName = studentDoc ? `${studentDoc.name} ${studentDoc.firstSurName}` : "Desconocido";
    perf.recentEvaluations = [];
    return perf;
  });

  return performances
    .sort((a, b) => a.averageGeneral - b.averageGeneral)
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
    .lean();
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
    .lean();
}

module.exports = {
  getAcademicSubjects,
  getAdminPendingEvaluations,
  getAdminPendingEvaluationsPaginated,
  getAdminAcademicStudents,
  getParentChildEvaluations,
  createAcademicSubject,
  updateAcademicSubject,
  deleteAcademicSubject,
  getAcademicPeriods,
  createAcademicPeriod,
  updateAcademicPeriod,
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
  getStudentPerformance,
  getAdminDashboard,
  getAdminRiskRanking,
  getParentChildrenOverview,
  getSectionInstrumentOverview,
  getSectionPendingEvaluations,
  acknowledgeChildPerformance,
};
