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

// ─── CRUD ────────────────────────────────────────────────────────────────────

async function createEvent(input, ctx) {
  requireAdmin(ctx);

  if (!input) throw new Error("Datos de evento requeridos");
  if (!input.title) throw new Error("El título es requerido");
  if (!input.date) throw new Error("La fecha es requerida");

  const { notificationMode = "NONE", audience = [], ...rest } = input;

  // Normalizar date: acepta ms string o ISO string
  const parsedDate = parseDate(input.date);

  const created = await Event.create({
    ...rest,
    date: parsedDate,
    notificationMode,
    audience: audience.length ? audience : rest.type ? [rest.type] : [],
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

  const { notificationMode, audience, ...rest } = input;

  // Normalizar date si viene
  const updateData = {
    ...rest,
    updatedBy: ctx?.user?.id ?? null,
  };

  if (input.date) updateData.date = parseDate(input.date);
  if (notificationMode) updateData.notificationMode = notificationMode;
  if (audience?.length) updateData.audience = audience;

  const updated = await Event.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!updated) throw new Error("No se pudo actualizar el evento");

  // Solo re-notificar si el modo cambió explícitamente a LIVE en esta edición
  if (notificationMode === "LIVE") {
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
      console.log(
        `[eventService] LIVE — notificación enviada para evento: ${event._id}`,
      );
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
function parseDate(val) {
  if (val instanceof Date) return val;

  const n = Number(val);
  if (!isNaN(n) && String(val).length >= 10) {
    // Si parece ms (> año 2000 en ms = > 946684800000)
    if (n > 946684800000) return new Date(n);
  }

  const d = new Date(val);
  if (isNaN(d.getTime())) throw new Error(`Fecha inválida: ${val}`);
  return d;
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
