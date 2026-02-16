const Attendance = require("../../../../../models/Attendance");
const RehearsalSession = require("../../../../../models/RehearsalSession");
const User = require("../../../../../models/User");
const { normalizeDateToStartOfDayCR } = require("../../../../../utils/dates");
// ============================================
// HELPERS DE AUTENTICACIÓN Y PERMISOS
// ============================================

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);
  // Activar cuando auth esté implementado:
  // if (!currentUser) throw new Error("No autenticado");
  return currentUser;
}

function requireAdmin(ctx) {
  const user = requireAuth(ctx);

  if (!user || user.role !== "Admin") {
    throw new Error("Se requieren permisos de administrador");
  }
  return user;
}

function requireSectionLeader(ctx, allowedSections = []) {
  const user = requireAuth(ctx);

  const validRoles = ["Admin", "Principal de sección", "Asistente de sección"];
  if (!user || !validRoles.includes(user.role)) {
    throw new Error("No tienes permisos para pasar lista");
  }
  if (
    user.role !== "Admin" &&
    allowedSections.length > 0 &&
    !allowedSections.includes(user.section)
  ) {
    throw new Error("No puedes pasar lista de esta sección");
  }

  return user;
}

// ============================================
// SESSION MANAGEMENT
// ============================================

async function createSession(input, ctx) {
  if (!input || !input.date || !input.section) {
    throw new Error("Fecha y sección requeridas");
  }

  requireSectionLeader(ctx, [input.section]);

  const dateNormalized = normalizeDateToStartOfDayCR(input.date);

  try {
    // Intento de creación idempotente
    const session = await RehearsalSession.findOneAndUpdate(
      { dateNormalized, section: input.section },
      {
        $setOnInsert: {
          date: dateNormalized,
          dateNormalized,
          section: input.section,
          status: "SCHEDULED",
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return session;
  } catch (error) {
    if (error.code === 11000) {
      // Ya existe, retornar la sesión existente
      const existing = await RehearsalSession.findOne({
        dateNormalized,
        section: input.section,
      });
      return existing;
    }
    throw error;
  }
}

async function getActiveSession(date, section, ctx) {
  requireAuth(ctx);

  const dateNormalized = normalizeDateToStartOfDayCR(date);

  const session = await RehearsalSession.findOne({
    dateNormalized,
    section,
  }).populate("takenBy");

  return session;
}

async function closeSession(id, ctx) {
  const session = await RehearsalSession.findById(id);
  if (!session) throw new Error("Sesión no encontrada");

  requireSectionLeader(ctx, [session.section]);

  if (session.status === "CLOSED") throw new Error("La sesión ya está cerrada");

  session.status = "CLOSED";
  session.closedAt = new Date();
  await session.save();

  return session;
}

async function getSessions(limit = 20, offset = 0, filter = {}, ctx) {
  requireAuth(ctx);

  const query = {};

  if (filter.startDate || filter.endDate) {
    query.dateNormalized = {};
    if (filter.startDate) {
      query.dateNormalized.$gte = normalizeDateToStartOfDayCR(filter.startDate);
    }
    if (filter.endDate) {
      query.dateNormalized.$lte = normalizeDateToStartOfDayCR(filter.endDate);
    }
  }

  if (filter.section) {
    query.section = filter.section;
  }

  const sessions = await RehearsalSession.find(query)
    .sort({ dateNormalized: -1 })
    .limit(limit)
    .skip(offset)
    .populate("takenBy");

  const totalCount = await RehearsalSession.countDocuments(query);

  return {
    sessions,
    totalCount,
    hasMore: offset + limit < totalCount,
  };
}

async function getSectionComplianceReport(startDate, endDate, ctx) {
  requireAuth(ctx);

  const start = normalizeDateToStartOfDayCR(startDate);
  const end = normalizeDateToStartOfDayCR(endDate);

  // Todas las secciones esperadas
  const allSections = [
    "NO_APLICA",
    "FLAUTAS",
    "CLARINETES",
    "SAXOFONES",
    "TROMPETAS",
    "TROMBONES",
    "TUBAS",
    "EUFONIOS",
    "CORNOS",
    "MALLETS",
    "PERCUSION",
    "COLOR_GUARD",
    "DANZA",
  ];

  // Generar todos los sábados en el rango
  const expectedDates = [];
  let current = new Date(start);
  while (current <= end) {
    if (current.getDay() === 6) {
      // Sábado
      expectedDates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  // Buscar sesiones registradas
  const sessions = await RehearsalSession.find({
    dateNormalized: { $gte: start, $lte: end },
  }).select("dateNormalized section");

  const report = allSections.map((section) => {
    const sectionSessions = sessions.filter((s) => s.section === section);
    const recordedDates = sectionSessions.map((s) =>
      s.dateNormalized.toISOString(),
    );

    const missedDates = expectedDates
      .filter((d) => !recordedDates.includes(d.toISOString()))
      .map((d) => d.toISOString().split("T")[0]);

    return {
      section,
      missedDates,
      compliant: missedDates.length === 0,
    };
  });

  return report;
}

// ============================================
// ATTENDANCE MANAGEMENT (IDEMPOTENTE)
// ============================================

async function takeAttendance(date, section, attendances, ctx) {
  const user = requireSectionLeader(ctx, [section]);

  if (!date || !section || !attendances || attendances.length === 0) {
    throw new Error("Fecha, sección y asistencias requeridas");
  }

  const dateNormalized = normalizeDateToStartOfDayCR(date);

  // 1. Buscar o crear sesión (idempotente)
  let session = await RehearsalSession.findOne({ dateNormalized, section });

  if (!session) {
    session = await RehearsalSession.create({
      date: dateNormalized,
      dateNormalized,
      section,
      status: "IN_PROGRESS",
      takenBy: user?._id,
      takenAt: new Date(),
    });
  } else {
    // Validar que no esté cerrada
    if (session.status === "CLOSED") {
      // Solo admin puede editar sesión cerrada
      requireAdmin(ctx);
    }

    // Validar que no haya sido pasada lista ya (solo encargados)
    if (
      session.takenBy &&
      session.takenBy.toString() !== user?._id?.toString()
    ) {
      const isAdmin = user?.role === "Admin";
      if (!isAdmin) {
        throw new Error(
          "La lista ya fue pasada por otro encargado. Solo administradores pueden editar.",
        );
      }
    }

    // Actualizar info de quien pasó lista
    if (!session.takenBy) {
      session.takenBy = user?._id;
      session.takenAt = new Date();
      session.status = "IN_PROGRESS";
      await session.save();
    }
  }

  // 2. Validar todos los usuarios existen
  const userIds = attendances.map((a) => a.userId);
  const users = await User.find({ _id: { $in: userIds } });

  if (users.length !== userIds.length) {
    throw new Error("Uno o más usuarios no existen");
  }

  // 3. UPSERT de asistencias (idempotente por índice único session + user)
  const bulkOps = attendances.map((att) => ({
    updateOne: {
      filter: {
        session: session._id,
        user: att.userId,
      },
      update: {
        $set: {
          status: att.status,
          notes: att.notes || "",
          recordedBy: user?._id,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          session: session._id,
          user: att.userId,
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  await Attendance.bulkWrite(bulkOps);

  // 4. Retornar sesión actualizada con asistencias
  const updated = await RehearsalSession.findById(session._id).populate(
    "takenBy",
  );

  return updated;
}

async function updateAttendance(id, status, notes, ctx) {
  const user = requireAdmin(ctx); // Solo admin puede actualizar individual

  if (!id || !status) {
    throw new Error("ID y estado requeridos");
  }

  const attendance = await Attendance.findById(id).populate("session");
  if (!attendance) throw new Error("Registro de asistencia no encontrado");

  attendance.status = status;
  attendance.notes = notes || attendance.notes;
  attendance.updatedAt = new Date();
  await attendance.save();

  return await Attendance.findById(id)
    .populate("user")
    .populate("session")
    .populate("recordedBy");
}

async function deleteAttendance(id, ctx) {
  requireAdmin(ctx);

  const deleted = await Attendance.findByIdAndDelete(id);
  if (!deleted) throw new Error("Registro no encontrado");

  return "Registro de asistencia eliminado";
}

async function deleteSession(id, ctx) {
  requireAdmin(ctx);

  // Eliminar sesión y todas sus asistencias
  const session = await RehearsalSession.findById(id);
  if (!session) throw new Error("Sesión no encontrada");

  const user = requireSectionLeader(ctx, [session.section]);

  await Attendance.deleteMany({ session: id });
  await RehearsalSession.findByIdAndDelete(id);

  return "Sesión y asistencias eliminadas";
}

// ============================================
// QUERIES
// ============================================

async function getAttendance(id, ctx) {
  requireAuth(ctx);

  const attendance = await Attendance.findById(id)
    .populate("user")
    .populate("session")
    .populate("recordedBy");

  if (!attendance) throw new Error("Asistencia no encontrada");
  return attendance;
}

async function getAttendancesByUser(userId, limit = 50, offset = 0, ctx) {
  requireAuth(ctx);

  const user = await User.findById(userId);
  if (!user) throw new Error("Usuario no existe");

  const attendances = await Attendance.find({ user: userId })
    .populate("session")
    .populate("recordedBy")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset);

  return attendances;
}

async function getAllAttendancesRehearsal(
  limit = 50,
  offset = 0,
  filter = {},
  ctx,
) {
  requireAuth(ctx);

  const query = {};

  if (filter.userId) {
    query.user = filter.userId;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  // Filtros por fecha requieren join con session
  let sessionIds = null;
  if (filter.startDate || filter.endDate || filter.section) {
    const sessionQuery = {};

    if (filter.startDate || filter.endDate) {
      sessionQuery.dateNormalized = {};
      if (filter.startDate) {
        sessionQuery.dateNormalized.$gte = normalizeDateToStartOfDayCR(
          filter.startDate,
        );
      }
      if (filter.endDate) {
        sessionQuery.dateNormalized.$lte = normalizeDateToStartOfDayCR(
          filter.endDate,
        );
      }
    }

    if (filter.section) {
      sessionQuery.section = filter.section;
    }

    const sessions = await RehearsalSession.find(sessionQuery).select("_id");
    sessionIds = sessions.map((s) => s._id);
    query.session = { $in: sessionIds };
  }

  const attendances = await Attendance.find(query)
    .populate("user")
    .populate("session")
    .populate("recordedBy")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset);

  return attendances;
}

// ============================================
// ESTADÍSTICAS
// ============================================

async function getUserAttendanceStats(userId, startDate, endDate, ctx) {
  requireAuth(ctx);

  const user = await User.findById(userId);
  if (!user) throw new Error("Usuario no existe");

  const sessionQuery = {
    section: user.section,
    status: { $in: ["IN_PROGRESS", "CLOSED"] },
  };

  if (startDate || endDate) {
    sessionQuery.dateNormalized = {};
    if (startDate)
      sessionQuery.dateNormalized.$gte = normalizeDateToStartOfDayCR(startDate);
    if (endDate)
      sessionQuery.dateNormalized.$lte = normalizeDateToStartOfDayCR(endDate);
  }

  const sessions = await RehearsalSession.find(sessionQuery).select("_id");
  const sessionIds = sessions.map((s) => s._id);

  const attendances = await Attendance.find({
    user: userId,
    session: { $in: sessionIds },
  }).select("status session");

  const stats = {
    present: 0,
    absentUnjustified: 0,
    absentJustified: 0,
    late: 0,
  };

  // Conteo por status
  const attendedSessionSet = new Set();
  attendances.forEach((att) => {
    attendedSessionSet.add(String(att.session));

    switch (att.status) {
      case "PRESENT":
        stats.present++;
        break;
      case "LATE":
        stats.late++;
        break;
      case "ABSENT_UNJUSTIFIED":
      case "UNJUSTIFIED_WITHDRAWAL":
        stats.absentUnjustified++;
        break;
      case "ABSENT_JUSTIFIED":
      case "JUSTIFIED_WITHDRAWAL":
        stats.absentJustified++;
        break;
    }
  });

  // Sesiones tomadas donde NO existe registro del usuario
  const totalSessions = sessions.length;
  const missing = totalSessions - attendedSessionSet.size;

  // Política recomendada: missing = ausencia injustificada
  if (missing > 0) stats.absentUnjustified += missing;

  const equivalentAbsences =
    stats.absentUnjustified + stats.absentJustified / 2;

  const attendedCount = stats.present + stats.late;
  const attendancePercentage =
    totalSessions > 0 ? (attendedCount / totalSessions) * 100 : 0;

  const exceedsLimit = equivalentAbsences > 6;

  return {
    userId,
    user,
    totalSessions,
    present: stats.present,
    absentUnjustified: stats.absentUnjustified,
    absentJustified: stats.absentJustified,
    late: stats.late,
    equivalentAbsences: parseFloat(equivalentAbsences.toFixed(2)),
    attendancePercentage: parseFloat(attendancePercentage.toFixed(2)),
    exceedsLimit,
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Auth
  requireAuth,
  requireAdmin,
  requireSectionLeader,

  // Sessions
  createSession,
  getActiveSession,
  closeSession,
  getSessions,
  getSectionComplianceReport,
  deleteSession,

  // Attendance
  takeAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendance,
  getAttendancesByUser,
  getAllAttendancesRehearsal,
  getUserAttendanceStats,
};
