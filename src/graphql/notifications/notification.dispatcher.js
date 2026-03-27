/**
 * notifications/notification.dispatcher.js
 * Punto de entrada único para disparar notificaciones.
 * Best-effort: nunca propaga errores al dominio.
 */
"use strict";

const { getAllTokens } = require("./token.repository");
const { resolveTemplate } = require("./notification.templates");
const { sendPushNotification } = require("./notification.service");

/**
 * Dispara notificación a TODOS los tokens registrados.
 *
 * @param {string} eventName  - Constante de EVENTS
 * @param {object} payload    - Datos específicos del evento
 */
async function dispatch(eventName, payload = {}) {
  try {
    const { tokens } = await getAllTokens();

    if (!tokens.length) {
      console.log(`[dispatcher] Sin tokens registrados para: "${eventName}"`);
      return;
    }

    const template = resolveTemplate(eventName, payload);
    console.log(`[dispatcher] "${eventName}" → ${tokens.length} tokens`);
    await sendPushNotification(tokens, template);
  } catch (err) {
    console.error(
      `[dispatcher] Error best-effort en "${eventName}":`,
      err.message,
    );
  }
}

/**
 * Dispara notificación a tokens específicos.
 * Útil para notificaciones personalizadas o pruebas dirigidas.
 *
 * @param {string}   eventName
 * @param {string[]} tokens
 * @param {object}   payload
 */
async function dispatchToTokens(eventName, tokens = [], payload = {}) {
  try {
    if (!tokens.length) {
      console.log(`[dispatcher] Sin tokens destino para: "${eventName}"`);
      return;
    }
    const template = resolveTemplate(eventName, payload);
    console.log(
      `[dispatcher] "${eventName}" → ${tokens.length} tokens específicos`,
    );
    await sendPushNotification(tokens, template);
  } catch (err) {
    console.error(
      `[dispatcher] Error best-effort en dispatchToTokens "${eventName}":`,
      err.message,
    );
  }
}

module.exports = { dispatch, dispatchToTokens };
