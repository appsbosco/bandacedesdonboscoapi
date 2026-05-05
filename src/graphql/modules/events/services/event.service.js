/**
 * events/services/event.service.js
 *
 * Lógica de negocio de eventos.
 * - Sin ninguna lógica de email (eliminada por completo)
 * - Manejo de notificationMode: NONE | DRY_RUN | LIVE
 * - DRY_RUN: guarda payload en notificationLog, NO envía push real
 * - LIVE: dispara notificación push real vía FCM
 */

const Event = require("../../../../../models/Events");
const { dispatch } = require("../../../notifications/notification.dispatcher");
const { EVENTS } = require("../../../notifications/notification.templates");

// ─── Auth guard ──────────────────────────────────────────────────────────────
function requireAuth(ctx) {
  const currentUser = ctx?.user || ctx?.me || ctx?.currentUser;
  // Descomentar cuando auth esté fija en context:
  // if (!currentUser) throw new Error("No autenticado");
  return currentUser;
}

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);
  if (user && !ADMIN_ROLES.has(user.role)) {
    throw new Error(
      "No autorizado: se requiere rol Admin, Director o Subdirector",
    );
  }
  return user;
}

function normalizeBusCapacities(busCapacities = []) {
  if (!Array.isArray(busCapacities)) return [];

  return busCapacities
    .map((entry) => ({
      busNumber: Number(entry?.busNumber),
      capacity: Number(entry?.capacity),
    }))
    .filter(
      (entry) =>
        Number.isInteger(entry.busNumber) &&
        entry.busNumber >= 1 &&
        entry.busNumber <= 6,
    )
    .filter((entry) => Number.isInteger(entry.capacity) && entry.capacity > 0)
    .sort((a, b) => a.busNumber - b.busNumber)
    .filter(
      (entry, index, array) =>
        array.findIndex((item) => item.busNumber === entry.busNumber) === index,
    );
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

async function createEvent(input, ctx) {
  requireAdmin(ctx);

  if (!input) throw new Error("Datos de evento requeridos");
  if (!input.title) throw new Error("El título es requerido");
  if (!input.date) throw new Error("La fecha es requerida");

  const {
    notificationMode = "NONE",
    audience = [],
    busCapacities = [],
    ...rest
  } = input;

  // Normalizar date: acepta ms string o ISO string
  const parsedDate = parseDate(input.date);

  const created = await Event.create({
    ...rest,
    date: parsedDate,
    notificationMode,
    audience: audience.length ? audience : rest.type ? [rest.type] : [],
    busCapacities: normalizeBusCapacities(busCapacities),
    createdBy: ctx?.user?.id ?? null,
  });

  // Disparar notificación según modo
  await handleNotification(created, notificationMode, ctx);

  return created;
}

async function updateEvent(id, input, ctx) {
  requireAdmin(ctx);

  if (!id) throw new Error("ID de evento requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const exists = await Event.findById(id);
  if (!exists) throw new Error("Este evento no existe");

  const { notificationMode, audience, busCapacities, ...rest } = input;

  // Normalizar date si viene
  const updateData = {
    ...rest,
    updatedBy: ctx?.user?.id ?? null,
  };

  if (input.date) updateData.date = parseDate(input.date);
  if (notificationMode) updateData.notificationMode = notificationMode;
  if (audience?.length) updateData.audience = audience;
  if (Array.isArray(busCapacities))
    updateData.busCapacities = normalizeBusCapacities(busCapacities);
  if (input.transportPaymentEnabled !== undefined) {
    updateData.transportPaymentEnabled = Boolean(input.transportPaymentEnabled);
  }
  if (input.transportFeeAmount !== undefined) {
    const fee = Number(input.transportFeeAmount);
    updateData.transportFeeAmount = Number.isFinite(fee) && fee >= 0 ? fee : 0;
  }

  const updated = await Event.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!updated) throw new Error("No se pudo actualizar el evento");

  // Solo re-notificar si el modo cambió explícitamente a LIVE en esta edición
  if (notificationMode === "LIVE" && exists.notificationMode !== "LIVE") {
    await handleNotification(updated, "LIVE", ctx);
  }

  return updated;
}

async function deleteEvent(id, ctx) {
  requireAdmin(ctx);

  if (!id) throw new Error("ID de evento requerido");

  const deleted = await Event.findByIdAndDelete(id);
  if (!deleted) throw new Error("Este evento no existe");

  return "Evento eliminado correctamente";
}

async function getEvent(id, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de evento requerido");

  const event = await Event.findById(id);
  if (!event) throw new Error("Este evento no existe");
  return event;
}

async function getEvents(filter, ctx) {
  requireAuth(ctx);

  const query = {};

  if (filter?.category) query.category = filter.category;
  if (filter?.type) query.type = filter.type;

  if (filter?.dateFrom || filter?.dateTo) {
    query.date = {};
    if (filter.dateFrom) query.date.$gte = parseDate(filter.dateFrom);
    if (filter.dateTo) query.date.$lte = parseDate(filter.dateTo);
  }

  const events = await Event.find(query).sort({ date: 1 });
  return events;
}

async function getEventsByDateRange(from, to, ctx) {
  requireAuth(ctx);

  const events = await Event.find({
    date: {
      $gte: parseDate(from),
      $lte: parseDate(to),
    },
  }).sort({ date: 1 });

  return events;
}

// ─── Notification handler ────────────────────────────────────────────────────

/**
 * Maneja la notificación según el modo elegido.
 *
 * NONE    → no hace nada
 * DRY_RUN → guarda payload en notificationLog, NO envía push real
 * LIVE    → dispara FCM multicast real
 */
async function handleNotification(event, mode, ctx) {
  if (!mode || mode === "NONE") return;

  const payload = {
    eventId: event._id.toString(),
    title: event.title,
    date:
      event.date instanceof Date
        ? event.date.toISOString()
        : String(event.date),
    place: event.place ?? "",
    type: event.type ?? "",
    category: event.category ?? "other",
    audience: event.audience ?? [],
  };

  console.log(payload);
  if (mode === "DRY_RUN") {
    // Guardar payload para auditoría, NO enviar nada
    console.log(
      "[eventService] DRY_RUN — simulando notificación, payload guardado.",
    );
    await Event.findByIdAndUpdate(event._id, {
      notificationLog: {
        mode: "DRY_RUN",
        dispatchedAt: new Date(),
        audience: event.audience ?? [],
        tokenCount: 0,
        successCount: 0,
        failureCount: 0,
        dryRunPayload: payload,
        error: null,
      },
    });
    return;
  }

  if (mode === "LIVE") {
    try {
      await dispatch(EVENTS.EVENT_PUBLISHED, payload);
    } catch (err) {
      // Nunca propagar: la creación del evento no debe fallar por notificaciones
      console.error(
        "[eventService] Error en notificación LIVE (non-fatal):",
        err.message,
      );

      // Registrar el error en el log
      await Event.findByIdAndUpdate(event._id, {
        notificationLog: {
          mode: "LIVE",
          dispatchedAt: new Date(),
          audience: event.audience ?? [],
          error: err.message,
        },
      }).catch(() => {});
    }
  }
}

// ─── Date parser ─────────────────────────────────────────────────────────────

/**
 * Acepta:
 * - Timestamp en ms (string o number): "1735689600000"
 * - ISO string: "2026-01-01T00:00:00Z"
 * - Date: ya es Date
 */

/**
 * Normaliza cualquier input de fecha para que represente
 * 00:00 hora Costa Rica (UTC-6).
 *
 * Acepta:
 * - Timestamp ms (number o string)
 * - ISO string
 * - YYYY-MM-DD
 * - Date
 */
function parseDate(val) {
  console.log("parseDate recibió:", val);

  if (!val) throw new Error("Fecha inválida");

  let date;

  // ───── 1. Si ya es Date ─────
  if (val instanceof Date) {
    date = val;
  }

  // ───── 2. Si es número o timestamp string ─────
  else if (!isNaN(Number(val))) {
    date = new Date(Number(val));
  }

  // ───── 3. Si es string ISO o YYYY-MM-DD ─────
  else if (typeof val === "string") {
    date = new Date(val);
  } else {
    throw new Error("Formato de fecha no soportado");
  }

  if (isNaN(date.getTime())) {
    throw new Error(`Fecha inválida: ${val}`);
  }

  // Convertimos SIEMPRE a 00:00 hora Costa Rica

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  // Crear fecha equivalente a 00:00 CR
  // CR = UTC-6 → entonces en UTC es 06:00
  const costaRicaMidnightUTC = new Date(Date.UTC(year, month, day, 6, 0, 0));

  return costaRicaMidnightUTC;
}

module.exports = {
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  getEvents,
  getEventsByDateRange,
  handleNotification,
  requireAuth,
  requireAdmin,
};
