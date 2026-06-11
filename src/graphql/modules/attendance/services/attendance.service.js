const Attendance = require("../../../../../models/Attendance");
const RehearsalSession = require("../../../../../models/RehearsalSession");
const User = require("../../../../../models/User");
const { normalizeDateToStartOfDayCR } = require("../../../../../utils/dates");
const { inferSectionFromInstrument } = require("../../../../../utils/sections");
const { Types } = require("mongoose");

const MAX_ATTENDANCE_PAGE_SIZE = 100;
const DEFAULT_ATTENDANCE_PAGE_SIZE = 50;
const STATUS_KEYS = [
  "PRESENT",
  "LATE",
  "ABSENT_UNJUSTIFIED",
  "ABSENT_JUSTIFIED",
  "JUSTIFIED_WITHDRAWAL",
  "UNJUSTIFIED_WITHDRAWAL",
];

function clampLimit(limit, fallback = DEFAULT_ATTENDANCE_PAGE_SIZE) {
  return Math.min(Math.max(Number(limit) || fallback, 1), MAX_ATTENDANCE_PAGE_SIZE);
}

function toObjectId(value) {
  if (!value || !Types.ObjectId.isValid(value)) return null;
  return new Types.ObjectId(value);
}

function addOneDay(date) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function buildDateRange(filter = {}) {
  const range = {};
  if (filter.startDate) {
    range.$gte = normalizeDateToStartOfDayCR(filter.startDate);
  }
  if (filter.endDate) {
    range.$lt = addOneDay(normalizeDateToStartOfDayCR(filter.endDate));
  }
  return Object.keys(range).length ? range : null;
}

function encodeAttendanceCursor(attendance) {
  if (!attendance?._effectiveDate || !attendance?._id) return null;
  return Buffer.from(
    JSON.stringify({
      d: new Date(attendance._effectiveDate).toISOString(),
      id: String(attendance._id),
    }),
  ).toString("base64");
}

function decodeAttendanceCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    const date = new Date(parsed.d);
    const id = toObjectId(parsed.id);
    if (Number.isNaN(date.getTime()) || !id) return null;
    return { date, id };
  } catch (_err) {
    throw new Error("Cursor de asistencia inválido");
  }
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactCaseInsensitiveRegex(value) {
  return new RegExp(`^${escapeRegExp(value)}$`, "i");
}

function getCurrentUserScope(ctx, filter = {}) {
  const currentUser = requireAuth(ctx);
  const role = String(currentUser?.role || "").toUpperCase();
  const isAdmin = role === "ADMIN";
  if (isAdmin || !currentUser) return filter.instrument || null;
  return currentUser.instrument || filter.instrument || null;
}

function emptySummary() {
  return {
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    absentJustified: 0,
    absentUnjustified: 0,
    justifiedWithdrawals: 0,
    unjustifiedWithdrawals: 0,
  };
}

function countersToSummary(total, counters = {}) {
  const present = counters.PRESENT || 0;
  const late = counters.LATE || 0;
  const absentJustified = counters.ABSENT_JUSTIFIED || 0;
  const absentUnjustified = counters.ABSENT_UNJUSTIFIED || 0;
  const justifiedWithdrawals = counters.JUSTIFIED_WITHDRAWAL || 0;
  const unjustifiedWithdrawals = counters.UNJUSTIFIED_WITHDRAWAL || 0;
  return {
    total,
    present,
    absent: absentJustified + absentUnjustified + justifiedWithdrawals + unjustifiedWithdrawals,
    late,
    absentJustified,
    absentUnjustified,
    justifiedWithdrawals,
    unjustifiedWithdrawals,
  };
}
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
  const role = String(user?.role || "").toUpperCase();

  if (!user || role !== "ADMIN") {
    throw new Error("Se requieren permisos de administrador");
  }
  return user;
}

function requireSectionLeader(ctx, allowedSections = []) {
  const user = requireAuth(ctx);
  if (!user) throw new Error("No autenticado");

  const validRoles = ["ADMIN", "PRINCIPAL DE SECCIÓN", "ASISTENTE DE SECCIÓN"];
  const role = String(user.role || "").toUpperCase();
  if (!validRoles.includes(role)) {
    throw new Error("No tienes permisos para pasar lista");
  }

  const isAdmin = role === "ADMIN";

  // Admin puede pasar lista de cualquier sección
  if (!isAdmin && allowedSections.length > 0) {
    const userSection = user.section || inferSectionFromInstrument(user.instrument);
    if (!userSection) throw new Error("Tu usuario no tiene sección asignada");
    if (!allowedSections.includes(userSection)) {
      throw new Error("No puedes pasar lista de esta sección");
    }
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
      const isAdmin = String(user?.role || "").toUpperCase() === "ADMIN";
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
          attendanceDate: dateNormalized,
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
  attendance.notes = notes ?? attendance.notes;
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
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 1000);
  const safeOffset = Math.max(Number(offset) || 0, 0);

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

    const sessions = await RehearsalSession.find(sessionQuery).select("_id").lean();
    sessionIds = sessions.map((s) => s._id);
    query.session = { $in: sessionIds };
  }

  const attendances = await Attendance.find(query)
    .populate("user", "name firstSurName secondSurName instrument role")
    .populate("session", "date dateNormalized section status takenBy takenAt closedAt")
    .populate("recordedBy", "name firstSurName secondSurName")
    .sort({ createdAt: -1, _id: -1 })
    .limit(safeLimit)
    .skip(safeOffset)
    .lean();

  return attendances.map((attendance) => ({
    ...attendance,
    id: String(attendance._id),
    user: attendance.user
      ? {
          ...attendance.user,
          id: String(attendance.user._id),
        }
      : null,
    session: attendance.session
      ? {
          ...attendance.session,
          id: String(attendance.session._id),
        }
      : null,
    recordedBy: attendance.recordedBy
      ? {
          ...attendance.recordedBy,
          id: String(attendance.recordedBy._id),
        }
      : null,
  }));
}

function buildAttendanceConnectionPipeline(filter = {}, ctx = {}, { includeCursor = true } = {}) {
  const currentUser = requireAuth(ctx);
  const scopedInstrument = getCurrentUserScope(ctx, filter);
  const match = {};
  const dateRange = buildDateRange(filter);

  if (filter.userId) {
    const userId = toObjectId(filter.userId);
    if (!userId) throw new Error("userId inválido");
    match.user = userId;
  }

  if (filter.status) {
    match.status = filter.status;
  }

  if (dateRange) match.attendanceDate = dateRange;

  if (includeCursor && filter.cursor) {
    const cursor = decodeAttendanceCursor(filter.cursor);
    match.$or = [
      { attendanceDate: { $lt: cursor.date } },
      { attendanceDate: cursor.date, _id: { $lt: cursor.id } },
    ];
  }

  const pipeline = [];
  if (Object.keys(match).length) pipeline.push({ $match: match });
  pipeline.push({ $sort: { attendanceDate: -1, _id: -1 } });

  pipeline.push(
    {
      $lookup: {
        from: User.collection.name,
        localField: "user",
        foreignField: "_id",
        as: "user",
        pipeline: [
          {
            $project: {
              name: 1,
              firstSurName: 1,
              secondSurName: 1,
              instrument: 1,
              role: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: RehearsalSession.collection.name,
        localField: "session",
        foreignField: "_id",
        as: "session",
        pipeline: [
          {
            $project: {
              date: 1,
              dateNormalized: 1,
              section: 1,
              status: 1,
              takenBy: 1,
              takenAt: 1,
              closedAt: 1,
            },
          },
        ],
      },
    },
    { $unwind: { path: "$session", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "recordedBy",
        foreignField: "_id",
        as: "recordedBy",
        pipeline: [{ $project: { name: 1, firstSurName: 1, secondSurName: 1 } }],
      },
    },
    { $unwind: { path: "$recordedBy", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        _effectiveDate: {
          $ifNull: [
            "$attendanceDate",
            {
              $ifNull: [
                "$legacyDate",
                {
                  $ifNull: [
                    "$session.dateNormalized",
                    { $ifNull: ["$session.date", "$createdAt"] },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  );

  const postLookupMatch = {};
  if (dateRange) postLookupMatch._effectiveDate = dateRange;
  if (filter.section) postLookupMatch["session.section"] = filter.section;
  if (scopedInstrument) {
    postLookupMatch["user.instrument"] = exactCaseInsensitiveRegex(scopedInstrument);
  }
  if (filter.search && String(filter.search).trim()) {
    const rx = new RegExp(escapeRegExp(String(filter.search).trim()), "i");
    postLookupMatch.$or = [
      { "user.name": rx },
      { "user.firstSurName": rx },
      { "user.secondSurName": rx },
      { "user.instrument": rx },
    ];
  }

  if (Object.keys(postLookupMatch).length) {
    pipeline.push({ $match: postLookupMatch });
  }

  return { pipeline, currentUser };
}

function projectAttendanceConnectionNode() {
  return {
    $project: {
      id: { $toString: "$_id" },
      _id: 1,
      status: 1,
      notes: 1,
      createdAt: 1,
      updatedAt: 1,
      legacyDate: 1,
      legacyAttended: 1,
      attendanceDate: "$_effectiveDate",
      user: {
        $cond: [
          "$user._id",
          {
            id: { $toString: "$user._id" },
            name: "$user.name",
            firstSurName: "$user.firstSurName",
            secondSurName: "$user.secondSurName",
            instrument: "$user.instrument",
            role: "$user.role",
          },
          null,
        ],
      },
      session: {
        $cond: [
          "$session._id",
          {
            id: { $toString: "$session._id" },
            date: "$session.date",
            dateNormalized: "$session.dateNormalized",
            section: "$session.section",
            status: "$session.status",
            takenAt: "$session.takenAt",
            closedAt: "$session.closedAt",
          },
          null,
        ],
      },
      recordedBy: {
        $cond: [
          "$recordedBy._id",
          {
            id: { $toString: "$recordedBy._id" },
            name: "$recordedBy.name",
            firstSurName: "$recordedBy.firstSurName",
            secondSurName: "$recordedBy.secondSurName",
          },
          null,
        ],
      },
      _effectiveDate: 1,
    },
  };
}

function buildUserAttendanceStats(rows = []) {
  return rows
    .filter((row) => row?._id && row.total > 0)
    .map((row) => {
      const counts = STATUS_KEYS.reduce((acc, key) => {
        acc[key] = 0;
        return acc;
      }, {});
      (row.statuses || []).forEach((statusRow) => {
        if (statusRow?.status && counts[statusRow.status] !== undefined) {
          counts[statusRow.status] = statusRow.count || 0;
        }
      });

      const attendanceCredits =
        counts.PRESENT +
        counts.LATE +
        counts.ABSENT_JUSTIFIED * 0.5 +
        counts.JUSTIFIED_WITHDRAWAL * 0.75;
      const unjustifiedCount =
        counts.ABSENT_UNJUSTIFIED + counts.UNJUSTIFIED_WITHDRAWAL;
      const equivalentAbsences =
        unjustifiedCount + counts.ABSENT_JUSTIFIED * 0.5 + counts.JUSTIFIED_WITHDRAWAL * 0.25;
      const attendancePercentage = row.total > 0 ? (attendanceCredits / row.total) * 100 : 0;

      return {
        userId: String(row._id),
        user: row.user
          ? {
              id: String(row.user._id),
              name: row.user.name,
              firstSurName: row.user.firstSurName,
              secondSurName: row.user.secondSurName,
              instrument: row.user.instrument,
              role: row.user.role,
            }
          : null,
        totalSessions: row.total,
        attendancePercentage: Number(attendancePercentage.toFixed(2)),
        unjustifiedCount,
        equivalentAbsences: Number(equivalentAbsences.toFixed(2)),
        hasThreeUnjustified: unjustifiedCount >= 3,
        exceedsLimit: equivalentAbsences > 6,
      };
    });
}

function buildWorstUsers(rows = [], topN = 8) {
  return buildUserAttendanceStats(rows)
    .sort((a, b) => {
      if (a.attendancePercentage !== b.attendancePercentage) {
        return a.attendancePercentage - b.attendancePercentage;
      }
      return b.unjustifiedCount - a.unjustifiedCount;
    })
    .slice(0, topN);
}

async function getAttendancesRehearsalConnection({ limit, filter = {} } = {}, ctx) {
  const safeLimit = clampLimit(limit);
  const { pipeline: pagePipeline } = buildAttendanceConnectionPipeline(filter || {}, ctx);
  const { pipeline: metricsPipeline } = buildAttendanceConnectionPipeline(filter || {}, ctx, {
    includeCursor: false,
  });

  const [pageRows, metricsRows] = await Promise.all([
    Attendance.aggregate([
      ...pagePipeline,
      {
        $facet: {
          nodes: [{ $limit: safeLimit + 1 }, projectAttendanceConnectionNode()],
        },
      },
    ]).allowDiskUse(false),
    Attendance.aggregate([
      ...metricsPipeline,
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          statusCounts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          availableFilters: [
            {
              $group: {
                _id: null,
                instruments: { $addToSet: "$user.instrument" },
                sections: { $addToSet: "$session.section" },
              },
            },
          ],
          userStats: [
            { $match: { "user._id": { $ne: null } } },
            {
              $group: {
                _id: { user: "$user._id", status: "$status" },
                count: { $sum: 1 },
                user: { $first: "$user" },
              },
            },
            {
              $group: {
                _id: "$_id.user",
                total: { $sum: "$count" },
                user: { $first: "$user" },
                statuses: { $push: { status: "$_id.status", count: "$count" } },
              },
            },
          ],
        },
      },
    ]).allowDiskUse(false),
  ]);

  const pageResult = pageRows?.[0] || {};
  const metricsResult = metricsRows?.[0] || {};
  const fetchedNodes = pageResult.nodes || [];
  const userStats = buildUserAttendanceStats(metricsResult.userStats || []);
  const userStatsById = new Map(userStats.map((row) => [row.userId, row]));
  const hasNextPage = fetchedNodes.length > safeLimit;
  const nodes = (hasNextPage ? fetchedNodes.slice(0, safeLimit) : fetchedNodes).map((node) => {
    const stats = node.user?.id ? userStatsById.get(String(node.user.id)) : null;
    return {
      ...node,
      userAttendancePercentage: stats?.attendancePercentage ?? 0,
      userUnjustifiedCount: stats?.unjustifiedCount ?? 0,
      userEquivalentAbsences: stats?.equivalentAbsences ?? 0,
    };
  });
  const lastNode = nodes[nodes.length - 1];
  const totalCount = metricsResult.totalCount?.[0]?.count || 0;

  const counters = {};
  (metricsResult.statusCounts || []).forEach((row) => {
    counters[row._id] = row.count;
  });

  const available = metricsResult.availableFilters?.[0] || {};

  return {
    nodes,
    pageInfo: {
      hasNextPage,
      endCursor: hasNextPage ? encodeAttendanceCursor(lastNode) : null,
    },
    totalCount,
    summary: countersToSummary(totalCount, counters),
    availableFilters: {
      instruments: (available.instruments || []).filter(Boolean).sort(),
      sections: (available.sections || []).filter(Boolean).sort(),
    },
    worstUsers: buildWorstUsers(metricsResult.userStats || [], 8),
  };
}

// ============================================
// ESTADÍSTICAS
// ============================================

async function getUserAttendanceStats(userId, startDate, endDate, ctx) {
  requireAuth(ctx);

  const user = await User.findById(userId);
  if (!user) throw new Error("Usuario no existe");
  const userSection = user.section || inferSectionFromInstrument(user.instrument);
  if (!userSection) throw new Error("El usuario no tiene sección asignada");

  // 1) Sesiones válidas para calcular asistencia (solo de su sección)
  const sessionQuery = {
    section: userSection,
    status: { $in: ["IN_PROGRESS", "CLOSED"] },
  };

  if (startDate || endDate) {
    sessionQuery.dateNormalized = {};
    if (startDate) {
      sessionQuery.dateNormalized.$gte = normalizeDateToStartOfDayCR(startDate);
    }
    if (endDate) {
      sessionQuery.dateNormalized.$lte = normalizeDateToStartOfDayCR(endDate);
    }
  }

  const sessions = await RehearsalSession.find(sessionQuery).select("_id");
  const sessionIds = sessions.map((s) => s._id);
  const totalSessions = sessions.length;

  if (totalSessions === 0) {
    return {
      userId,
      user,
      totalSessions: 0,
      present: 0,
      late: 0,
      absentUnjustified: 0,
      absentJustified: 0,
      excusedBefore: 0,
      excusedAfter: 0,
      unjustifiedWithdrawals: 0,
      justifiedWithdrawals: 0,
      missingAsUnjustified: 0,
      unjustifiedCount: 0,
      justifiedCount: 0,
      equivalentAbsences: 0,
      attendanceCredits: 0,
      attendancePercentage: 0,
      strictAttendancePercentage: 0,
      hasThreeUnjustified: false,
      exceedsLimit: false,
    };
  }

  // 2) Asistencias del usuario en esas sesiones
  const attendances = await Attendance.find({
    user: userId,
    session: { $in: sessionIds },
  }).select("status session");

  // 3) Conteo por estado
  const counters = {
    present: 0,
    late: 0,
    absentUnjustifiedOnly: 0,
    absentJustifiedOnly: 0,
    unjustifiedWithdrawals: 0,
    justifiedWithdrawals: 0,
  };

  const attendedSessionSet = new Set();

  attendances.forEach((att) => {
    attendedSessionSet.add(String(att.session));

    switch (att.status) {
      case "PRESENT":
        counters.present++;
        break;
      case "LATE":
        counters.late++;
        break;
      case "ABSENT_UNJUSTIFIED":
        counters.absentUnjustifiedOnly++;
        break;
      case "ABSENT_JUSTIFIED":
        counters.absentJustifiedOnly++;
        break;
      case "UNJUSTIFIED_WITHDRAWAL":
        counters.unjustifiedWithdrawals++;
        break;
      case "JUSTIFIED_WITHDRAWAL":
        counters.justifiedWithdrawals++;
        break;
      default:
        break;
    }
  });

  // 4) Sesiones sin registro -> cuentan como injustificadas
  const missingAsUnjustified = Math.max(
    0,
    totalSessions - attendedSessionSet.size,
  );

  // 5) Totales agregados
  const unjustifiedCount =
    counters.absentUnjustifiedOnly +
    counters.unjustifiedWithdrawals +
    missingAsUnjustified;

  const justifiedCount =
    counters.absentJustifiedOnly + counters.justifiedWithdrawals;

  // 6) Nuevas reglas
  // - Ausencia justificada = 0.5 ausencia equivalente
  // - Retiro justificado = 0.25 ausencia equivalente
  const equivalentAbsences =
    unjustifiedCount +
    counters.absentJustifiedOnly * 0.5 +
    counters.justifiedWithdrawals * 0.25;

  // Créditos de asistencia
  // PRESENT = 1
  // LATE = 1
  // ABSENT_JUSTIFIED = 0.5
  // JUSTIFIED_WITHDRAWAL = 0.75
  const attendanceCredits =
    counters.present +
    counters.late +
    counters.absentJustifiedOnly * 0.5 +
    counters.justifiedWithdrawals * 0.75;

  const attendancePercentage = (attendanceCredits / totalSessions) * 100;

  const strictAttendancePercentage =
    ((counters.present + counters.late) / totalSessions) * 100;

  // 7) Alertas rápidas
  const hasThreeUnjustified = unjustifiedCount >= 3;
  const exceedsLimit = equivalentAbsences > 6;

  return {
    userId,
    user,
    totalSessions,

    present: counters.present,
    late: counters.late,

    // Compatibilidad
    absentUnjustified: unjustifiedCount,
    absentJustified: justifiedCount,
    excusedBefore: 0,
    excusedAfter: 0,

    unjustifiedWithdrawals: counters.unjustifiedWithdrawals,
    justifiedWithdrawals: counters.justifiedWithdrawals,
    missingAsUnjustified,

    unjustifiedCount,
    justifiedCount,

    equivalentAbsences: parseFloat(equivalentAbsences.toFixed(2)),
    attendanceCredits: parseFloat(attendanceCredits.toFixed(2)),
    attendancePercentage: parseFloat(attendancePercentage.toFixed(2)),
    strictAttendancePercentage: parseFloat(
      strictAttendancePercentage.toFixed(2),
    ),

    hasThreeUnjustified,
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
  getAttendancesRehearsalConnection,
  getUserAttendanceStats,
};
