const { Liveblocks } = require("@liveblocks/node");
const Formation = require("../../models/Formation");
require("dotenv").config({ path: "./config/.env" });

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY,
});

async function liveblocksWebhookHandler(req, res) {
  // Verificar que el request viene de Liveblocks
  // Liveblocks envía el header "webhook-id", "webhook-timestamp", "webhook-signature"
  // Por ahora validamos con el secret compartido hasta que implementes firma HMAC
  const webhookSecret = process.env.LIVEBLOCKS_WEBHOOK_SECRET;

  if (webhookSecret) {
    const signature =
      req.headers["webhook-signature"] || req.headers["liveblocks-signature"];
    if (!signature || signature !== webhookSecret) {
      console.warn("[webhook] firma inválida");
      return res.status(401).json({ error: "Firma inválida" });
    }
  }

  const event = req.body;

  if (!event || !event.type) {
    return res.status(400).json({ error: "Evento inválido" });
  }

  // El evento que nos interesa: cuando el storage de una room cambia
  if (event.type === "storageUpdated") {
    const roomId = event.data?.roomId;
    if (!roomId || !roomId.startsWith("formation-")) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const formationId = roomId.replace("formation-", "");

    try {
      // Obtener el storage actual de la room via REST API de Liveblocks
      // getStorageDocument con "json" devuelve el LiveMap como objeto plano
      const storage = await liveblocks.getStorageDocument(roomId, "json");

      // storage.slots es el LiveMap serializado como { "ZONE:row:col": slotData, ... }
      const slotsMap = storage?.slots || {};
      const slots = Object.values(slotsMap).filter(
        (s) => s && typeof s.zone === "string",
      );

      await Formation.findByIdAndUpdate(
        formationId,
        { $set: { slots } },
        { runValidators: false },
      );

      console.log("[webhook] storageUpdated persistido", {
        roomId,
        formationId,
        slotsCount: slots.length,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[webhook] error persistiendo storage:", e.message);
      // Retornamos 200 igualmente para que Liveblocks no reintente en loop
    }
  }

  return res.status(200).json({ ok: true });
}

module.exports = { liveblocksWebhookHandler };
