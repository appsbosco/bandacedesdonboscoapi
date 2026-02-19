// /src/notifications/notification.dispatcher.js
"use strict";

const { getAllTokens } = require("./token.repository");
const { resolveTemplate } = require("./notification.templates");
const { sendPushNotification } = require("./notification.service");

/**
 * Punto de entrada único para disparar notificaciones desde cualquier service.
 *
 * Uso:
 *   const { dispatch } = require('../notifications/notification.dispatcher');
 *   await dispatch(EVENTS.STORE_PRODUCT_CREATED, { productId: product._id });
 *
 * @param {string} eventName   - Constante de EVENTS
 * @param {object} payload     - Datos específicos del evento
 */
async function dispatch(eventName, payload = {}) {
  try {
    const { tokens } = await getAllTokens();

    if (!tokens.length) {
      console.log(`[dispatcher] No hay tokens registrados para evento: ${eventName}`);
      return;
    }

    const template = resolveTemplate(eventName, payload);

    console.log(`[dispatcher] Disparando "${eventName}" → ${tokens.length} tokens`);
    await sendPushNotification(tokens, template);
  } catch (err) {
    // NUNCA propagar: el evento de dominio no debe fallar por notificaciones
    console.error(`[dispatcher] Error (best-effort) en evento "${eventName}":`, err.message);
  }
}

/**
 * Variante para notificar SOLO a tokens específicos (útil para pruebas o notif. personalizadas).
 *
 * @param {string} eventName
 * @param {string[]} tokens
 * @param {object} payload
 */
async function dispatchToTokens(eventName, tokens, payload = {}) {
  try {
    if (!tokens.length) {
      console.log(`[dispatcher] Sin tokens destino para: ${eventName}`);
      return;
    }
    const template = resolveTemplate(eventName, payload);
    console.log(`[dispatcher] Disparando "${eventName}" → ${tokens.length} tokens específicos`);
    await sendPushNotification(tokens, template);
  } catch (err) {
    console.error(
      `[dispatcher] Error (best-effort) en dispatchToTokens "${eventName}":`,
      err.message
    );
  }
}

module.exports = { dispatch, dispatchToTokens };
