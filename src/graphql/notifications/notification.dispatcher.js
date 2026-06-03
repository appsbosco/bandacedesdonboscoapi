/**
 * notifications/notification.dispatcher.js
 * Punto de entrada único para disparar notificaciones.
 * Best-effort: nunca propaga errores al dominio.
 */
"use strict";

const { getAllTokens } = require("./token.repository");
const { resolveTemplate } = require("./notification.templates");
const { sendPushNotification } = require("./notification.service");

function dedupeTokens(tokens = []) {
  return [...new Set(tokens.filter(Boolean))];
}

function logTokenDedupe(eventName, tokens, uniqueTokens, suffix = "tokens") {
  console.log(`[dispatcher] "${eventName}" → ${uniqueTokens.length} ${suffix}`, {
    raw: tokens.length,
    unique: uniqueTokens.length,
    duplicated: tokens.length - uniqueTokens.length,
  });
}

/**
 * Dispara notificación a TODOS los tokens registrados.
 *
 * @param {string} eventName  - Constante de EVENTS
 * @param {object} payload    - Datos específicos del evento
 */
async function dispatch(eventName, payload = {}) {
  try {
    const { tokens } = await getAllTokens();
    const uniqueTokens = dedupeTokens(tokens);

    if (!uniqueTokens.length) {
      console.log(`[dispatcher] Sin tokens registrados para: "${eventName}"`);
      return;
    }

    const template = resolveTemplate(eventName, payload);
    logTokenDedupe(eventName, tokens, uniqueTokens);
    await sendPushNotification(uniqueTokens, template);
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
    const uniqueTokens = dedupeTokens(tokens);

    if (!uniqueTokens.length) {
      console.log(`[dispatcher] Sin tokens destino para: "${eventName}"`);
      return;
    }
    const template = resolveTemplate(eventName, payload);
    logTokenDedupe(eventName, tokens, uniqueTokens, "tokens específicos");
    await sendPushNotification(uniqueTokens, template);
  } catch (err) {
    console.error(
      `[dispatcher] Error best-effort en dispatchToTokens "${eventName}":`,
      err.message,
    );
  }
}

module.exports = { dispatch, dispatchToTokens };
