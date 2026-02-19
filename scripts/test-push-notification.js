// scripts/test-push-notification.js
// ─────────────────────────────────────────────────────────────────────────────
// Script de prueba manual para notificaciones push.
// Envía una notificación STORE_PRODUCT_CREATED al usuario:
//   _id: 651744a9ff2682956e94bcb3
//
// Uso:
//   node scripts/test-push-notification.js
//   node scripts/test-push-notification.js --all        (enviar a TODOS los usuarios)
//   node scripts/test-push-notification.js --dry-run    (sin enviar, solo muestra tokens)
// ─────────────────────────────────────────────────────────────────────────────
"use strict";

// ── 1. Cargar variables de entorno ───────────────────────────────────────────
require("dotenv").config({ path: "./config/.env" });

// ── 2. Conexión a MongoDB ────────────────────────────────────────────────────
const mongoose = require("mongoose");

async function connectDB() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;
  if (!uri)
    throw new Error(
      "No se encontró variable de entorno para MongoDB (MONGODB_URI / MONGO_URI / DATABASE_URL)",
    );
  await mongoose.connect(uri);
  console.log("✓ MongoDB conectado:", mongoose.connection.host);
}

// ── 3. Argumentos CLI ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const DRY_RUN = args.includes("--dry-run");

const TARGET_USER_ID = "651744a9ff2682956e94bcb3";

// ── 4. Main ──────────────────────────────────────────────────────────────────
async function main() {
  await connectDB();

  const {
    getTokensByUserId,
    getAllTokens,
  } = require("../src/graphql/notifications/token.repository.js");
  const {
    dispatchToTokens,
    dispatch,
  } = require("../src/graphql/notifications/notification.dispatcher.js");
  const {
    EVENTS,
  } = require("../src/graphql/notifications/notification.templates.js");

  // Payload de prueba (simula un producto real)
  const fakeProductId = new mongoose.Types.ObjectId().toString();
  const eventPayload = { productId: fakeProductId };

  if (ALL) {
    // ── Modo: todos los usuarios ─────────────────────────────────────────────
    console.log("\n═══ MODO: Todos los usuarios ═══");
    const { tokens } = await getAllTokens();

    console.log(`Tokens encontrados en DB: ${tokens.length}`);
    if (!tokens.length) {
      console.warn("⚠  Ningún usuario tiene notificationTokens registrados.");
      process.exit(0);
    }

    if (DRY_RUN) {
      console.log("\n[DRY RUN] Tokens que recibirían la notificación:");
      tokens.forEach((t, i) => console.log(`  [${i + 1}] ${t.slice(0, 30)}…`));
      console.log("\nEvento:", EVENTS.STORE_PRODUCT_CREATED);
      console.log("Payload:", eventPayload);
    } else {
      await dispatch(EVENTS.STORE_PRODUCT_CREATED, eventPayload);
      console.log("✓ Notificación enviada a todos los usuarios.");
    }
  } else {
    // ── Modo: usuario específico ─────────────────────────────────────────────
    console.log(`\n═══ MODO: Usuario específico [${TARGET_USER_ID}] ═══`);

    let tokens;
    try {
      tokens = await getTokensByUserId(TARGET_USER_ID);
    } catch (err) {
      console.error("✗ Error al buscar usuario:", err.message);
      process.exit(1);
    }

    console.log(`Tokens encontrados para el usuario: ${tokens.length}`);

    if (!tokens.length) {
      console.warn("⚠  Este usuario no tiene notificationTokens registrados.");
      console.log(
        "\nPara agregar un token de prueba al usuario, ejecutá en mongosh:",
      );
      console.log(`  db.users.updateOne(
    { _id: ObjectId("${TARGET_USER_ID}") },
    { $push: { notificationTokens: "TOKEN_FCM_AQUI" } }
  )`);
      process.exit(0);
    }

    if (DRY_RUN) {
      console.log("\n[DRY RUN] Tokens del usuario:");
      tokens.forEach((t, i) => console.log(`  [${i + 1}] ${t.slice(0, 30)}…`));
      console.log("\nEvento:", EVENTS.STORE_PRODUCT_CREATED);
      console.log("Payload:", eventPayload);
    } else {
      console.log(`\nEnviando notificación de prueba...`);
      console.log("  Evento:    ", EVENTS.STORE_PRODUCT_CREATED);
      console.log("  ProductId: ", fakeProductId);
      console.log("  Tokens:    ", tokens.length);

      await dispatchToTokens(
        EVENTS.STORE_PRODUCT_CREATED,
        tokens,
        eventPayload,
      );
      console.log(
        "\n✓ Notificación enviada. Revisá la consola para ver éxitos/fallos.",
      );
    }
  }
}

// ── 5. Ejecución ─────────────────────────────────────────────────────────────
main()
  .then(() => {
    console.log("\n✓ Script finalizado.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n✗ Error fatal:", err);
    process.exit(1);
  });
