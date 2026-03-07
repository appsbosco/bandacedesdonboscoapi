/**
 * tourImports/services/tourImports.service.js
 *
 * Importación de participantes de gira desde Excel.
 * Flujo de 2 pasos:
 *   1. previewTourParticipantImport → parsea Excel, valida, detecta duplicados, crea TourImportBatch en PREVIEW
 *   2. confirmTourParticipantImport → inserta TourParticipants, actualiza batch a CONFIRMED
 */
"use strict";

const Tour = require("../../../../../models/Tour");
const TourParticipant = require("../../../../../models/TourParticipant");
const TourImportBatch = require("../../../../../models/TourImportBatch");
const { parseExcelBase64 } = require("../../../../utils/excelParser");

// ─── Auth guards ─────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  return user;
}

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (!ADMIN_ROLES.has(user.role)) {
    throw new Error(
      "No autorizado: se requiere rol Admin, Director o Subdirector",
    );
  }
  return user;
}

const VALID_ROLES = new Set(["MUSICIAN", "STAFF", "DIRECTOR", "GUEST"]);

const ROLE_MAP = {
  músico: "MUSICIAN",
  musico: "MUSICIAN",
  "Músico/Danza/Color guard": "MUSICIAN",
  "musico/danza/color guard": "MUSICIAN",
  musician: "MUSICIAN",
  música: "MUSICIAN",
  musica: "MUSICIAN",
  integrante: "MUSICIAN",
  staff: "STAFF",
  personal: "STAFF",
  logística: "STAFF",
  logistica: "STAFF",
  director: "DIRECTOR",
  directora: "DIRECTOR",
  dirección: "DIRECTOR",
  direccion: "DIRECTOR",
  invitado: "GUEST",
  guest: "GUEST",
  padre: "GUEST",
  madre: "GUEST",
  acompañante: "GUEST",
};

function normalizeRole(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase();
  if (VALID_ROLES.has(key.toUpperCase())) return key.toUpperCase();
  return ROLE_MAP[key] || null;
}

function validateRow(row) {
  const errors = [];
  if (!row.firstName || String(row.firstName).trim() === "") {
    errors.push("Nombre requerido");
  }
  if (!row.firstSurname || String(row.firstSurname).trim() === "") {
    errors.push("Primer apellido requerido");
  }
  if (!row.identification || String(row.identification).trim() === "") {
    errors.push("Identificación requerida");
  }

  // ← FIXED: normalize the role before validating
  if (row.role) {
    const normalized = normalizeRole(row.role);
    if (!normalized) {
      errors.push(
        `Rol inválido: "${row.role}". Valores válidos: MUSICIAN, STAFF, DIRECTOR, GUEST`,
      );
    }
  }

  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push("Email con formato inválido");
  }
  return errors;
}
// ─── Queries ──────────────────────────────────────────────────────────────────

async function getTourImportBatch(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de batch requerido");

  const batch = await TourImportBatch.findById(id)
    .populate("tour", "name destination")
    .populate("createdBy", "name firstSurName")
    .populate("confirmedBy", "name firstSurName");

  if (!batch) throw new Error("Batch de importación no encontrado");
  return batch;
}

async function getTourImportBatches(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  return TourImportBatch.find({ tour: tourId })
    .sort({ createdAt: -1 })
    .populate("tour", "name destination")
    .populate("createdBy", "name firstSurName")
    .populate("confirmedBy", "name firstSurName");
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * PASO 1: Previsualizar la importación.
 * Parsea el Excel, valida cada fila, detecta duplicados en la gira,
 * guarda un TourImportBatch en estado PREVIEW con los datos de la preview.
 */
async function previewTourParticipantImport(input, ctx) {
  const admin = requireAdmin(ctx);

  if (!input.tourId) throw new Error("ID de gira requerido");
  if (!input.fileBase64) throw new Error("Archivo Excel requerido (base64)");

  const tour = await Tour.findById(input.tourId);
  if (!tour) throw new Error("Gira no encontrada");

  // Parsear Excel
  let parsed;
  try {
    parsed = parseExcelBase64(input.fileBase64, { sheetName: input.sheetName });
  } catch (e) {
    throw new Error(`Error al procesar el archivo Excel: ${e.message}`);
  }

  const { rows } = parsed;
  if (rows.length === 0) {
    throw new Error("El archivo no contiene filas de datos");
  }

  // Calcular fingerprints de todos los candidatos para detectar duplicados en BD
  const candidateFingerprints = [];
  for (const row of rows) {
    if (row.firstName && row.firstSurname && row.identification) {
      candidateFingerprints.push(
        TourParticipant.buildFingerprint(
          row.firstName,
          row.firstSurname,
          row.identification,
        ),
      );
    }
  }

  const existingFPs = await TourParticipant.find(
    { tour: input.tourId, fingerprint: { $in: candidateFingerprints } },
    { fingerprint: 1 },
  ).lean();
  const existingSet = new Set(existingFPs.map((e) => e.fingerprint));

  // Evaluar cada fila
  const previewRows = [];
  const rowErrors = [];
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;

  // Para detectar duplicados dentro del mismo Excel
  const seenInFile = new Set();

  for (const row of rows) {
    const rowIndex = row.__rowIndex;
    const errors = validateRow(row);

    let isDuplicate = false;
    if (errors.length === 0) {
      const fp = TourParticipant.buildFingerprint(
        row.firstName,
        row.firstSurname,
        row.identification,
      );
      if (existingSet.has(fp) || seenInFile.has(fp)) {
        isDuplicate = true;
        errors.push("Participante ya existe en esta gira (duplicado)");
        duplicateRows++;
      } else {
        seenInFile.add(fp);
      }
    }

    const isValid = errors.length === 0;
    if (isValid) validRows++;
    else if (!isDuplicate) invalidRows++;

    console.log("Sample row[0]:", JSON.stringify(rows[0]));

    previewRows.push({
      rowIndex,
      firstName: row.firstName || null,
      firstSurname: row.firstSurname || null,
      secondSurname: row.secondSurname || null,
      identification: row.identification || null,
      email: row.email || null,
      phone: row.phone || null,
      instrument: row.instrument || null,
      grade: row.grade || null,
      passportNumber: row.passportNumber || null,
      role: row.role || null,
      isValid,
      isDuplicate,
      errors,
    });

    if (errors.length > 0) {
      rowErrors.push({ rowIndex, rowData: row, rowErrors: errors });
    }
  }

  // Guardar batch en PREVIEW — almacenamos rowErrors para confirmación posterior
  // Los datos completos de filas válidas se re-parsean en confirmación (no los guardamos en BD)
  const batch = await TourImportBatch.create({
    tour: input.tourId,
    fileName: input.fileName || null,
    status: "PREVIEW",
    totalRows: rows.length,
    validRows,
    invalidRows,
    duplicateRows,
    importedCount: 0,
    rowErrors,
    createdBy: admin._id || admin.id,
  });

  // Adjuntar el fileBase64 al batch en memoria (no en BD) para que confirmación lo use
  // Se guarda como campo temporal en el documento (no persistido)
  batch._tempFileBase64 = input.fileBase64;
  batch._tempSheetName = input.sheetName;

  return {
    batchId: batch._id.toString(),
    tourId: input.tourId,
    fileName: input.fileName || null,
    totalRows: rows.length,
    validRows,
    invalidRows,
    duplicateRows,
    rows: previewRows,
  };
}

/**
 * PASO 2: Confirmar la importación.
 * Re-parsea el Excel original... pero como no guardamos el archivo en BD,
 * el cliente debe re-enviarlo. En su lugar, confirmamos re-insertando desde
 * un batch ya en PREVIEW que tiene el fileBase64 en memoria.
 *
 * NOTA PRÁCTICA: El cliente tiene 2 opciones:
 *   a) Mantiene el base64 en el frontend y lo envía junto al batchId.
 *   b) Backend re-parse desde BD si guardó el archivo.
 *
 * En esta implementación: el cliente confirma con batchId solamente.
 * El batch guarda las filas válidas embebidas para poder confirmar sin re-enviar.
 * Para mantener la BD limpia, guardamos las filas válidas como JSON en un campo
 * temporal (no se expone via GraphQL).
 */
async function confirmTourParticipantImport(batchId, ctx) {
  const admin = requireAdmin(ctx);

  if (!batchId) throw new Error("ID de batch requerido");

  const batch = await TourImportBatch.findById(batchId);
  if (!batch) throw new Error("Batch de importación no encontrado");
  if (batch.status !== "PREVIEW") {
    throw new Error(
      `El batch ya fue ${batch.status === "CONFIRMED" ? "confirmado" : "cancelado"}`,
    );
  }

  // El batch no tiene el fileBase64, así que no podemos re-parsear.
  // Lanzamos error claro: el cliente debe usar confirmTourParticipantImportWithFile
  // (o usar la mutación alternativa que incluye el file).
  // Para esta implementación, el frontend debe enviar el base64 de nuevo.
  throw new Error(
    "Para confirmar, usa la mutación confirmTourParticipantImportWithFile enviando el archivo original",
  );
}

/**
 * ALTERNATIVA: Confirmar enviando el archivo de nuevo.
 * El frontend envía: batchId + fileBase64 + sheetName.
 */
async function confirmTourParticipantImportWithFile(
  batchId,
  fileBase64,
  sheetName,
  ctx,
) {
  const admin = requireAdmin(ctx);

  if (!batchId) throw new Error("ID de batch requerido");
  if (!fileBase64) throw new Error("Archivo Excel requerido");

  const batch = await TourImportBatch.findById(batchId).populate("tour");
  if (!batch) throw new Error("Batch de importación no encontrado");
  if (batch.status !== "PREVIEW") {
    throw new Error(
      `El batch ya fue ${batch.status === "CONFIRMED" ? "confirmado" : "cancelado"}`,
    );
  }

  const tourId = batch.tour._id || batch.tour;

  // Re-parsear Excel
  let parsed;
  try {
    parsed = parseExcelBase64(fileBase64, { sheetName });
  } catch (e) {
    throw new Error(`Error al procesar el archivo Excel: ${e.message}`);
  }

  const { rows } = parsed;

  // Calcular fingerprints existentes
  const candidateFingerprints = rows
    .filter((r) => r.firstName && r.firstSurname && r.identification)
    .map((r) =>
      TourParticipant.buildFingerprint(
        r.firstName,
        r.firstSurname,
        r.identification,
      ),
    );

  const existingFPs = await TourParticipant.find(
    { tour: tourId, fingerprint: { $in: candidateFingerprints } },
    { fingerprint: 1 },
  ).lean();
  const existingSet = new Set(existingFPs.map((e) => e.fingerprint));

  const adminId = admin._id || admin.id;
  const toInsert = [];
  let duplicates = 0;
  let errors = 0;
  const seenInFile = new Set();

  for (const row of rows) {
    const rowErrors = validateRow(row);
    if (rowErrors.length > 0) {
      errors++;
      continue;
    }

    const fp = TourParticipant.buildFingerprint(
      row.firstName,
      row.firstSurname,
      row.identification,
    );

    if (existingSet.has(fp) || seenInFile.has(fp)) {
      duplicates++;
      continue;
    }
    seenInFile.add(fp);

    const doc = {
      tour: tourId,
      fingerprint: fp,
      firstName: row.firstName,
      firstSurname: row.firstSurname,
      identification: row.identification,
      addedBy: adminId,
      importBatch: batch._id,
      importRowIndex: row.__rowIndex,
    };

    const optionals = [
      "secondSurname",
      "email",
      "phone",
      "birthDate",
      "instrument",
      "grade",
      "passportNumber",
      "passportExpiry",
      "hasVisa",
      "visaExpiry",
      "hasExitPermit",
      "notes",
    ];
    for (const f of optionals) {
      if (row[f] !== undefined && row[f] !== null && row[f] !== "") {
        doc[f] = row[f];
      }
    }

    const normalizedRole = normalizeRole(row.role);
    if (normalizedRole) {
      doc.role = normalizedRole;
    }

    toInsert.push(doc);
  }

  let insertedIds = [];
  if (toInsert.length > 0) {
    const inserted = await TourParticipant.insertMany(toInsert, {
      ordered: false,
    });
    insertedIds = inserted.map((p) => p._id);
  }

  // Actualizar batch
  await TourImportBatch.findByIdAndUpdate(batchId, {
    status: "CONFIRMED",
    importedCount: insertedIds.length,
    confirmedBy: adminId,
    confirmedAt: new Date(),
  });

  const participants =
    insertedIds.length > 0
      ? await TourParticipant.find({ _id: { $in: insertedIds } })
          .populate("linkedUser", "name firstSurName")
          .populate("addedBy", "name firstSurName")
      : [];

  return {
    batchId: batchId.toString(),
    tourId: tourId.toString(),
    importedCount: insertedIds.length,
    duplicates,
    errors,
    participants,
  };
}

async function cancelTourImportBatch(batchId, ctx) {
  requireAdmin(ctx);
  if (!batchId) throw new Error("ID de batch requerido");

  const batch = await TourImportBatch.findById(batchId);
  if (!batch) throw new Error("Batch de importación no encontrado");
  if (batch.status !== "PREVIEW") {
    throw new Error("Solo se pueden cancelar batches en estado PREVIEW");
  }

  await TourImportBatch.findByIdAndUpdate(batchId, { status: "CANCELLED" });
  return "Batch de importación cancelado correctamente";
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  requireAuth,
  requireAdmin,
  getTourImportBatch,
  getTourImportBatches,
  previewTourParticipantImport,
  confirmTourParticipantImport,
  confirmTourParticipantImportWithFile,
  cancelTourImportBatch,
};
