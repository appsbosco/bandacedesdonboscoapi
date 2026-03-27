"use strict";

const AcademicSubject = require("../../../../../models/academic/AcademicSubject");
const AcademicPeriod = require("../../../../../models/academic/AcademicPeriod");
const AcademicEvaluation = require("../../../../../models/academic/AcademicEvaluation");
const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const { inferSectionFromInstrument } = require("../../../../../utils/sections");

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);
const SECTION_ACADEMIC_ROLES = new Set(["Principal de sección", "Asistente de sección"]);
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
    SECTION_ACADEMIC_ROLES.has(user?.role) &&
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
      "No autorizado: se requiere ser Principal o Asistente de sección con instrumento asignado"
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
  const periodQuery = { isActive: true };
  if (filters.periodId) {
    periodQuery._id = filters.periodId;
  } else if (filters.year) {
    periodQuery.year = Number(filters.year);
  }

  const [subjects, periods] = await Promise.all([
    AcademicSubject.find({
      isActive: true,
      ...buildSubjectGradeQuery(grade),
    })
      .select("_id")
      .lean(),
    AcademicPeriod.find(periodQuery).select("_id").lean(),
  ]);

  const subjectIds = subjects.map((subject) => String(subject._id));
  const periodIds = periods.map((period) => String(period._id));
  const expectedEvaluationsCount = subjectIds.length * periodIds.length;

  if (expectedEvaluationsCount === 0) {
    return {
      allEvaluationsSubmitted: false,
      expectedEvaluationsCount: 0,
      submittedEvaluationsCount: 0,
      missingEvaluationsCount: 0,
    };
  }

  const evaluations = await AcademicEvaluation.find({
    student: studentId,
    subject: { $in: subjectIds },
    period: { $in: periodIds },
  })
    .select("subject period")
    .lean();

  const submittedKeys = new Set(
    evaluations.map((evaluation) => `${String(evaluation.subject)}:${String(evaluation.period)}`)
  );
  const submittedEvaluationsCount = submittedKeys.size;
  const missingEvaluationsCount = Math.max(expectedEvaluationsCount - submittedEvaluationsCount, 0);

  return {
    allEvaluationsSubmitted: expectedEvaluationsCount > 0 && missingEvaluationsCount === 0,
    expectedEvaluationsCount,
    submittedEvaluationsCount,
    missingEvaluationsCount,
  };
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

  evaluation.scoreRaw = newScoreRaw;
  evaluation.scaleMin = newScaleMin;
  evaluation.scaleMax = newScaleMax;
  evaluation.scoreNormalized100 = normalizeScore(newScoreRaw, newScaleMin, newScaleMax);
  if (evidenceUrl) evaluation.evidenceUrl = evidenceUrl;
  if (evidencePublicId) evaluation.evidencePublicId = evidencePublicId;
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

async function getMyEvaluations(filter = {}, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);

  const query = { student: userId };
  if (filter.periodId) query.period = filter.periodId;
  if (filter.subjectId) query.subject = filter.subjectId;
  if (filter.status) query.status = filter.status;

  return AcademicEvaluation.find(query)
    .populate("subject")
    .populate("period")
    .populate("reviewedByAdmin", "name firstSurName email")
    .sort({ createdAt: -1 });
}

async function getStudentEvaluations(studentId, filter = {}, ctx) {
  await requireStudentAccess(ctx, studentId);

  const query = { student: studentId };
  if (filter.periodId) query.period = filter.periodId;
  if (filter.subjectId) query.subject = filter.subjectId;
  if (filter.status) query.status = filter.status;

  return AcademicEvaluation.find(query)
    .populate("subject")
    .populate("period")
    .populate("student", "name firstSurName email grade instrument")
    .populate("reviewedByAdmin", "name firstSurName email")
    .sort({ createdAt: -1 });
}

// ─── Performance calculation ──────────────────────────────────────────────────

/**
 * Calcula el rendimiento académico de un estudiante.
 * filters.periodId: limita al período específico
 * filters.year: limita al año específico
 */
async function calculateStudentPerformance(studentId, filters = {}) {
  const { periodId, year } = filters;

  // Traer TODAS las evaluaciones aprobadas del estudiante (para calcular tendencia)
  const allApproved = await AcademicEvaluation.find({
    student: studentId,
    status: "approved",
  })
    .populate("subject", "name _id")
    .populate("period", "name year order _id")
    .sort({ createdAt: 1 })
    .lean();

  // Conteos de todos los estados
  const allEvals = await AcademicEvaluation.find({ student: studentId }).lean();
  const approvedCount = allEvals.filter((e) => e.status === "approved").length;
  const pendingCount = allEvals.filter((e) => e.status === "pending").length;
  const rejectedCount = allEvals.filter((e) => e.status === "rejected").length;

  // Filtrar por período/año si se especificó
  let filteredEvals = allApproved;
  if (periodId) {
    filteredEvals = allApproved.filter((e) => String(e.period?._id) === String(periodId));
  } else if (year) {
    filteredEvals = allApproved.filter((e) => e.period?.year === Number(year));
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

  // Promedio general
  const avgGeneral =
    filteredEvals.reduce((sum, e) => sum + e.scoreNormalized100, 0) / filteredEvals.length;

  // Promedios por materia
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

  // Tendencia: comparar último período con el anterior
  let trendDirection = "STABLE";
  let trendDelta = 0;

  const byPeriod = {};
  for (const e of allApproved) {
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

  // Materias en riesgo
  const riskSubjects = averagesBySubject
    .filter((s) => {
      const belowThreshold = s.average < 70;
      const belowGeneral = avgGeneral - s.average >= 10;
      return belowThreshold || belowGeneral;
    })
    .map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      average: s.average,
      reason: s.average < 70 ? "BELOW_THRESHOLD" : "BELOW_GENERAL",
    }));

  const riskScore = riskSubjects.length;

  let riskLevel;
  if (avgGeneral < 70 || riskScore >= 2 || trendDelta <= -10) {
    riskLevel = "RED";
  } else if ((avgGeneral >= 70 && avgGeneral < 80) || riskScore === 1) {
    riskLevel = "YELLOW";
  } else {
    riskLevel = "GREEN";
  }

  const recentEvaluations = filteredEvals.slice(-5).reverse();

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
    recentEvaluations,
  };
}

async function getMyPerformance(periodId, year, ctx) {
  const user = requireStudentSelf(ctx);
  const userId = String(user._id || user.id);
  return calculateStudentPerformance(userId, { periodId, year });
}

async function getStudentPerformance(studentId, periodId, year, ctx) {
  await requireStudentAccess(ctx, studentId);
  return calculateStudentPerformance(studentId, { periodId, year });
}

// ─── Admin dashboard ──────────────────────────────────────────────────────────

async function getAdminDashboard(filter = {}, ctx) {
  requireAdmin(ctx);
  const { periodId, year, grade, band, instrument } = filter;

  // Obtener todos los IDs de estudiantes con evaluaciones aprobadas
  const approvedQuery = { status: "approved" };
  if (periodId) approvedQuery.period = periodId;

  const approvedEvals = await AcademicEvaluation.find(approvedQuery)
    .populate("subject", "name _id")
    .populate("period", "name year order _id")
    .populate("student", "name firstSurName grade bands instrument _id")
    .lean();

  // Filtrar por grado/banda/instrumento si se especificó
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

  // Calcular performance de cada estudiante (simplificado, sin recentEvaluations para eficiencia)
  const performances = await Promise.all(
    studentIds.map(async (sid) => {
      const perf = await calculateStudentPerformance(sid, { periodId, year });
      // Agregar nombre del estudiante
      const studentEval = filtered.find((e) => String(e.student?._id || e.student) === sid);
      const s = studentEval?.student;
      perf.studentName = s ? `${s.name} ${s.firstSurName}` : "Desconocido";
      perf.recentEvaluations = []; // No incluir para el dashboard
      return perf;
    })
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
  if (periodId) query.period = periodId;
  if (subjectId) query.subject = subjectId;

  const evals = await AcademicEvaluation.find(query)
    .populate("student", "name firstSurName email grade instrument _id")
    .populate("subject", "name code grades _id")
    .populate("period", "name year order _id")
    .populate("reviewedByAdmin", "name firstSurName email _id")
    .sort({ submittedByStudentAt: 1 })
    .lean();

  let result = evals;
  if (grade) result = result.filter((e) => e.student?.grade === grade);
  if (instrument) result = result.filter((e) =>
    e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
  );
  return result;
}

async function getAdminRiskRanking(filter = {}, limit = 20, ctx) {
  requireAdmin(ctx);
  const { periodId, year, grade, instrument } = filter;

  const approvedQuery = { status: "approved" };
  if (periodId) approvedQuery.period = periodId;

  const approvedEvals = await AcademicEvaluation.find(approvedQuery)
    .populate("student", "name firstSurName grade bands instrument _id")
    .populate("period", "year _id")
    .lean();

  let filtered = approvedEvals;
  if (grade) filtered = filtered.filter((e) => e.student?.grade === grade);
  if (instrument) filtered = filtered.filter((e) =>
    e.student?.instrument?.toLowerCase().includes(instrument.toLowerCase())
  );
  if (year) filtered = filtered.filter((e) => e.period?.year === Number(year));

  const studentIds = [...new Set(filtered.map((e) => String(e.student?._id || e.student)))];

  const performances = await Promise.all(
    studentIds.map(async (sid) => {
      const perf = await calculateStudentPerformance(sid, { periodId, year });
      const studentEval = filtered.find((e) => String(e.student?._id || e.student) === sid);
      const s = studentEval?.student;
      perf.studentName = s ? `${s.name} ${s.firstSurName}` : "Desconocido";
      perf.recentEvaluations = [];
      return perf;
    })
  );

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

  return Promise.all(
    members.map(async (member) => {
      const [coverage, performance] = await Promise.all([
        getStudentEvaluationCoverage(String(member._id), member.grade, { periodId, year }),
        calculateStudentPerformance(String(member._id), { periodId, year }),
      ]);

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

module.exports = {
  getAcademicSubjects,
  getAdminPendingEvaluations,
  getParentChildEvaluations,
  createAcademicSubject,
  updateAcademicSubject,
  getAcademicPeriods,
  createAcademicPeriod,
  updateAcademicPeriod,
  submitAcademicEvaluation,
  updateOwnPendingEvaluation,
  deleteOwnPendingEvaluation,
  reviewAcademicEvaluation,
  getMyEvaluations,
  getStudentEvaluations,
  getMyPerformance,
  getStudentPerformance,
  getAdminDashboard,
  getAdminRiskRanking,
  getParentChildrenOverview,
  getSectionInstrumentOverview,
  acknowledgeChildPerformance,
};
