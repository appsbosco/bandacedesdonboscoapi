/**
 * syncUsersFromExcel.js  v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Sincroniza usuarios de MongoDB con datos correctos provenientes de un Excel.
 * Compatible con archivos exportados desde Apple Numbers (tienen ' en los valores).
 *
 * Hoja principal usada: "Formulario de participación"
 * Columnas esperadas:
 *   instrument | Primer nombre | Segundo nombre | Primer apellido |
 *   Segundo apellido | Identificación | Nacionalidad | fecha_de_nacimiento | Teléfono
 *
 * Estrategia de matching (en orden de prioridad):
 *   1. Cédula exacta (carnet)  → confianza 1.0
 *   2. Teléfono exacto         → confianza 0.95
 *   3. Fuzzy nombre completo   → confianza = score Fuse.js
 *
 * Uso:
 *   node scripts/syncUsersFromExcel.js --file datos.xlsx --dry-run
 *   node scripts/syncUsersFromExcel.js --file datos.xlsx --apply
 *   node scripts/syncUsersFromExcel.js --file datos.xlsx --dry-run --verbose
 *
 * Dependencias:
 *   npm install xlsx fuse.js mongoose dotenv
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

require("dotenv").config({
  path: require("path").resolve(__dirname, "../config/.env"),
});

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const Fuse = require("fuse.js");
const mongoose = require("mongoose");

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fileArg =
  args.find((a) => a.startsWith("--file="))?.split("=")[1] ||
  args[args.indexOf("--file") + 1];
const DRY_RUN = args.includes("--dry-run");
const APPLY = args.includes("--apply");
const VERBOSE = args.includes("--verbose");

if (!fileArg) {
  console.error("❌  Especificá el archivo: --file datos.xlsx");
  process.exit(1);
}
if (!DRY_RUN && !APPLY) {
  console.error("❌  Usá --dry-run o --apply");
  process.exit(1);
}

const EXCEL_PATH = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(EXCEL_PATH)) {
  console.error(`❌  Archivo no encontrado: ${EXCEL_PATH}`);
  process.exit(1);
}

// ─── Thresholds ──────────────────────────────────────────────────────────────
const FUZZY_MIN_SCORE = 0.75; // mínimo para considerar match por nombre
const FUZZY_AMBIG_DELTA = 0.06; // si 2 candidatos están a menos de esto → ambiguo

// ─── Mongoose model ──────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema(
  {
    name: String,
    firstSurName: String,
    secondSurName: String,
    email: String,
    password: String,
    birthday: String,
    carnet: String,
    state: String,
    role: String,
    grade: String,
    phone: String,
    instrument: String,
    avatar: String,
    bands: [String],
    notificationTokens: [String],
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { collection: "users" },
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

// ─── MedicalRecord model (solo los campos que nos interesan) ──────────────────
const MedicalRecordSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    identification: String,
  },
  { collection: "medicalrecords" },
);
const MedicalRecord =
  mongoose.models.MedicalRecord ||
  mongoose.model("MedicalRecord", MedicalRecordSchema);

// ─── Normalización ────────────────────────────────────────────────────────────

/**
 * Limpia el artefacto de Apple Numbers: los valores llegan como 'texto
 * con una comilla simple al inicio. XLSX los parsea como string con ' al inicio.
 */
function cleanAppleString(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  return s.startsWith("'") ? s.slice(1).trim() : s;
}

/** Normaliza para comparación: sin acentos, lowercase, sin espacios dobles */
function normalize(str = "") {
  return cleanAppleString(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(p = "") {
  return cleanAppleString(p).replace(/\D/g, "").slice(-8);
}

/**
 * Convierte a Title Case respetando nombres latinos.
 * "DENISSE MARIN" → "Denisse Marin"  |  "jose " → "Jose"
 */
function toTitleCase(str = "") {
  return cleanAppleString(str)
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Limpia fechas con paréntesis: "(05/09/2012)" → "05/09/2012"
 */
function cleanDate(str = "") {
  return cleanAppleString(str).replace(/[()]/g, "").trim();
}

function normalizeCarnet(c = "") {
  return String(c).replace(/'/g, "").replace(/\D/g, "");
}

function fullName(name = "", first = "", second = "") {
  return normalize(`${name} ${first} ${second}`);
}

// ─── Leer Excel ──────────────────────────────────────────────────────────────

// Nombre de la hoja a usar
const TARGET_SHEET = "Formulario de participación";

// Nombres exactos de columnas en esa hoja (tal como aparecen tras limpiar la ')
const COL = {
  instrument: "instrument",
  firstName: "Primer nombre",
  middleName: "Segundo  nombre", // doble espacio tal como está en el Excel
  firstSurName: "Primer apellido",
  secondSurName: "Segundo apellido",
  carnet: "Identificación",
  birthday: "fecha_de_nacimiento",
  phone: "Teléfono",
};

function readExcel(filePath) {
  const wb = XLSX.readFile(filePath);

  const sheetName = wb.SheetNames.includes(TARGET_SHEET)
    ? TARGET_SHEET
    : wb.SheetNames[0];

  if (VERBOSE) console.log(`\n📋  Usando hoja: "${sheetName}"`);

  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: null });

  if (!raw.length) throw new Error(`La hoja "${sheetName}" está vacía.`);

  // Los headers pueden tener ' al inicio — construir mapa cleanHeader→originalKey
  const firstRow = raw[0];
  const headerMap = {}; // cleanHeader -> originalKey en el objeto JSON
  for (const key of Object.keys(firstRow)) {
    headerMap[cleanAppleString(key)] = key;
  }

  if (VERBOSE) {
    console.log("\n🗂   Columnas detectadas:");
    for (const k of Object.keys(headerMap)) console.log(`   "${k}"`);
    console.log("\n👁   Primeras 3 filas parseadas:");
  }

  function get(row, colName) {
    const rawKey = headerMap[colName] ?? colName;
    return cleanAppleString(row[rawKey] ?? "");
  }

  return raw.map((row, i) => {
    // Combinar primer + segundo nombre en Title Case → va al campo "name"
    const rawFirst = toTitleCase(get(row, COL.firstName));
    const rawMiddle = toTitleCase(get(row, COL.middleName));
    const combinedName = [rawFirst, rawMiddle].filter(Boolean).join(" ");

    const parsed = {
      _row: i + 2,
      instrument: get(row, COL.instrument),
      firstName: combinedName, // "Diego Andres", "Ana"
      middleName: rawMiddle, // solo para referencia
      firstSurName: toTitleCase(get(row, COL.firstSurName)),
      secondSurName: toTitleCase(get(row, COL.secondSurName)),
      carnet: normalizeCarnet(get(row, COL.carnet)),
      birthday: cleanDate(get(row, COL.birthday)), // quita paréntesis
      phone: normalizePhone(get(row, COL.phone)),
    };
    if (VERBOSE && i < 3) {
      console.log(
        `   [${parsed._row}] ${parsed.firstName} ${parsed.firstSurName} ${parsed.secondSurName}` +
          ` | cédula: ${parsed.carnet || "—"} | tel: ${parsed.phone || "—"}`,
      );
    }
    return parsed;
  });
}

// ─── Matching ────────────────────────────────────────────────────────────────

function buildFuseIndex(dbUsers) {
  const docs = dbUsers.map((u) => ({
    _id: u._id.toString(),
    fullName: fullName(u.name, u.firstSurName, u.secondSurName),
    phone: normalizePhone(u.phone || ""),
    carnet: normalizeCarnet(u.carnet || ""),
  }));

  const fuse = new Fuse(docs, {
    keys: ["fullName"],
    threshold: 1 - FUZZY_MIN_SCORE,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 3,
  });

  return { fuse, docs };
}

function findMatch(excelRow, dbUsers, fuseIndex) {
  const { fuse } = fuseIndex;

  // 1. Cédula exacta
  if (excelRow.carnet) {
    const byCarnet = dbUsers.filter(
      (u) => normalizeCarnet(u.carnet || "") === excelRow.carnet,
    );
    if (byCarnet.length === 1)
      return { user: byCarnet[0], confidence: 1.0, method: "carnet" };
    if (byCarnet.length > 1)
      return {
        user: null,
        confidence: 0,
        method: "carnet_ambiguous",
        candidates: byCarnet.map((u) => u._id.toString()),
      };
  }

  // 2. Teléfono exacto
  if (excelRow.phone) {
    const byPhone = dbUsers.filter(
      (u) => normalizePhone(u.phone || "") === excelRow.phone,
    );
    if (byPhone.length === 1)
      return { user: byPhone[0], confidence: 0.95, method: "phone" };
    if (byPhone.length > 1)
      return {
        user: null,
        confidence: 0,
        method: "phone_ambiguous",
        candidates: byPhone.map((u) => u._id.toString()),
      };
  }

  // Helper: evalúa un query fuzzy y retorna match, ambiguo, o null
  function tryFuzzy(query, method) {
    if (!query) return null;
    const results = fuse.search(query);
    if (!results.length) return null;

    const bestScore = 1 - (results[0].score ?? 1);
    if (bestScore < FUZZY_MIN_SCORE) return null;

    if (results.length > 1) {
      const secondScore = 1 - (results[1].score ?? 1);
      if (bestScore - secondScore < FUZZY_AMBIG_DELTA) {
        return {
          user: null,
          confidence: bestScore,
          method: method + "_ambiguous",
          candidates: [results[0], results[1]].map((r) => r.item._id),
          query,
        };
      }
    }
    const matched = dbUsers.find(
      (u) => u._id.toString() === results[0].item._id,
    );
    return { user: matched, confidence: bestScore, method };
  }

  // 3a. Fuzzy con nombre completo (incluye segundo nombre si existe)
  //     Ej: "Josué David Zumbado Arias"
  const queryFull = normalize(
    `${excelRow.firstName} ${excelRow.firstSurName} ${excelRow.secondSurName}`,
  )
    .replace(/\s+/g, " ")
    .trim();

  const matchFull = tryFuzzy(queryFull, "fuzzy_full");
  if (matchFull) return matchFull;

  // 3b. Fuzzy solo con primer nombre (sin segundo nombre) + apellidos
  //     Cubre el caso donde la BD tiene "Josué" y el Excel tiene "Josué David"
  //     Al encontrarlo, el diff luego actualizará name a "Josué David"
  const onlyFirst = normalize(excelRow.firstName).split(" ")[0]; // primer token
  const queryShort = normalize(
    `${onlyFirst} ${excelRow.firstSurName} ${excelRow.secondSurName}`,
  )
    .replace(/\s+/g, " ")
    .trim();

  if (queryShort !== queryFull) {
    const matchShort = tryFuzzy(queryShort, "fuzzy_first_only");
    if (matchShort) return matchShort;
  }

  return null;
}

// ─── Diff ────────────────────────────────────────────────────────────────────

function buildDiff(excelRow, dbUser) {
  const changes = {};
  const map = [
    // firstName ya contiene "Primer Nombre Segundo Nombre" combinados en Title Case
    { field: "name", val: excelRow.firstName },
    { field: "firstSurName", val: excelRow.firstSurName },
    { field: "secondSurName", val: excelRow.secondSurName },
    // carnet = carnet institucional del colegio, NO la cédula
    // la cédula va en MedicalRecord.identification (se actualiza por separado)
    // exalumnos no tienen carnet, así que no se toca este campo
    { field: "birthday", val: excelRow.birthday },
    { field: "phone", val: excelRow.phone },
    // instrument: se usa para matching pero NO se sobrescribe en BD
  ];

  for (const { field, val } of map) {
    if (!val) continue;
    const current = String(dbUser[field] || "").trim();
    const incoming = val.trim();
    if (normalize(current) !== normalize(incoming)) {
      changes[field] = { from: current, to: incoming };
    }
  }
  return changes;
}

// ─── Reporte ─────────────────────────────────────────────────────────────────

function saveReport(report) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.resolve(process.cwd(), `sync_report_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  return outPath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n🎺  syncUsersFromExcel v2  |  modo: ${DRY_RUN ? "DRY-RUN 👀" : "APPLY 💾"}`,
  );
  console.log(`📂  Archivo: ${EXCEL_PATH}\n`);

  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!MONGO_URI) throw new Error("Falta MONGO_URI / MONGODB_URI en .env");
  await mongoose.connect(MONGO_URI);
  console.log("✅  Conectado a MongoDB\n");

  const excelRows = readExcel(EXCEL_PATH);
  console.log(`📊  Filas en Excel:  ${excelRows.length}`);

  const dbUsers = await User.find({})
    .select(
      "name firstSurName secondSurName email carnet birthday phone instrument state",
    )
    .lean();
  console.log(`👥  Usuarios en BD:  ${dbUsers.length}\n`);

  const fuseIndex = buildFuseIndex(dbUsers);

  const report = {
    mode: DRY_RUN ? "dry-run" : "apply",
    timestamp: new Date().toISOString(),
    updated: [],
    noChanges: [],
    ambiguous: [],
    notFound: [],
  };

  let updatedCount = 0;

  for (const row of excelRows) {
    const match = findMatch(row, dbUsers, fuseIndex);

    if (!match) {
      report.notFound.push({
        _row: row._row,
        excel: rowLabel(row),
        parsed: row,
      });
      continue;
    }

    if (!match.user) {
      report.ambiguous.push({
        _row: row._row,
        excel: rowLabel(row),
        method: match.method,
        confidence: round(match.confidence),
        candidates: match.candidates,
        query: match.query,
      });
      continue;
    }

    const diff = buildDiff(row, match.user);

    if (!Object.keys(diff).length) {
      report.noChanges.push({
        _row: row._row,
        userId: match.user._id.toString(),
        dbName: fullName(
          match.user.name,
          match.user.firstSurName,
          match.user.secondSurName,
        ),
        confidence: round(match.confidence),
        method: match.method,
      });
      continue;
    }

    const entry = {
      _row: row._row,
      userId: match.user._id.toString(),
      dbEmail: match.user.email,
      dbName: fullName(
        match.user.name,
        match.user.firstSurName,
        match.user.secondSurName,
      ),
      excelName: rowLabel(row),
      confidence: round(match.confidence),
      method: match.method,
      changes: diff,
    };
    report.updated.push(entry);

    const conf = round(match.confidence * 100);
    console.log(
      `🔄  [fila ${row._row}] ${entry.dbName}  (${match.method}, ${conf}%)`,
    );
    for (const [field, { from, to }] of Object.entries(diff)) {
      console.log(`     ${field.padEnd(14)} "${from || "(vacío)"}" → "${to}"`);
    }

    if (APPLY) {
      const update = {};
      for (const [f, { to }] of Object.entries(diff)) update[f] = to;
      await User.findByIdAndUpdate(match.user._id, update);

      // Actualizar cédula en MedicalRecord.identification si existe el registro
      // Solo si no es Exalumno y la cédula del Excel tiene valor
      const isExalumno = (match.user.state || "")
        .toLowerCase()
        .includes("exalumno");
      if (row.carnet && !isExalumno) {
        const mr = await MedicalRecord.findOne({ user: match.user._id });
        if (mr) {
          const currentId = (mr.identification || "").trim();
          if (normalizeCarnet(currentId) !== row.carnet) {
            await MedicalRecord.findByIdAndUpdate(mr._id, {
              identification: row.carnet,
            });
            entry.medicalRecordUpdated = { from: currentId, to: row.carnet };
          }
        }
      }

      updatedCount++;
    }
  }

  console.log("\n─────────────────────────────────────────────");
  console.log(`✅  Con cambios:     ${report.updated.length}`);
  console.log(`⏭   Sin cambios:    ${report.noChanges.length}`);
  console.log(`⚠️   Ambiguos:       ${report.ambiguous.length}`);
  console.log(`❓  No encontrados:  ${report.notFound.length}`);
  if (APPLY) console.log(`💾  Actualizados:   ${updatedCount}`);
  console.log("─────────────────────────────────────────────\n");

  if (report.ambiguous.length) {
    console.log("⚠️  AMBIGUOS — revisión manual:");
    for (const a of report.ambiguous) {
      console.log(
        `   fila ${a._row}  "${a.excel}"  →  candidatos: ${a.candidates?.join(", ")}`,
      );
    }
    console.log();
  }

  if (report.notFound.length) {
    console.log("❓  NO ENCONTRADOS en BD:");
    for (const n of report.notFound) {
      const p = n.parsed;
      console.log(
        `   fila ${n._row}  "${n.excel}"` +
          `  [cédula: ${p.carnet || "—"}, tel: ${p.phone || "—"}]`,
      );
    }
    console.log();
  }

  const reportPath = saveReport(report);
  console.log(`📄  Reporte: ${reportPath}\n`);

  await mongoose.disconnect();
}

function rowLabel(row) {
  // firstName ya incluye el segundo nombre combinado
  return `${row.firstName} ${row.firstSurName} ${row.secondSurName}`
    .replace(/\s+/g, " ")
    .trim();
}
function round(n) {
  return Math.round(n * 1000) / 1000;
}

main().catch((err) => {
  console.error("❌  Error fatal:", err);
  mongoose.disconnect();
  process.exit(1);
});
