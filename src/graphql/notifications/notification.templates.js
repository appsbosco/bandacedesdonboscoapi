/**
 * notifications/notification.templates.js
 * Catálogo de eventos y sus plantillas de notificación push
 */
"use strict";

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://bandacedesdonbosco.com";

// ─── Catálogo de eventos ──────────────────────────────────────────────────────
const EVENTS = {
  STORE_PRODUCT_CREATED: "STORE_PRODUCT_CREATED",
  EVENT_PUBLISHED: "EVENT_PUBLISHED",
  EVENT_UPDATED: "EVENT_UPDATED",
  EVENT_REMINDER: "EVENT_REMINDER",
  ABSENCE_PERMISSION_STATUS_CHANGED: "ABSENCE_PERMISSION_STATUS_CHANGED",
  BIRTHDAY_TODAY: "BIRTHDAY_TODAY",
  ATTENDANCE_REHEARSAL_REMINDER: "ATTENDANCE_REHEARSAL_REMINDER",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDateEs(isoString) {
  try {
    return new Date(isoString).toLocaleDateString("es-CR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "America/Costa_Rica",
    });
  } catch {
    return isoString;
  }
}

function categoryLabel(category) {
  const map = {
    presentation: "Presentación",
    rehearsal: "Ensayo",
    meeting: "Reunión",
    activity: "Actividad",
    logistics: "Logística",
    other: "Evento",
  };
  return map[category] ?? "Evento";
}

function absencePermissionStatusLabel(status) {
  const map = {
    PENDING: "pendiente de revisión",
    APPROVED: "aprobada",
    REJECTED: "rechazada",
    CANCELLED: "cancelada",
  };
  return map[status] ?? "actualizada";
}

// ─── Plantillas ───────────────────────────────────────────────────────────────
const TEMPLATES = {
  [EVENTS.STORE_PRODUCT_CREATED]: (payload) => ({
    title: "Nuevo producto disponible",
    body: "Se añadió un nuevo producto. Ya podés solicitar tu almuerzo.",
    link: `${FRONTEND_URL}/store`,
    data: {
      kind: EVENTS.STORE_PRODUCT_CREATED,
      productId: String(payload.productId ?? ""),
      url: "/store",
    },
  }),

  /**
   * EVENT_PUBLISHED: se dispara cuando se crea un evento con mode=LIVE
   */
  [EVENTS.EVENT_PUBLISHED]: (payload) => {
    const label = categoryLabel(payload.category);
    const dateStr = payload.date ? formatDateEs(payload.date) : "";
    const bandPart = payload.type ? `${payload.type} · ` : "";
    const placePart = payload.place ? ` · ${payload.place}` : "";

    return {
      title: `${payload.title}`,
      body: `Tienes una nueva presentación: ${bandPart}${dateStr}${placePart}`,
      link: `${FRONTEND_URL}/events/${payload.eventId}`,
      data: {
        kind: EVENTS.EVENT_PUBLISHED,
        eventId: String(payload.eventId ?? ""),
        category: String(payload.category ?? ""),
        url: `/events/${payload.eventId}`,
      },
    };
  },

  /**
   * EVENT_UPDATED: se dispara si admin edita con mode=LIVE explícito
   */
  [EVENTS.EVENT_UPDATED]: (payload) => {
    const label = categoryLabel(payload.category);
    return {
      title: `${label} actualizado`,
      body: `"${payload.title}" ha sido actualizado. Revisá los detalles.`,
      link: `${FRONTEND_URL}/events/${payload.eventId}`,
      data: {
        kind: EVENTS.EVENT_UPDATED,
        eventId: String(payload.eventId ?? ""),
        url: `/events/${payload.eventId}`,
      },
    };
  },

  /**
   * EVENT_REMINDER: para recordatorios programados (cron job futuro)
   */
  [EVENTS.EVENT_REMINDER]: (payload) => {
    const label = categoryLabel(payload.category);
    const dateStr = payload.date ? formatDateEs(payload.date) : "";
    return {
      title: `Recordatorio: ${label} mañana`,
      body: `"${payload.title}" es ${dateStr}${payload.place ? ` en ${payload.place}` : ""}.`,
      link: `${FRONTEND_URL}/events/${payload.eventId}`,
      data: {
        kind: EVENTS.EVENT_REMINDER,
        eventId: String(payload.eventId ?? ""),
        url: `/events/${payload.eventId}`,
      },
    };
  },

  [EVENTS.ABSENCE_PERMISSION_STATUS_CHANGED]: (payload) => {
    const status = absencePermissionStatusLabel(payload.requestStatus);
    const studentPart = payload.studentName ? ` de ${payload.studentName}` : "";
    return {
      title: "Solicitud de permiso actualizada",
      body: `La solicitud de permiso${studentPart} fue ${status}.`,
      link: `${FRONTEND_URL}/absence-permissions`,
      data: {
        kind: EVENTS.ABSENCE_PERMISSION_STATUS_CHANGED,
        permissionId: String(payload.permissionId ?? ""),
        requestStatus: String(payload.requestStatus ?? ""),
        justificationStatus: String(payload.justificationStatus ?? ""),
        url: "/absence-permissions",
      },
    };
  },

  [EVENTS.BIRTHDAY_TODAY]: (payload) => ({
    title: "🎂 Cumpleaños hoy",
    body: `Hoy cumple años ${payload.fullName}. ¡Felicítenlo!`,
    link: `${FRONTEND_URL}/calendar`,
    data: {
      kind: EVENTS.BIRTHDAY_TODAY,
      birthdayUserId: String(payload.birthdayUserId ?? ""),
      instrument: String(payload.instrument ?? ""),
      url: "/calendar",
    },
  }),

  [EVENTS.ATTENDANCE_REHEARSAL_REMINDER]: (payload) => ({
    title: "Recordatorio de asistencia",
    body: "No se ha pasado lista para el ensayo de hoy. Por favor registra la asistencia.",
    link: `${FRONTEND_URL}/attendance`,
    data: {
      kind: EVENTS.ATTENDANCE_REHEARSAL_REMINDER,
      eventId: String(payload.eventId ?? ""),
      eventTitle: String(payload.eventTitle ?? ""),
      eventDate: String(payload.eventDate ?? ""),
      eventTime: String(payload.eventTime ?? ""),
      category: "rehearsal",
      type: "attendance_reminder",
      dateKey: String(payload.dateKey ?? ""),
      reminderSlot: String(payload.reminderSlot ?? ""),
      url: "/attendance",
    },
  }),
};

/**
 * Resuelve la plantilla para un evento.
 * @param {string} eventName
 * @param {object} payload
 * @returns {{ title, body, link, data }}
 */
function resolveTemplate(eventName, payload) {
  const builder = TEMPLATES[eventName];
  if (!builder)
    throw new Error(`[templates] Evento sin plantilla: "${eventName}"`);
  return builder(payload);
}

module.exports = { EVENTS, resolveTemplate };
