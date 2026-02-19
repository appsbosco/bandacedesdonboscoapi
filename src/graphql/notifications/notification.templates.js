// /src/notifications/notification.templates.js
"use strict";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://tudominio.com";

// ─── Catálogo de eventos ──────────────────────────────────────────────────────
const EVENTS = {
  STORE_PRODUCT_CREATED: "STORE_PRODUCT_CREATED",
  // Próximos:
  // STORE_PRODUCT_UPDATED:  'STORE_PRODUCT_UPDATED',
  // ORDER_CREATED:          'ORDER_CREATED',
  // EVENT_PUBLISHED:        'EVENT_PUBLISHED',
};

// ─── Plantillas ───────────────────────────────────────────────────────────────
/**
 * Cada plantilla recibe un `payload` (datos del evento) y devuelve:
 *   { title, body, link, data }
 */
const TEMPLATES = {
  [EVENTS.STORE_PRODUCT_CREATED]: (payload) => ({
    title: "Banda CEDES Don Bosco — Nuevo producto disponible",
    body: "Se añadió un nuevo producto y ya podés solicitar tu almuerzo.",
    link: `${FRONTEND_URL}/store`,
    data: {
      kind: EVENTS.STORE_PRODUCT_CREATED,
      productId: payload.productId || "",
      url: "/store",
    },
  }),

  // Plantilla de ejemplo para futuros eventos:
  // [EVENTS.ORDER_CREATED]: (payload) => ({
  //   title: 'Tu pedido fue recibido',
  //   body:  `Orden #${payload.orderId} en proceso.`,
  //   link:  `${FRONTEND_URL}/orders/${payload.orderId}`,
  //   data: { kind: EVENTS.ORDER_CREATED, orderId: payload.orderId, url: `/orders/${payload.orderId}` },
  // }),
};

/**
 * Resuelve la plantilla para un evento dado.
 * @param {string} eventName  - Uno de los EVENTS.*
 * @param {object} payload    - Datos del evento
 * @returns {{ title, body, link, data }}
 */
function resolveTemplate(eventName, payload) {
  const builder = TEMPLATES[eventName];
  if (!builder) throw new Error(`[templates] Evento sin plantilla: ${eventName}`);
  return builder(payload);
}

module.exports = { EVENTS, resolveTemplate };
