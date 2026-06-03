// /src/notifications/notification.service.js
"use strict";

const { getFirebaseAdmin } = require("./firebaseAdmin");
const {
  normalizeNotificationTokens,
  removeTokensFromAllAccounts,
} = require("./token.repository");

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
  const uniqueTokens = normalizeNotificationTokens(tokens);

  if (!uniqueTokens.length) {
    console.log("[notificationService] Sin tokens destino, se omite envío.");
    return {
      successCount: 0,
      failureCount: 0,
      invalidTokensRemoved: 0,
    };
  }

  const app = getFirebaseAdmin();
  const messaging = app.messaging();

  // Partir en chunks de 500
  const chunks = chunkArray(uniqueTokens, FCM_BATCH_SIZE);
  const invalidTokens = [];
  let successCount = 0;
  let failureCount = 0;

  for (const [index, chunk] of chunks.entries()) {
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
      failureCount += chunk.length;
      continue; // best-effort: continúa con siguiente chunk
    }

    successCount += response.successCount;
    failureCount += response.failureCount;

    console.log(
      `[notificationService] Chunk ${index + 1}/${chunks.length} enviado — éxitos: ${response.successCount}, fallos: ${response.failureCount}`
    );

    // Detectar tokens inválidos en este chunk
    response.responses.forEach((res, idx) => {
      if (!res.success && res.error) {
        const code = res.error.code;
        if (INVALID_TOKEN_CODES.has(code)) {
          invalidTokens.push(chunk[idx]);
          console.warn(
            `[notificationService] Token inválido detectado (${code}): ${maskToken(chunk[idx])}`
          );
        } else {
          console.warn(
            `[notificationService] Fallo no-invalidante (${code}): ${maskToken(chunk[idx])}`
          );
        }
      }
    });
  }

  // Limpiar tokens inválidos de MongoDB
  const uniqueInvalidTokens = normalizeNotificationTokens(invalidTokens);
  let invalidTokensRemoved = 0;

  if (uniqueInvalidTokens.length) {
    const cleanup = await removeTokensFromAllAccounts(uniqueInvalidTokens).catch((err) => {
      console.error("[notificationService] Error limpiando tokens:", err.message)
      return null;
    });
    invalidTokensRemoved = cleanup?.tokensRemoved || 0;
  }

  const summary = {
    successCount,
    failureCount,
    invalidTokensRemoved,
  };

  console.log("[notificationService] Envío finalizado", summary);
  return summary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function maskToken(token) {
  if (!token || typeof token !== "string") return "<invalid>";
  if (token.length <= 12) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

module.exports = { sendPushNotification };
