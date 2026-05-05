// services/presentations.service.js
const PerformanceAttendance = require("../../../../../models/PerformanceAttendance");
const EventRoster = require("../../../../../models/EventRoster");
const Event = require("../../../../../models/Events");
const Hotel = require("../../../../../models/Hotel");
const User = require("../../../../../models/User");

const STAFF_ROLES = new Set(["Staff", "Dirección Logística"]);
const TRANSPORT_PAYMENT_ROLES = new Set([
  "Admin",
  "Director",
  "Subdirector",
  "Staff",
  "Dirección Logística",
]);
const INSTRUMENT_TO_SECTION_MAP = {
  flauta: "FLAUTAS",
  flute: "FLAUTAS",
  piccolo: "FLAUTAS",
  clarinete: "CLARINETES",
  clarinet: "CLARINETES",
  "clarinete bajo": "CLARINETES",
  "bass clarinet": "CLARINETES",
  saxofon: "SAXOFONES",
  saxofono: "SAXOFONES",
  saxo: "SAXOFONES",
  saxophone: "SAXOFONES",
  sax: "SAXOFONES",
  trompeta: "TROMPETAS",
  trumpet: "TROMPETAS",
  corneta: "TROMPETAS",
  trombon: "TROMBONES",
  trombone: "TROMBONES",
  eufonio: "EUFONIOS",
  euphonium: "EUFONIOS",
  baritono: "EUFONIOS",
  baritone: "EUFONIOS",
  cornos: "CORNOS",
  corno: "CORNOS",
  "corno frances": "CORNOS",
  "french horn": "CORNOS",
  horn: "CORNOS",
  tuba: "TUBAS",
  sousafon: "TUBAS",
  sousaphone: "TUBAS",
  mallets: "MALLETS",
  marimba: "MALLETS",
  xilofono: "MALLETS",
  vibrafono: "MALLETS",
  metalofono: "MALLETS",
  glockenspiel: "MALLETS",
  percusion: "PERCUSION",
  percussion: "PERCUSION",
  bateria: "PERCUSION",
  drums: "PERCUSION",
  bombo: "PERCUSION",
  tarola: "PERCUSION",
  snare: "PERCUSION",
  tenores: "PERCUSION",
  platillos: "PERCUSION",
  "color guard": "COLOR_GUARD",
  "guardia de color": "COLOR_GUARD",
  guard: "COLOR_GUARD",
  bandera: "COLOR_GUARD",
  rifle: "COLOR_GUARD",
  sable: "COLOR_GUARD",
  danza: "DANZA",
  dance: "DANZA",
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getAssignmentGroup(user) {
  if (STAFF_ROLES.has(user?.role)) return "STAFF";

  const normalizedInstrument = normalizeText(user?.instrument);
  if (!normalizedInstrument) return "NO_APLICA";

  const exact = INSTRUMENT_TO_SECTION_MAP[normalizedInstrument];
  if (exact) return exact;

  for (const [key, section] of Object.entries(INSTRUMENT_TO_SECTION_MAP)) {
    if (normalizedInstrument.includes(key)) return section;
  }

  return "NO_APLICA";
}

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return currentUser;
}

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (!user || user.role !== "Admin") {
    throw new Error("Se requieren permisos de administrador");
  }
  return user;
}

function requireTransportPaymentAccess(ctx) {
  const user = requireAuth(ctx);
  if (!user || !TRANSPORT_PAYMENT_ROLES.has(user.role)) {
    throw new Error("No autorizado para registrar pagos de transporte");
  }
  return user;
}

function uniqueBusNumbers(values = []) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a - b);
}

function getPlannedBusNumbers(entry) {
  if (
    Array.isArray(entry?.plannedBusNumbers) &&
    entry.plannedBusNumbers.length > 0
  ) {
    return uniqueBusNumbers(entry.plannedBusNumbers);
  }
  if (entry?.busNumber) return [entry.busNumber];
  return [];
}

function getActiveTransportEntries(roster = []) {
  return roster.filter(
    (entry) => !entry.excludedFromEvent && !entry.excludedFromTransport,
  );
}

async function removeOrphanEventRosterEntries(eventId) {
  if (!eventId) return 0;

  const rosterEntries = await EventRoster.find({ event: eventId })
    .select("_id user")
    .lean();
  if (rosterEntries.length === 0) return 0;

  const referencedUserIds = rosterEntries
    .map((entry) => String(entry.user || ""))
    .filter(Boolean);

  if (referencedUserIds.length === 0) {
    const result = await EventRoster.deleteMany({ event: eventId });
    return result.deletedCount || 0;
  }

  const existingUsers = await User.find({ _id: { $in: referencedUserIds } })
    .select("_id")
    .lean();
  const existingUserIds = new Set(
    existingUsers.map((user) => String(user._id)),
  );

  const orphanEntryIds = rosterEntries
    .filter((entry) => !existingUserIds.has(String(entry.user || "")))
    .map((entry) => entry._id);

  if (orphanEntryIds.length === 0) return 0;

  const result = await EventRoster.deleteMany({ _id: { $in: orphanEntryIds } });
  return result.deletedCount || 0;
}

function buildPlannedBusSummary(roster = []) {
  const buses = {};
  BUSES_LOOP: for (const bus of [1, 2, 3, 4, 5, 6]) {
    buses[bus] = {
      busNumber: bus,
      plannedCount: 0,
      confirmedCount: 0,
      members: [],
      groupSummary: {},
    };
  }

  const activeRoster = getActiveTransportEntries(roster);

  activeRoster.forEach((entry) => {
    if (entry.busNumber && buses[entry.busNumber]) {
      const bucket = buses[entry.busNumber];
      bucket.confirmedCount += 1;
      bucket.members.push(entry);
      const grp = entry.assignmentGroup || "SIN_GRUPO";
      bucket.groupSummary[grp] = (bucket.groupSummary[grp] || 0) + 1;
    }
  });

  const grouped = activeRoster.reduce((acc, entry) => {
    const key = entry.assignmentGroup || "SIN_GRUPO";
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  Object.values(grouped).forEach((entries) => {
    if (entries.length === 0) return;

    const sample = entries[0];
    const plannedBusNumbers = getPlannedBusNumbers(sample);
    if (plannedBusNumbers.length === 0) return;

    const transportPlan = sample.transportPlan || null;
    if (
      transportPlan?.mode === "FLEX" &&
      transportPlan.primaryBus &&
      transportPlan.secondaryBus &&
      transportPlan.primaryCapacity
    ) {
      const primaryCount = Math.min(
        entries.length,
        transportPlan.primaryCapacity,
      );
      const secondaryCount = Math.max(entries.length - primaryCount, 0);
      if (buses[transportPlan.primaryBus]) {
        buses[transportPlan.primaryBus].plannedCount += primaryCount;
      }
      if (secondaryCount > 0 && buses[transportPlan.secondaryBus]) {
        buses[transportPlan.secondaryBus].plannedCount += secondaryCount;
      }
      return;
    }

    if (plannedBusNumbers.length === 1 && buses[plannedBusNumbers[0]]) {
      buses[plannedBusNumbers[0]].plannedCount += entries.length;
      return;
    }

    const evenSplit = Math.ceil(entries.length / plannedBusNumbers.length);
    plannedBusNumbers.forEach((bus, index) => {
      if (!buses[bus]) return;
      const remaining = entries.length - evenSplit * index;
      if (remaining > 0)
        buses[bus].plannedCount += Math.min(evenSplit, remaining);
    });
  });

  return buses;
}

// ─────────────────────────────────────────────
// LEGACY (mantener mientras el frontend viejo exista)
// ─────────────────────────────────────────────

async function createPerformanceAttendance(input, ctx) {
  requireAuth(ctx);
  if (!input) throw new Error("Datos de asistencia requeridos");

  // CORRECCIÓN CRÍTICA: upsert en vez de create para evitar duplicados
  const filter = { user: input.user, event: input.event };
  const update = { $set: input };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };

  const record = await PerformanceAttendance.findOneAndUpdate(
    filter,
    update,
    options,
  )
    .populate("user")
    .populate("hotel")
    .populate("event");

  return record;
}

async function updatePerformanceAttendance(id, input, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID requerido");

  const updated = await PerformanceAttendance.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  })
    .populate("user")
    .populate("hotel")
    .populate("event");

  if (!updated) throw new Error("Registro no existe");
  return updated;
}

async function deletePerformanceAttendance(id, ctx) {
  requireAuth(ctx);
  const deleted = await PerformanceAttendance.findByIdAndDelete(id);
  if (!deleted) throw new Error("Registro no existe");
  return "Performance Attendance deleted successfully!";
}

async function getPerformanceAttendanceByEvent(event, ctx) {
  requireAuth(ctx);
  if (!event) throw new Error("event requerido");
  return PerformanceAttendance.find({ event })
    .populate("user")
    .populate("hotel")
    .populate("event");
}

// ─────────────────────────────────────────────
// NUEVO: EventRoster
// ─────────────────────────────────────────────

/**
 * Inicializa el roster de un evento a partir de los usuarios actuales.
 * Idempotente: usa upsert, no duplica si se llama varias veces.
 */
async function initializeEventRoster(eventId, ctx) {
  requireAdmin(ctx);
  const currentUser = requireAuth(ctx);

  if (!eventId) throw new Error("eventId requerido");

  console.log("[presentations.initializeEventRoster] start", {
    eventId,
    currentUserId: currentUser?._id || null,
    currentUserRole: currentUser?.role || null,
  });

  const removedOrphansBeforeInit =
    await removeOrphanEventRosterEntries(eventId);

  const allUsers = await User.find({}).select("_id state instrument role");
  const users = allUsers;

  const stateCounts = allUsers.reduce((acc, user) => {
    const key = user.state || "(sin state)";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const roleCounts = allUsers.reduce((acc, user) => {
    const key = user.role || "(sin role)";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const excludedUsers = [];

  const bulkOps = users.map((user) => ({
    updateOne: {
      filter: { event: eventId, user: user._id },
      update: {
        $set: {
          assignmentGroup: getAssignmentGroup(user),
          isStaff: STAFF_ROLES.has(user.role),
        },
        $setOnInsert: {
          event: eventId,
          user: user._id,
          busNumber: null,
          excludedFromEvent: false,
          excludedFromTransport: false,
          attendanceStatus: "PENDING",
          transportPaid: false,
          transportAmountPaid: 0,
          transportExempt: STAFF_ROLES.has(user.role),
          transportExemptReason: STAFF_ROLES.has(user.role)
            ? "Staff no paga transporte"
            : "",
          createdBy: currentUser?._id || null,
        },
      },
      upsert: true,
    },
  }));

  await EventRoster.bulkWrite(bulkOps);

  const totalRoster = await EventRoster.countDocuments({ event: eventId });

  return getEventRoster(eventId, {}, ctx);
}

/**
 * Retorna el roster de un evento, con filtros opcionales.
 */
async function getEventRoster(eventId, filter = {}, ctx) {
  const currentUser = requireAuth(ctx);
  if (!eventId) throw new Error("eventId requerido");

  const removedOrphans = await removeOrphanEventRosterEntries(eventId);

  const query = { event: eventId };
  if (filter.busNumber !== undefined) query.busNumber = filter.busNumber;
  if (filter.assignmentGroup) query.assignmentGroup = filter.assignmentGroup;
  if (filter.excludedFromEvent !== undefined)
    query.excludedFromEvent = filter.excludedFromEvent;
  if (filter.attendanceStatus) query.attendanceStatus = filter.attendanceStatus;

  console.log("[presentations.getEventRoster] query", {
    eventId,
    filter,
    currentUserId: currentUser?._id || null,
    currentUserRole: currentUser?.role || null,
    removedOrphans,
    query,
  });

  const roster = await EventRoster.find(query)
    .populate("user")
    .populate("hotel")
    .populate("attendanceMarkedBy")
    .populate("transportPaidBy")
    .sort({ assignmentGroup: 1, busNumber: 1 });

  console.log("[presentations.getEventRoster] result", {
    eventId,
    count: roster.length,
    sampleUserIds: roster
      .slice(0, 5)
      .map((entry) => entry.user?._id || entry.user || null),
  });

  return roster;
}

/**
 * Resumen por bus para un evento dado.
 */
async function getEventBusSummary(eventId, ctx) {
  requireAuth(ctx);
  if (!eventId) throw new Error("eventId requerido");

  const roster = await EventRoster.find({
    event: eventId,
    excludedFromEvent: false,
    excludedFromTransport: false,
  })
    .populate("user", "name firstSurName secondSurName section instrument")
    .sort({ busNumber: 1, assignmentGroup: 1 });

  const planned = buildPlannedBusSummary(roster);
  const unassigned = roster.filter((entry) => !entry.busNumber);

  return {
    buses: Object.values(planned).map((b) => ({
      busNumber: b.busNumber,
      count: b.confirmedCount,
      plannedCount: b.plannedCount,
      confirmedCount: b.confirmedCount,
      members: b.members,
      groupSummary: Object.entries(b.groupSummary).map(([group, count]) => ({
        group,
        count,
      })),
    })),
    unassigned,
    unassignedCount: unassigned.length,
  };
}

/**
 * Asigna un bus a todos los miembros de un grupo en un evento.
 * Si splitRemainder=true y hay más personas que el cupo disponible,
 * el excedente va al siguiente bus disponible.
 */
async function clearGroupBus(eventId, assignmentGroup, ctx) {
  requireAdmin(ctx);

  if (!eventId || !assignmentGroup) {
    throw new Error("eventId y assignmentGroup son requeridos");
  }

  await EventRoster.updateMany(
    { event: eventId, assignmentGroup },
    {
      $set: {
        busNumber: null,
        plannedBusNumbers: [],
        transportPlan: null,
      },
    },
  );

  return getEventRoster(eventId, { assignmentGroup }, ctx);
}

async function assignBusToGroup(
  eventId,
  assignmentGroup,
  busNumber,
  ctx,
  options = {},
) {
  requireAdmin(ctx);

  if (!eventId || !assignmentGroup || !busNumber) {
    throw new Error("eventId, assignmentGroup y busNumber son requeridos");
  }

  const { maxCapacity = null, overflowBus = null } = options;

  const groupMembers = await EventRoster.find({
    event: eventId,
    assignmentGroup,
    excludedFromEvent: false,
    excludedFromTransport: false,
  }).sort({ createdAt: 1 });

  if (groupMembers.length === 0) {
    throw new Error(`No hay miembros en el grupo ${assignmentGroup}`);
  }

  const shouldSplit =
    Boolean(maxCapacity) &&
    Boolean(overflowBus) &&
    groupMembers.length > maxCapacity &&
    Number(overflowBus) !== Number(busNumber);

  const ops = groupMembers.map((member) => ({
    updateOne: {
      filter: { _id: member._id },
      update: shouldSplit
        ? {
            $set: {
              busNumber: null,
              plannedBusNumbers: uniqueBusNumbers([busNumber, overflowBus]),
              transportPlan: {
                mode: "FLEX",
                primaryBus: busNumber,
                secondaryBus: overflowBus,
                primaryCapacity: maxCapacity,
              },
            },
          }
        : {
            $set: {
              busNumber,
              plannedBusNumbers: [busNumber],
              transportPlan: {
                mode: "FIXED",
                primaryBus: busNumber,
                secondaryBus: null,
                primaryCapacity: null,
              },
            },
          },
    },
  }));

  await EventRoster.bulkWrite(ops);

  return getEventRoster(eventId, { assignmentGroup }, ctx);
}

/**
 * Mueve personas específicas a otro bus.
 */
async function moveUsersToBus(eventId, userIds, busNumber, ctx) {
  requireAdmin(ctx);

  if (!eventId || !userIds?.length || !busNumber) {
    throw new Error("eventId, userIds y busNumber son requeridos");
  }

  const entries = await EventRoster.find({
    event: eventId,
    user: { $in: userIds },
  }).select("_id plannedBusNumbers");

  for (const entry of entries) {
    const plannedBusNumbers = getPlannedBusNumbers(entry);
    if (
      plannedBusNumbers.length > 0 &&
      !plannedBusNumbers.includes(busNumber)
    ) {
      throw new Error(
        `El usuario ${entry._id} no puede ser ubicado en el bus ${busNumber}`,
      );
    }
  }

  await EventRoster.updateMany(
    { event: eventId, user: { $in: userIds } },
    { $set: { busNumber } },
  );

  return getEventRoster(eventId, { busNumber }, ctx);
}

/**
 * Actualiza el estado de exclusión de una persona en un evento.
 */
async function setExclusion(eventId, userId, exclusionData, ctx) {
  requireAdmin(ctx);

  const { excludedFromEvent, excludedFromTransport, exclusionReason } =
    exclusionData;

  const updated = await EventRoster.findOneAndUpdate(
    { event: eventId, user: userId },
    {
      $set: {
        ...(excludedFromEvent !== undefined && { excludedFromEvent }),
        ...(excludedFromTransport !== undefined && { excludedFromTransport }),
        ...(exclusionReason !== undefined && { exclusionReason }),
        // Si se excluye del evento, limpiar bus y hotel
        ...(excludedFromEvent && { busNumber: null, hotel: null }),
      },
    },
    { new: true },
  ).populate("user");

  if (!updated) throw new Error("Registro no encontrado en el roster");
  return updated;
}

/**
 * Marca asistencia real durante la presentación.
 * Puede ser llamado por encargados de sección.
 */
async function markAttendance(eventId, userId, attendanceStatus, ctx) {
  const currentUser = requireAuth(ctx);
  if (!currentUser) throw new Error("No autenticado");

  const validStatuses = ["PRESENT", "ABSENT", "LATE"];
  if (!validStatuses.includes(attendanceStatus)) {
    throw new Error("Estado de asistencia inválido");
  }

  const updated = await EventRoster.findOneAndUpdate(
    { event: eventId, user: userId, excludedFromEvent: false },
    {
      $set: {
        attendanceStatus,
        attendanceMarkedBy: currentUser._id,
        attendanceMarkedAt: new Date(),
      },
    },
    { new: true },
  )
    .populate("user")
    .populate("attendanceMarkedBy");

  if (!updated) throw new Error("Registro no encontrado o usuario excluido");
  return updated;
}

/**
 * Marca asistencia en bulk para toda una sección/grupo.
 */
async function bulkMarkAttendance(eventId, entries, ctx) {
  const currentUser = requireAuth(ctx);
  if (!currentUser) throw new Error("No autenticado");

  const validStatuses = ["PRESENT", "ABSENT", "LATE", "PENDING"];
  const targetUserIds = entries
    .filter((entry) => validStatuses.includes(entry.attendanceStatus))
    .map((entry) => entry.userId);

  const rosterEntries = await EventRoster.find({
    event: eventId,
    user: { $in: targetUserIds },
    excludedFromEvent: false,
  }).select("_id user busNumber plannedBusNumbers");

  const rosterMap = new Map(
    rosterEntries.map((entry) => [String(entry.user), entry]),
  );

  const bulkOps = entries
    .filter((entry) => validStatuses.includes(entry.attendanceStatus))
    .map((entry) => {
      const rosterEntry = rosterMap.get(String(entry.userId));
      if (!rosterEntry) return null;

      const plannedBusNumbers = getPlannedBusNumbers(rosterEntry);
      let resolvedBusNumber = entry.busNumber ?? rosterEntry.busNumber ?? null;

      if (
        ["PRESENT", "LATE"].includes(entry.attendanceStatus) &&
        plannedBusNumbers.length === 1 &&
        !resolvedBusNumber
      ) {
        resolvedBusNumber = plannedBusNumbers[0];
      }

      if (
        ["PRESENT", "LATE"].includes(entry.attendanceStatus) &&
        plannedBusNumbers.length > 1 &&
        !resolvedBusNumber
      ) {
        throw new Error(
          "Hay personas con varios buses posibles y sin bus confirmado",
        );
      }

      if (
        resolvedBusNumber &&
        plannedBusNumbers.length > 0 &&
        !plannedBusNumbers.includes(resolvedBusNumber)
      ) {
        throw new Error(`Bus inválido para el usuario ${entry.userId}`);
      }

      return {
        updateOne: {
          filter: {
            event: eventId,
            user: entry.userId,
            excludedFromEvent: false,
          },
          update: {
            $set: {
              attendanceStatus: entry.attendanceStatus,
              attendanceMarkedBy: currentUser._id,
              attendanceMarkedAt: new Date(),
              busNumber:
                entry.attendanceStatus === "ABSENT" ||
                entry.attendanceStatus === "PENDING"
                  ? null
                  : resolvedBusNumber,
            },
          },
        },
      };
    })
    .filter(Boolean);

  await EventRoster.bulkWrite(bulkOps);

  return getEventRoster(eventId, {}, ctx);
}

async function setTransportPayment(
  eventId,
  userId,
  paid,
  paymentInput = {},
  ctx,
) {
  const currentUser = requireTransportPaymentAccess(ctx);
  if (!eventId || !userId) {
    throw new Error("eventId y userId son requeridos");
  }

  const rosterEntry = await EventRoster.findOne({
    event: eventId,
    user: userId,
    excludedFromEvent: false,
    excludedFromTransport: false,
  });

  if (!rosterEntry)
    throw new Error("Registro no encontrado o excluido del transporte");
  if (rosterEntry.isStaff) {
    throw new Error("Staff no paga transporte");
  }

  const exempt = paymentInput?.exempt === true;
  const method = paymentInput?.method || null;
  const exemptionReason = String(paymentInput?.exemptionReason || "").trim();
  const event = await Event.findById(eventId).select("transportFeeAmount");
  const configuredAmount =
    Number(event?.transportFeeAmount) > 0
      ? Number(event.transportFeeAmount)
      : 0;
  const providedAmount = Number(paymentInput?.amount);
  const amount =
    Number.isFinite(providedAmount) && providedAmount >= 0
      ? providedAmount
      : configuredAmount;

  if (!exempt && paid && !["CASH", "SINPE"].includes(method)) {
    throw new Error("Debe indicar si el pago fue en efectivo o SINPE");
  }
  if (!exempt && paid && amount <= 0) {
    throw new Error("El monto de transporte debe ser mayor que 0");
  }

  const updated = await EventRoster.findOneAndUpdate(
    { _id: rosterEntry._id },
    {
      $set: {
        transportPaid: exempt ? false : Boolean(paid),
        transportPaidBy: !exempt && paid ? currentUser._id : null,
        transportPaidAt: !exempt && paid ? new Date() : null,
        transportPaymentMethod: !exempt && paid ? method : null,
        transportAmountPaid: !exempt && paid ? amount : 0,
        transportExempt: exempt,
        transportExemptReason: exempt ? exemptionReason : "",
      },
    },
    { new: true },
  )
    .populate("user")
    .populate("attendanceMarkedBy")
    .populate("transportPaidBy");

  return updated;
}

/**
 * Resumen de asistencia de un evento.
 */
async function getEventAttendanceSummary(eventId, ctx) {
  requireAuth(ctx);

  const roster = await EventRoster.find({ event: eventId });

  const total = roster.length;
  const excluded = roster.filter((r) => r.excludedFromEvent).length;
  const convoked = total - excluded;
  const present = roster.filter((r) => r.attendanceStatus === "PRESENT").length;
  const absent = roster.filter((r) => r.attendanceStatus === "ABSENT").length;
  const late = roster.filter((r) => r.attendanceStatus === "LATE").length;
  const pending = roster.filter(
    (r) => r.attendanceStatus === "PENDING" && !r.excludedFromEvent,
  ).length;

  return {
    total,
    convoked,
    excluded,
    present,
    absent,
    late,
    pending,
    attendanceRate:
      convoked > 0
        ? parseFloat((((present + late) / convoked) * 100).toFixed(2))
        : 0,
  };
}

// ─────────────────────────────────────────────
// Hotel (sin cambios)
// ─────────────────────────────────────────────

async function createHotel(input, ctx) {
  requireAuth(ctx);
  if (!input) throw new Error("Datos de hotel requeridos");
  return Hotel.create(input);
}

async function updateHotel(id, input, ctx) {
  requireAuth(ctx);
  const updated = await Hotel.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new Error("Hotel no existe");
  return updated;
}

async function deleteHotel(id, ctx) {
  requireAuth(ctx);
  const deleted = await Hotel.findByIdAndDelete(id);
  if (!deleted) throw new Error("Hotel no existe");
  return "Hotel deleted successfully!";
}

async function getHotel(id, ctx) {
  requireAuth(ctx);
  const hotel = await Hotel.findById(id);
  if (!hotel) throw new Error("Hotel no existe");
  return hotel;
}

async function getHotels(ctx) {
  requireAuth(ctx);
  return Hotel.find({});
}

module.exports = {
  requireAuth,
  requireAdmin,

  // Legacy
  createPerformanceAttendance,
  updatePerformanceAttendance,
  deletePerformanceAttendance,
  getPerformanceAttendanceByEvent,

  // EventRoster
  initializeEventRoster,
  getEventRoster,
  getEventBusSummary,
  clearGroupBus,
  assignBusToGroup,
  moveUsersToBus,
  setExclusion,
  markAttendance,
  bulkMarkAttendance,
  setTransportPayment,
  getEventAttendanceSummary,

  // Hotel
  createHotel,
  updateHotel,
  deleteHotel,
  getHotel,
  getHotels,
};
