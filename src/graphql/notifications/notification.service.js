// /src/notifications/notification.service.js
"use strict";

const { getFirebaseAdmin } = require("./firebaseAdmin");
const { removeInvalidTokens } = require("./token.repository");

const FCM_BATCH_SIZE = 500; // límite FCM multicast

/**
 * Errores FCM que indican token muerto → hay que eliminarlo.
 */
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

/**
 * Envía una notificación push a una lista de tokens.
 * Maneja chunking (>500 tokens) y limpia tokens inválidos.
 *
 * @param {string[]} tokens
 * @param {{ title: string, body: string, link: string, data: Record<string,string> }} template
 */
async function sendPushNotification(tokens, template) {
  if (!tokens.length) {
    console.log("[notificationService] Sin tokens destino, se omite envío.");
    return;
  }

  const app = getFirebaseAdmin();
  const messaging = app.messaging();

  // Partir en chunks de 500
  const chunks = chunkArray(tokens, FCM_BATCH_SIZE);
  const invalidTokens = [];

  for (const chunk of chunks) {
    const message = {
      tokens: chunk,
      notification: {
        title: template.title,
        body: template.body,
      },
      webpush: {
        notification: {
          title: template.title,
          body: template.body,
          icon: process.env.NOTIFICATION_ICON_URL || "/icons/icon-192x192.png",
        },
        fcmOptions: {
          link: template.link, // deep link HTTPS para PWA
        },
      },
      // data: solo strings
      data: Object.fromEntries(Object.entries(template.data).map(([k, v]) => [k, String(v)])),
    };

    let response;
    try {
      response = await messaging.sendEachForMulticast(message);
    } catch (err) {
      console.error("[notificationService] Error en sendEachForMulticast:", err.message);
      continue; // best-effort: continúa con siguiente chunk
    }

    console.log(
      `[notificationService] Chunk enviado — éxitos: ${response.successCount}, fallos: ${response.failureCount}`
    );

    // Detectar tokens inválidos en este chunk
    response.responses.forEach((res, idx) => {
      if (!res.success && res.error) {
        const code = res.error.code;
        if (INVALID_TOKEN_CODES.has(code)) {
          invalidTokens.push(chunk[idx]);
          console.warn(
            `[notificationService] Token inválido detectado (${code}): ${chunk[idx].slice(0, 20)}…`
          );
        } else {
          console.warn(
            `[notificationService] Fallo no-invalidante (${code}): ${chunk[idx].slice(0, 20)}…`
          );
        }
      }
    });
  }

  // Limpiar tokens inválidos de MongoDB
  if (invalidTokens.length) {
    await removeInvalidTokens(invalidTokens).catch((err) =>
      console.error("[notificationService] Error limpiando tokens:", err.message)
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

module.exports = { sendPushNotification };
