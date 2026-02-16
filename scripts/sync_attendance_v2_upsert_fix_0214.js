/**
 * sync_from_legacy_attendances_to_v2_0214.js
 *
 * Migra SOLO lo que está en legacy `attendances` y NO está en `attendanceRecords` (por legacyId).
 * - Crea/Upsertea sessions en `rehearsalSessions` por (dateNormalized + section)
 * - Upsertea attendanceRecords por (session + user) (no duplica)
 * - Fix: createdAt/updatedAt del 2026-02-16 -> 2026-02-14 (si ambos caen ese día)
 * - Set: recordedBy fijo (y rellena si falta)
 *
 * ENV:
 *  - MONGODB_URI (o MONGO_URI)
 *  - DB_NAME (opcional si viene en el URI)
 */

require("dotenv").config();

const mongoose = require("mongoose");
const { DateTime } = require("luxon");

const TZ = "America/Costa_Rica";

const LEGACY_ATT_COL = "attendances";
const USERS_COL = "users";
const SESSIONS_COL = "rehearsalSessions";
const RECORDS_COL = "attendanceRecords";

const RECORDED_BY = new mongoose.Types.ObjectId("651744a9ff2682956e94bcb3");

const FEB16_START = new Date("2026-02-16T00:00:00.000Z");
const FEB17_START = new Date("2026-02-17T00:00:00.000Z");

// ---------- helpers ----------
function normStr(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeToCRStartOfDay(jsDate) {
  return DateTime.fromJSDate(jsDate, { zone: "utc" })
    .setZone(TZ)
    .startOf("day")
    .toJSDate();
}

function sectionFromInstrument(instrumentRaw) {
  const inst = normStr(instrumentRaw);

  if (!inst || inst === "no aplica") return "NO_APLICA";
  if (inst.includes("flauta")) return "FLAUTAS";
  if (inst.includes("clarinet")) return "CLARINETES";
  if (inst.includes("sax")) return "SAXOFONES";
  if (inst.includes("trompeta")) return "TROMPETAS";
  if (inst.includes("trombon")) return "TROMBONES";
  if (inst.includes("tuba")) return "TUBAS";
  if (inst.includes("eufon")) return "EUFONIOS";
  if (inst.includes("corno")) return "CORNOS";
  if (inst.includes("mallet")) return "MALLETS";
  if (inst.includes("percusion") || inst.includes("percus")) return "PERCUSION";
  if (inst.includes("color") && inst.includes("guard")) return "COLOR_GUARD";
  if (inst.includes("danza")) return "DANZA";

  return "NO_APLICA";
}

// Legacy attended -> enums nuevos (compatibles con tu schema actual)
function mapLegacyAttended(attended) {
  switch (attended) {
    case "present":
      return "PRESENT";
    case "late":
      return "LATE";
    case "justified_absence":
    case "justified_withdrawal":
      return "ABSENT_JUSTIFIED";
    case "unjustified_absence":
    case "unjustified_withdrawal":
    default:
      return "ABSENT_UNJUSTIFIED";
  }
}

async function ensureIndexes(db) {
  await db
    .collection(SESSIONS_COL)
    .createIndex({ dateNormalized: 1, section: 1 }, { unique: true });

  await db
    .collection(RECORDS_COL)
    .createIndex({ session: 1, user: 1 }, { unique: true });

  const recordsCol = db.collection(RECORDS_COL);
  const indexes = await recordsCol.indexes();
  const legacyIdx = indexes.find((i) => i.name === "legacyId_1");

  if (!legacyIdx) {
    // si querés crearlo, crealo sin pelearte con tu DB actual
    await recordsCol.createIndex(
      { legacyId: 1 },
      { name: "legacyId_1", unique: true },
    );
  } else {
    console.log(
      `ℹ️ Índice legacyId_1 ya existe (unique=${!!legacyIdx.unique}). Skip createIndex.`,
    );
  }
}

async function fixFeb16ToFeb14(db) {
  const sessionsCol = db.collection(SESSIONS_COL);
  const recordsCol = db.collection(RECORDS_COL);

  const sessRes = await sessionsCol.updateMany(
    {
      createdAt: { $gte: FEB16_START, $lt: FEB17_START },
      updatedAt: { $gte: FEB16_START, $lt: FEB17_START },
    },
    [
      {
        $set: {
          createdAt: {
            $dateSubtract: { startDate: "$createdAt", unit: "day", amount: 2 },
          },
          updatedAt: {
            $dateSubtract: { startDate: "$updatedAt", unit: "day", amount: 2 },
          },
        },
      },
    ],
  );

  const recRes = await recordsCol.updateMany(
    {
      createdAt: { $gte: FEB16_START, $lt: FEB17_START },
      updatedAt: { $gte: FEB16_START, $lt: FEB17_START },
    },
    [
      {
        $set: {
          createdAt: {
            $dateSubtract: { startDate: "$createdAt", unit: "day", amount: 2 },
          },
          updatedAt: {
            $dateSubtract: { startDate: "$updatedAt", unit: "day", amount: 2 },
          },
          recordedBy: RECORDED_BY,
        },
      },
    ],
  );

  const fillRecBy = await recordsCol.updateMany(
    { $or: [{ recordedBy: null }, { recordedBy: { $exists: false } }] },
    { $set: { recordedBy: RECORDED_BY } },
  );

  return {
    rehearsalSessions_fixed: sessRes.modifiedCount,
    attendanceRecords_fixed_dates: recRes.modifiedCount,
    attendanceRecords_filled_recordedBy: fillRecBy.modifiedCount,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) {
    console.error("❌ Falta MONGODB_URI (o MONGO_URI)");
    process.exit(1);
  }

  await mongoose.connect(uri, dbName ? { dbName } : {});
  const db = mongoose.connection.db;

  console.log("✅ Conectado a MongoDB");
  console.log("🔧 Índices...");
  await ensureIndexes(db);

  const usersCol = db.collection(USERS_COL);
  const legacyCol = db.collection(LEGACY_ATT_COL);
  const sessionsCol = db.collection(SESSIONS_COL);
  const recordsCol = db.collection(RECORDS_COL);

  // Traemos todos los legacyId ya migrados para NO reprocesar
  const migratedLegacyIdsArr = await recordsCol.distinct("legacyId");
  const migratedLegacyIds = new Set(
    migratedLegacyIdsArr.filter(Boolean).map((x) => String(x)),
  );

  console.log(`📌 Ya migrados (por legacyId): ${migratedLegacyIds.size}`);

  let scanned = 0;
  let migrated = 0;
  let missingUsers = 0;

  // Cursor de legacy attendances
  const cursor = legacyCol.find(
    {},
    { projection: { _id: 1, user: 1, date: 1, attended: 1, notes: 1 } },
  );

  for await (const a of cursor) {
    scanned++;

    // ya migrado por legacyId
    if (migratedLegacyIds.has(String(a._id))) continue;

    if (!a.user || !a.date) continue;

    const u = await usersCol.findOne(
      { _id: a.user },
      { projection: { instrument: 1 } },
    );

    if (!u) {
      missingUsers++;
      continue;
    }

    const section = sectionFromInstrument(u.instrument);
    const dateNormalized = normalizeToCRStartOfDay(new Date(a.date));

    // UPSERT sesión por (dateNormalized + section) => evita choque con sesiones ya creadas por la app
    const sess = await sessionsCol.findOneAndUpdate(
      { dateNormalized, section },
      {
        $setOnInsert: {
          date: new Date(a.date),
          dateNormalized,
          section,
          status: "CLOSED",
          takenBy: null,
          takenAt: null,
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          migratedFrom: "legacy_attendances_sync",
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    const sessionId = sess.value._id;

    // UPSERT attendanceRecord por (session + user) => no duplica
    await recordsCol.updateOne(
      { session: sessionId, user: a.user },
      {
        $set: {
          status: mapLegacyAttended(a.attended),
          notes: a.notes || "",
          recordedBy: RECORDED_BY,
          legacyId: a._id,
          legacyAttended: a.attended,
          legacyDate: new Date(a.date),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          session: sessionId,
          user: a.user,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    migrated++;

    if (migrated % 200 === 0) {
      console.log(`...migrados: ${migrated} (scanned: ${scanned})`);
    }
  }

  console.log("✅ Sync legacy -> v2 terminado");
  console.log({ scanned, migrated, missingUsers });

  console.log("🕒 Fix 2026-02-16 -> 2026-02-14 + recordedBy...");
  const fixRes = await fixFeb16ToFeb14(db);
  console.log("✅ Fix:", fixRes);

  await mongoose.disconnect();
  console.log("🏁 Listo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
