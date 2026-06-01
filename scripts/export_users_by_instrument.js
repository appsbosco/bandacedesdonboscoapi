"use strict";

/**
 * Exporta todos los usuarios vinculados con su MedicalRecord para obtener cedula,
 * agrupados por instrumento.
 *
 * Uso:
 *   node scripts/export_users_by_instrument.js
 *   node scripts/export_users_by_instrument.js --out-dir=scripts/output/users-by-instrument
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const XLSX = require("xlsx");

const dbConnection = require("../config/database");
const User = require("../models/User");
const MedicalRecord = require("../models/MedicalRecord");

function parseArgs(argv) {
  const args = {
    outDir: path.resolve(process.cwd(), "scripts/output/users-by-instrument"),
  };

  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const [key, rawValue] = raw.slice(2).split("=");
    const value = rawValue === undefined ? true : rawValue;

    switch (key) {
      case "out-dir":
      case "outDir":
        args.outDir = path.resolve(process.cwd(), String(value));
        break;
      default:
        console.warn(`Unknown flag ignored: --${key}`);
        break;
    }
  }

  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function prettify(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function buildFullName(user) {
  return [user.name, user.firstSurName, user.secondSurName]
    .map(prettify)
    .filter(Boolean)
    .join(" ");
}

function normalizeInstrument(value) {
  return prettify(value) || "Sin instrumento";
}

function normalizeFileName(value) {
  return String(value || "sin-instrumento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "sin-instrumento";
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function writeCsv(filePath, rows) {
  const headers = [
    "instrument",
    "state",
    "nombreCompleto",
    "cedula",
    "email",
    "telefono",
    "role",
    "carnet",
    "medicalRecordId",
    "userId",
  ];

  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")),
  ];

  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function safeSheetName(name, usedNames) {
  const invalidChars = /[:\\/?*\[\]]/g;
  const base = (prettify(name).replace(invalidChars, " ") || "Sin instrumento")
    .slice(0, 31)
    .trim();

  let candidate = base || "Sin instrumento";
  let counter = 2;

  while (usedNames.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`.trim();
    counter += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

async function loadRows() {
  const [users, medicalRecords] = await Promise.all([
    User.find({})
      .select(
        "_id name firstSurName secondSurName email phone role carnet state instrument",
      )
      .sort({ instrument: 1, firstSurName: 1, secondSurName: 1, name: 1 })
      .lean(),
    MedicalRecord.find({}).select("_id user identification").lean(),
  ]);

  const medicalByUser = new Map();
  for (const record of medicalRecords) {
    if (!record.user) continue;
    medicalByUser.set(String(record.user), record);
  }

  const rows = users.map((user) => {
    const userId = String(user._id);
    const medicalRecord = medicalByUser.get(userId) || null;

    return {
      instrument: normalizeInstrument(user.instrument),
      state: prettify(user.state),
      nombreCompleto: buildFullName(user),
      cedula: prettify(medicalRecord?.identification),
      email: prettify(user.email),
      telefono: prettify(user.phone),
      role: prettify(user.role),
      carnet: prettify(user.carnet),
      medicalRecordId: medicalRecord ? String(medicalRecord._id) : "",
      userId,
    };
  });

  rows.sort((a, b) => {
    const byInstrument = a.instrument.localeCompare(b.instrument, "es");
    if (byInstrument !== 0) return byInstrument;
    return a.nombreCompleto.localeCompare(b.nombreCompleto, "es");
  });

  return { rows, usersCount: users.length, medicalRecordsCount: medicalRecords.length };
}

function groupByInstrument(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!groups.has(row.instrument)) groups.set(row.instrument, []);
    groups.get(row.instrument).push(row);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
}

function writeWorkbook(filePath, rows, groups) {
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Todos");
  usedSheetNames.add("Todos");

  for (const [instrument, instrumentRows] of groups) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(instrumentRows),
      safeSheetName(instrument, usedSheetNames),
    );
  }

  XLSX.writeFile(wb, filePath);
}

async function main() {
  const args = parseArgs(process.argv);
  ensureDir(args.outDir);

  console.log("Conectando base de datos...");
  await dbConnection();

  console.log("Cargando usuarios y fichas medicas...");
  const { rows, usersCount, medicalRecordsCount } = await loadRows();
  const groups = groupByInstrument(rows);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join(args.outDir, `users-by-instrument-${timestamp}.csv`);
  const xlsxPath = path.join(args.outDir, `users-by-instrument-${timestamp}.xlsx`);
  const byInstrumentDir = path.join(args.outDir, `by-instrument-${timestamp}`);
  const summaryPath = path.join(
    args.outDir,
    `users-by-instrument-${timestamp}.summary.json`,
  );

  ensureDir(byInstrumentDir);
  writeCsv(csvPath, rows);
  writeWorkbook(xlsxPath, rows, groups);

  const instrumentFiles = [];
  for (const [instrument, instrumentRows] of groups) {
    const filePath = path.join(
      byInstrumentDir,
      `${normalizeFileName(instrument)}.csv`,
    );
    writeCsv(filePath, instrumentRows);
    instrumentFiles.push({
      instrument,
      count: instrumentRows.length,
      csvPath: filePath,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totals: {
      usersLoaded: usersCount,
      medicalRecordsLoaded: medicalRecordsCount,
      exportedRows: rows.length,
      instruments: groups.length,
      rowsWithoutCedula: rows.filter((row) => !row.cedula).length,
    },
    files: {
      csvPath,
      xlsxPath,
      byInstrumentDir,
      summaryPath,
    },
    instruments: instrumentFiles,
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n================ SUMMARY ================");
  console.log(
    JSON.stringify(
      {
        exportedRows: rows.length,
        instruments: groups.length,
        rowsWithoutCedula: summary.totals.rowsWithoutCedula,
        csvPath,
        xlsxPath,
        byInstrumentDir,
      },
      null,
      2,
    ),
  );
  console.log("=========================================\n");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Script failed:", error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
