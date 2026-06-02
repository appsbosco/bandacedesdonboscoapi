const AbsencePermission = require("../../../../../models/AbsencePermission");
const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const RehearsalSession = require("../../../../../models/RehearsalSession");
const Event = require("../../../../../models/Events");
const { inferSectionFromInstrument } = require("../../../../../utils/sections");

const ADMIN_ROLES = new Set(["ADMIN", "DIRECTOR", "DIRECCIÓN LOGÍSTICA"]);

// ============================================
// AUTH HELPERS
// ============================================

function getCurrentActor(ctx) {
  return ctx && (ctx.user || ctx.me || ctx.currentUser);
}

function requireAuth(ctx) {
  const actor = getCurrentActor(ctx);
  if (!actor) throw new Error("No autenticado");
  return actor;
}

function isParent(actor) {
  return (
    String(actor.role || "")
      .toLowerCase()
      .includes("padre") ||
    String(actor.role || "")
      .toLowerCase()
      .includes("madre") ||
    String(actor.role || "") === "Parent"
  );
}

function isExalumno(actor) {
  return String(actor.state || "") === "Exalumno";
}

function isAdmin(actor) {
  return ADMIN_ROLES.has(String(actor.role || "").toUpperCase());
}

function isSectionPrincipal(actor) {
  const role = String(actor.role || "").toUpperCase();
  return (
    role === "PRINCIPAL DE SECCIÓN" ||
    role === "ASISTENTE DE SECCIÓN" ||
    role === "ADMIN"
  );
}

function requireReviewer(ctx) {
  const actor = requireAuth(ctx);
  if (!isAdmin(actor) && !isSectionPrincipal(actor)) {
    throw new Error("No tienes permisos para revisar solicitudes de permiso");
  }
  return actor;
}

// ============================================
// BUSINESS RULE VALIDATORS
// ============================================

async function validateParentOwnsStudent(parentId, studentId) {
  const parent = await Parent.findById(parentId).select("children");
  if (!parent) throw new Error("Padre no encontrado");

  const owns = parent.children.some(
    (cid) => cid.toString() === studentId.toString(),
  );
  if (!owns) {
    throw new Error(
      "No puedes solicitar permisos para un estudiante que no está asignado a tu cuenta",
    );
  }
}

async function validateStudentIsActive(studentId) {
  const student = await User.findById(studentId).select(
    "state name firstSurName",
  );
  if (!student) throw new Error("Estudiante no encontrado");
  if (!["Estudiante Activo", "Activo"].includes(student.state)) {
    throw new Error(
      `Solo se pueden solicitar permisos para estudiantes activos. Estado actual: ${student.state}`,
    );
  }
  return student;
}

function validateAttachments(attachments) {
  if (!attachments) return [];
  if (!Array.isArray(attachments) || attachments.length > 1) {
    throw new Error("Solo se permite adjuntar una evidencia");
  }

  return attachments.map((attachment) => {
    let url;
    try {
      url = new URL(attachment);
    } catch {
      throw new Error("La URL de evidencia no es válida");
    }
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
      throw new Error("La evidencia debe estar almacenada en Cloudinary");
    }
    return url.toString();
  });
}

async function validateTargetExists(targetType, rehearsalSessionId, eventId) {
  if (targetType === "REHEARSAL") {
    if (eventId) {
      const event = await Event.findById(eventId).select(
        "_id date category title",
      );
      if (!event) throw new Error("Evento no encontrado");
      if (event.category !== "rehearsal") {
        throw new Error("El evento seleccionado no es un ensayo");
      }
      return { event, absenceDate: event.date };
    }

    // Keep legacy support for requests created from attendance sessions.
    if (!rehearsalSessionId)
      throw new Error(
        "eventId o rehearsalSessionId es requerido para permisos de ensayo",
      );
    const session = await RehearsalSession.findById(rehearsalSessionId).select(
      "_id dateNormalized section",
    );
    if (!session) throw new Error("Sesión de ensayo no encontrada");
    return { session, absenceDate: session.dateNormalized };
  }

  if (targetType === "PERFORMANCE") {
    if (!eventId)
      throw new Error("eventId es requerido para permisos de presentación");
    const event = await Event.findById(eventId).select(
      "_id date category title",
    );
    if (!event) throw new Error("Evento no encontrado");
    if (event.category !== "presentation") {
      throw new Error("El evento seleccionado no es una presentación");
    }
    return { event, absenceDate: event.date };
  }

  throw new Error("targetType inválido");
}

async function checkDuplicate(studentId, targetType, rehearsalSessionId, eventId) {
  const query = {
    student: studentId,
    requestStatus: { $in: ["PENDING", "APPROVED"] },
  };

  if (rehearsalSessionId) {
    query.rehearsalSession = rehearsalSessionId;
  } else {
    query.event = eventId;
  }
  query.targetType = targetType;

  const existing =
    await AbsencePermission.findOne(query).select("_id requestStatus");
  if (existing) {
    throw new Error(
      `Ya existe una solicitud de permiso ${existing.requestStatus === "PENDING" ? "pendiente" : "aprobada"} para este estudiante en esta actividad`,
    );
  }
}

// ============================================
// MUTATIONS
// ============================================

async function createAbsencePermissionRequest(input, ctx) {
  const actor = requireAuth(ctx);
  const {
    studentId,
    targetType,
    rehearsalSessionId,
    eventId,
    reason,
    attachments,
  } = input;

  if (!reason || reason.trim().length < 5) {
    throw new Error(
      "El motivo de la ausencia debe tener al menos 5 caracteres",
    );
  }
  const validatedAttachments = validateAttachments(attachments);

  // Determine requester type and validate authorization
  let requesterType;
  let requestedByParent = null;
  let requestedByUser = null;

  if (isParent(actor)) {
    requesterType = "PARENT";
    requestedByParent = actor._id || actor.id;

    await validateParentOwnsStudent(requestedByParent, studentId);
    await validateStudentIsActive(studentId);
  } else if (isExalumno(actor)) {
    requesterType = "USER";
    requestedByUser = actor._id || actor.id;

    // Alumni can only request for themselves
    const actorId = String(actor._id || actor.id);
    if (actorId !== String(studentId)) {
      throw new Error(
        "Los exalumnos solo pueden solicitar permisos para sí mismos",
      );
    }
  } else if (isAdmin(actor)) {
    // Admins can create on behalf of anyone (admin override)
    requesterType = "USER";
    requestedByUser = actor._id || actor.id;
    // Still validate the student exists
    const student = await User.findById(studentId).select("_id state");
    if (!student) throw new Error("Estudiante no encontrado");
  } else {
    throw new Error(
      "Solo padres de familia, exalumnos o administradores pueden solicitar permisos de ausencia",
    );
  }

  const { session, event, absenceDate } = await validateTargetExists(
    targetType,
    rehearsalSessionId,
    eventId,
  );

  await checkDuplicate(studentId, targetType, rehearsalSessionId, eventId);

  const doc = await AbsencePermission.create({
    student: studentId,
    requesterType,
    requestedByParent,
    requestedByUser,
    targetType,
    rehearsalSession: session ? session._id : null,
    event: event ? event._id : null,
    absenceDate,
    reason: reason.trim(),
    attachments: validatedAttachments,
    requestStatus: "PENDING",
    justificationStatus: "PENDING_REVIEW",
    statusHistory: [
      {
        requestStatus: "PENDING",
        justificationStatus: "PENDING_REVIEW",
        changedBy: isParent(actor) ? null : actor._id || actor.id,
        changedByModel: isParent(actor) ? "Parent" : "User",
        notes: "Solicitud creada",
        changedAt: new Date(),
      },
    ],
  });

  return await AbsencePermission.findById(doc._id)
    .populate("student")
    .populate("requestedByParent")
    .populate("requestedByUser")
    .populate("rehearsalSession")
    .populate("event")
    .populate("reviewedBy");
}

async function reviewAbsencePermissionRequest(id, input, ctx) {
  const actor = requireReviewer(ctx);
  const { requestStatus, justificationStatus, adminNotes } = input;

  if (requestStatus === "PENDING" || requestStatus === "CANCELLED") {
    throw new Error("Al revisar, el estado debe ser APPROVED o REJECTED");
  }

  const permission = await AbsencePermission.findById(id);
  if (!permission) throw new Error("Solicitud de permiso no encontrada");

  if (permission.requestStatus === "CANCELLED") {
    throw new Error("No se puede revisar una solicitud cancelada");
  }

  const actorId = actor._id || actor.id;

  permission.requestStatus = requestStatus;
  permission.justificationStatus = justificationStatus;
  permission.reviewedBy = actorId;
  permission.reviewedAt = new Date();
  if (adminNotes !== undefined) permission.adminNotes = adminNotes;

  permission.statusHistory.push({
    requestStatus,
    justificationStatus,
    changedBy: actorId,
    changedByModel: "User",
    notes: adminNotes || null,
    changedAt: new Date(),
  });

  await permission.save();

  return await AbsencePermission.findById(id)
    .populate("student")
    .populate("requestedByParent")
    .populate("requestedByUser")
    .populate("rehearsalSession")
    .populate("event")
    .populate("reviewedBy");
}

async function cancelAbsencePermissionRequest(id, ctx) {
  const actor = requireAuth(ctx);
  const actorId = String(actor._id || actor.id);

  const permission = await AbsencePermission.findById(id);
  if (!permission) throw new Error("Solicitud de permiso no encontrada");

  if (permission.requestStatus !== "PENDING") {
    if (!isAdmin(actor)) {
      throw new Error(
        "Solo se pueden cancelar solicitudes en estado PENDIENTE. Contacta a un administrador.",
      );
    }
  }

  // Verify ownership: parent must be the requester, alumni must be themselves
  if (!isAdmin(actor)) {
    const isOwner =
      (permission.requesterType === "PARENT" &&
        permission.requestedByParent &&
        String(permission.requestedByParent) === actorId) ||
      (permission.requesterType === "USER" &&
        permission.requestedByUser &&
        String(permission.requestedByUser) === actorId);

    if (!isOwner) {
      throw new Error("No tienes permiso para cancelar esta solicitud");
    }
  }

  permission.requestStatus = "CANCELLED";
  permission.statusHistory.push({
    requestStatus: "CANCELLED",
    justificationStatus: permission.justificationStatus,
    changedBy: isParent(actor) ? null : actor._id || actor.id,
    changedByModel: isParent(actor) ? "Parent" : "User",
    notes: "Solicitud cancelada por el solicitante",
    changedAt: new Date(),
  });

  await permission.save();

  return await AbsencePermission.findById(id)
    .populate("student")
    .populate("requestedByParent")
    .populate("requestedByUser")
    .populate("rehearsalSession")
    .populate("event")
    .populate("reviewedBy");
}

async function reopenAbsencePermissionRequest(id, ctx) {
  const actor = requireAuth(ctx);
  if (!isAdmin(actor)) {
    throw new Error("Solo los administradores pueden reabrir una solicitud");
  }

  const permission = await AbsencePermission.findById(id);
  if (!permission) throw new Error("Solicitud de permiso no encontrada");

  if (permission.requestStatus === "PENDING") {
    throw new Error("La solicitud ya está en estado PENDIENTE");
  }

  const actorId = actor._id || actor.id;

  permission.requestStatus = "PENDING";
  permission.justificationStatus = "PENDING_REVIEW";
  permission.reviewedBy = null;
  permission.reviewedAt = null;
  permission.statusHistory.push({
    requestStatus: "PENDING",
    justificationStatus: "PENDING_REVIEW",
    changedBy: actorId,
    changedByModel: "User",
    notes: "Solicitud reabierta para revisión",
    changedAt: new Date(),
  });

  await permission.save();

  return await AbsencePermission.findById(id)
    .populate("student")
    .populate("requestedByParent")
    .populate("requestedByUser")
    .populate("rehearsalSession")
    .populate("event")
    .populate("reviewedBy");
}

// ============================================
// QUERIES — PARENT VIEW
// ============================================

async function getMyAbsencePermissions(limit = 20, offset = 0, ctx) {
  const actor = requireAuth(ctx);
  if (!isParent(actor)) {
    throw new Error("Esta query es exclusiva para padres de familia");
  }

  const parentId = actor._id || actor.id;
  const query = { requestedByParent: parentId };

  const [items, totalCount] = await Promise.all([
    AbsencePermission.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .populate("student")
      .populate("rehearsalSession")
      .populate("event")
      .populate("reviewedBy"),
    AbsencePermission.countDocuments(query),
  ]);

  return { items, totalCount, hasMore: offset + limit < totalCount };
}

async function getAbsencePermissionsForChild(
  childId,
  limit = 20,
  offset = 0,
  ctx,
) {
  const actor = requireAuth(ctx);

  if (isParent(actor)) {
    const parentId = actor._id || actor.id;
    await validateParentOwnsStudent(parentId, childId);
  } else if (!isAdmin(actor)) {
    throw new Error("No autorizado");
  }

  const query = { student: childId };

  const [items, totalCount] = await Promise.all([
    AbsencePermission.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .populate("student")
      .populate("requestedByParent")
      .populate("rehearsalSession")
      .populate("event")
      .populate("reviewedBy"),
    AbsencePermission.countDocuments(query),
  ]);

  return { items, totalCount, hasMore: offset + limit < totalCount };
}

// ============================================
// QUERIES — EXALUMNO / USER VIEW
// ============================================

async function getMyUserAbsencePermissions(limit = 20, offset = 0, ctx) {
  const actor = requireAuth(ctx);

  if (isParent(actor)) {
    throw new Error("Los padres deben usar getMyAbsencePermissions");
  }

  const userId = actor._id || actor.id;
  const query = { requestedByUser: userId };

  const [items, totalCount] = await Promise.all([
    AbsencePermission.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .populate("student")
      .populate("rehearsalSession")
      .populate("event")
      .populate("reviewedBy"),
    AbsencePermission.countDocuments(query),
  ]);

  return { items, totalCount, hasMore: offset + limit < totalCount };
}

// ============================================
// QUERIES — ADMIN VIEW
// ============================================

async function getAbsencePermissionsAdmin(
  filter = {},
  limit = 30,
  offset = 0,
  ctx,
) {
  const actor = requireAuth(ctx);
  if (!isAdmin(actor) && !isSectionPrincipal(actor)) {
    throw new Error("No autorizado");
  }

  const query = {};

  if (filter.requestStatus) query.requestStatus = filter.requestStatus;
  if (filter.justificationStatus)
    query.justificationStatus = filter.justificationStatus;
  if (filter.targetType) query.targetType = filter.targetType;
  if (filter.eventId) query.event = filter.eventId;
  if (filter.studentId) query.student = filter.studentId;

  if (filter.startDate || filter.endDate) {
    query.absenceDate = {};
    if (filter.startDate) query.absenceDate.$gte = new Date(filter.startDate);
    if (filter.endDate) query.absenceDate.$lte = new Date(filter.endDate);
  }

  // Filter by section: resolve which students belong to that section
  if (filter.section) {
    const studentsInSection = await User.find({
      $or: [{ section: filter.section }],
    }).select("_id instrument section");

    // Also match students whose instrument maps to the section
    const sectionStudentIds = studentsInSection
      .filter((u) => {
        const s = u.section || inferSectionFromInstrument(u.instrument);
        return s === filter.section;
      })
      .map((u) => u._id);

    query.student = { $in: sectionStudentIds };
  }

  const [items, totalCount] = await Promise.all([
    AbsencePermission.find(query)
      .sort({ requestStatus: 1, absenceDate: 1 })
      .limit(limit)
      .skip(offset)
      .populate("student")
      .populate("requestedByParent")
      .populate("requestedByUser")
      .populate("rehearsalSession")
      .populate("event")
      .populate("reviewedBy"),
    AbsencePermission.countDocuments(query),
  ]);

  return { items, totalCount, hasMore: offset + limit < totalCount };
}

// ============================================
// QUERIES — SECTION PRINCIPAL VIEW
// ============================================

async function getAbsencePermissionsForSection(
  section,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
  ctx,
) {
  const actor = requireAuth(ctx);
  if (!isSectionPrincipal(actor)) {
    throw new Error("No tienes permisos para ver esta información");
  }

  // Find all students in this section
  const allStudents = await User.find({
    state: { $in: ["Estudiante Activo", "Activo"] },
  }).select("_id instrument section");
  const sectionStudentIds = allStudents
    .filter((u) => {
      const s = u.section || inferSectionFromInstrument(u.instrument);
      return s === section;
    })
    .map((u) => u._id);

  const query = {
    student: { $in: sectionStudentIds },
    requestStatus: { $in: ["PENDING", "APPROVED"] },
  };

  if (startDate || endDate) {
    query.absenceDate = {};
    if (startDate) query.absenceDate.$gte = new Date(startDate);
    if (endDate) query.absenceDate.$lte = new Date(endDate);
  }

  const [items, totalCount] = await Promise.all([
    AbsencePermission.find(query)
      .sort({ absenceDate: 1, requestStatus: 1 })
      .limit(limit)
      .skip(offset)
      .populate("student")
      .populate("requestedByParent")
      .populate("requestedByUser")
      .populate("rehearsalSession")
      .populate("event")
      .populate("reviewedBy"),
    AbsencePermission.countDocuments(query),
  ]);

  return { items, totalCount, hasMore: offset + limit < totalCount };
}

// ============================================
// QUERIES — ATTENDANCE INTEGRATION
// ============================================

function suggestAttendanceStatus(permission) {
  if (permission.requestStatus === "APPROVED") {
    if (permission.justificationStatus === "JUSTIFIED")
      return "ABSENT_JUSTIFIED";
    if (permission.justificationStatus === "NOT_JUSTIFIED")
      return "ABSENT_UNJUSTIFIED";
  }
  // PENDING → no strong suggestion, but flag it
  return null;
}

async function getPermissionsForSession(sessionId, ctx) {
  requireAuth(ctx);

  const permissions = await AbsencePermission.find({
    rehearsalSession: sessionId,
    requestStatus: { $in: ["PENDING", "APPROVED"] },
  })
    .select(
      "_id student requestStatus justificationStatus reason requesterType",
    )
    .lean();

  return permissions.map((p) => ({
    id: p._id,
    studentId: p.student,
    requestStatus: p.requestStatus,
    justificationStatus: p.justificationStatus,
    reason: p.reason,
    requesterType: p.requesterType,
    suggestedAttendanceStatus: suggestAttendanceStatus(p),
  }));
}

async function getPermissionsForEvent(eventId, ctx) {
  requireAuth(ctx);

  const permissions = await AbsencePermission.find({
    event: eventId,
    requestStatus: { $in: ["PENDING", "APPROVED"] },
  })
    .select(
      "_id student requestStatus justificationStatus reason requesterType",
    )
    .lean();

  return permissions.map((p) => ({
    id: p._id,
    studentId: p.student,
    requestStatus: p.requestStatus,
    justificationStatus: p.justificationStatus,
    reason: p.reason,
    requesterType: p.requesterType,
    suggestedAttendanceStatus: suggestAttendanceStatus(p),
  }));
}

async function getAbsencePermission(id, ctx) {
  const actor = requireAuth(ctx);

  const permission = await AbsencePermission.findById(id)
    .populate("student")
    .populate("requestedByParent")
    .populate("requestedByUser")
    .populate("rehearsalSession")
    .populate("event")
    .populate("reviewedBy");

  if (!permission) throw new Error("Solicitud de permiso no encontrada");

  // Access control: only the requester, admin, or section principal can view
  const actorId = String(actor._id || actor.id);
  const isOwner =
    (permission.requesterType === "PARENT" &&
      permission.requestedByParent &&
      String(
        permission.requestedByParent._id || permission.requestedByParent,
      ) === actorId) ||
    (permission.requesterType === "USER" &&
      permission.requestedByUser &&
      String(permission.requestedByUser._id || permission.requestedByUser) ===
        actorId);

  if (!isOwner && !isAdmin(actor) && !isSectionPrincipal(actor)) {
    throw new Error("No tienes acceso a esta solicitud");
  }

  return permission;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Mutations
  createAbsencePermissionRequest,
  reviewAbsencePermissionRequest,
  cancelAbsencePermissionRequest,
  reopenAbsencePermissionRequest,

  // Queries
  getMyAbsencePermissions,
  getAbsencePermissionsForChild,
  getMyUserAbsencePermissions,
  getAbsencePermissionsAdmin,
  getAbsencePermissionsForSection,
  getPermissionsForSession,
  getPermissionsForEvent,
  getAbsencePermission,
};
