/**
 * tourImports/services/tourImports.service.js
 *
 * CHANGES:
 * - confirmTourParticipantImportWithFile acepta mode: "INSERT" | "UPSERT"
 *   - INSERT (default): salta duplicados (comportamiento original)
 *   - UPSERT: actualiza participantes existentes con los datos del Excel
 * - previewTourParticipantImport expone birthDate en la preview para que el
 *   frontend pueda mostrarla y el admin verificar que se leyó bien
 */
"use strict";

const Tour = require("../../../../../models/Tour");
const TourParticipant = require("../../../../../models/TourParticipant");
const TourImportBatch = require("../../../../../models/TourImportBatch");
const { parseExcelBase64 } = require("../../../../utils/excelParser");

// ─── Auth guards ──────────────────────────────────────────────────────────────

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
  "músico/danza/color guard": "MUSICIAN",
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

/**
 * Validación relajada para UPSERT.
 * Solo requiere identificación — el resto de campos obligatorios
 * (nombre, apellido) ya existen en el participante registrado en BD.
 * La identificación es la clave para encontrar el registro existente.
 */
function validateRowForUpsert(row) {
  const errors = [];
  if (!row.identification || String(row.identification).trim() === "") {
    errors.push("Identificación requerida");
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
 * Ahora incluye birthDate en la preview para que el admin pueda verificar
 * que las fechas se leyeron correctamente antes de confirmar.
 */
async function previewTourParticipantImport(input, ctx) {
  const admin = requireAdmin(ctx);

  if (!input.tourId) throw new Error("ID de gira requerido");
  if (!input.fileBase64) throw new Error("Archivo Excel requerido (base64)");

  const mode = input.mode || "INSERT";
  const isUpsert = mode === "UPSERT";

  const tour = await Tour.findById(input.tourId);
  if (!tour) throw new Error("Gira no encontrada");

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

  // Para UPSERT: cargar TODOS los participantes del tour indexados por
  // fingerprint E identification. Esto permite detectar "duplicados" (a actualizar)
  // incluso cuando el fingerprint no coincide (ej. bug previo de segundo_nombre).
  const existingSet = new Set();       // fingerprints
  const existingIdSet = new Set();     // identificaciones (para UPSERT fallback)

  if (isUpsert) {
    const allExisting = await TourParticipant.find(
      { tour: input.tourId },
      { fingerprint: 1, identification: 1 },
    ).lean();
    for (const p of allExisting) {
      if (p.fingerprint) existingSet.add(p.fingerprint);
      if (p.identification) existingIdSet.add(String(p.identification).trim());
    }
  } else {
    // INSERT: solo cargar los que coinciden por fingerprint (comportamiento original)
    const candidateFingerprints = [];
    for (const row of rows) {
      if (row.firstName && row.firstSurname && row.identification) {
        candidateFingerprints.push(
          TourParticipant.buildFingerprint(row.firstName, row.firstSurname, row.identification),
        );
      }
    }
    const existingParticipants = await TourParticipant.find(
      { tour: input.tourId, fingerprint: { $in: candidateFingerprints } },
      { fingerprint: 1 },
    ).lean();
    for (const p of existingParticipants) existingSet.add(p.fingerprint);
  }

  const previewRows = [];
  const rowErrors = [];
  let validRows = 0;
  let invalidRows = 0;
  let duplicateRows = 0;
  // In UPSERT mode: track by identification; in INSERT mode: track by fingerprint
  const seenInFile = new Set();

  for (const row of rows) {
    const rowIndex = row.__rowIndex;
    const errors = isUpsert ? validateRowForUpsert(row) : validateRow(row);

    let isDuplicate = false;
    if (errors.length === 0) {
      if (isUpsert) {
        // UPSERT: match by identification first (fingerprint may be stale from prior bug)
        const idKey = row.identification ? String(row.identification).trim() : "";
        const fp = (row.firstName && row.firstSurname && row.identification)
          ? TourParticipant.buildFingerprint(row.firstName, row.firstSurname, row.identification)
          : null;

        if (seenInFile.has(idKey)) {
          // True in-file duplicate — skip silently
          isDuplicate = true;
          duplicateRows++;
        } else if ((idKey && existingIdSet.has(idKey)) || (fp && existingSet.has(fp))) {
          // Exists in DB → will be updated
          isDuplicate = true;
          duplicateRows++;
          if (idKey) seenInFile.add(idKey);
        } else {
          // New participant
          if (idKey) seenInFile.add(idKey);
        }
      } else {
        // INSERT: match by fingerprint (original behavior)
        if (row.firstName && row.firstSurname && row.identification) {
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
      }
    }

    const isValid = errors.length === 0 && !isDuplicate;
    if (isValid) validRows++;
    else if (!isDuplicate) invalidRows++;

    previewRows.push({
      rowIndex,
      firstName: row.firstName || null,
      firstSurname: row.firstSurname || null,
      secondSurname: row.secondSurname || null,
      identification: row.identification || null,
      birthDate: row.birthDate || null, // ← expuesto para verificación
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
 *
 * mode: "INSERT" (default) — salta duplicados, inserta solo nuevos
 * mode: "UPSERT" — actualiza participantes existentes con los campos del Excel
 *                  que vengan con valor. No sobreescribe con null/vacío.
 *
 * En UPSERT los "duplicados" no cuentan como error — se actualizan y se
 * reportan en updatedCount.
 */
async function confirmTourParticipantImportWithFile(
  batchId,
  fileBase64,
  sheetName,
  ctx,
  mode = "INSERT",
) {
  const admin = requireAdmin(ctx);
  const isUpsert = mode === "UPSERT";

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

  let parsed;
  try {
    parsed = parseExcelBase64(fileBase64, { sheetName });
  } catch (e) {
    throw new Error(`Error al procesar el archivo Excel: ${e.message}`);
  }

  const { rows } = parsed;

  // --- Fingerprint map (primary match) ---
  const candidateFingerprints = rows
    .filter((r) => r.firstName && r.firstSurname && r.identification)
    .map((r) => TourParticipant.buildFingerprint(r.firstName, r.firstSurname, r.identification));

  const existingByFp = await TourParticipant.find(
    { tour: tourId, fingerprint: { $in: candidateFingerprints } },
    { fingerprint: 1, _id: 1 },
  ).lean();

  const existingMap = new Map(existingByFp.map((e) => [e.fingerprint, e._id]));

  // --- Identification map (UPSERT fallback: catches stale fingerprints from prior bug) ---
  const idMap = new Map(); // identification -> _id
  if (isUpsert) {
    const candidateIds = rows
      .filter((r) => r.identification)
      .map((r) => String(r.identification).trim());

    const existingById = await TourParticipant.find(
      { tour: tourId, identification: { $in: candidateIds } },
      { identification: 1, _id: 1 },
    ).lean();

    for (const p of existingById) {
      if (p.identification) idMap.set(String(p.identification).trim(), p._id);
    }
  }

  const adminId = admin._id || admin.id;
  const toInsert = [];
  const toUpdate = [];
  let duplicatesSkipped = 0;
  let parseErrors = 0;
  // UPSERT: dedupe by identification; INSERT: dedupe by fingerprint
  const seenInFile = new Set();

  const OPTIONAL_FIELDS = [
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

  for (const row of rows) {
    const rowErrors = isUpsert ? validateRowForUpsert(row) : validateRow(row);
    if (rowErrors.length > 0) {
      parseErrors++;
      continue;
    }

    const idKey = row.identification ? String(row.identification).trim() : "";
    const fp = (row.firstName && row.firstSurname && row.identification)
      ? TourParticipant.buildFingerprint(row.firstName, row.firstSurname, row.identification)
      : null;

    // Deduplicate within this file
    const dedupeKey = isUpsert ? idKey : fp;
    if (!dedupeKey || seenInFile.has(dedupeKey)) {
      duplicatesSkipped++;
      continue;
    }
    seenInFile.add(dedupeKey);

    // Resolve existing participant: fingerprint first, then identification fallback
    const existingId =
      (fp && existingMap.get(fp)) ||
      (isUpsert && idKey && idMap.get(idKey)) ||
      null;

    if (existingId) {
      if (isUpsert) {
        const updateFields = {};
        for (const f of OPTIONAL_FIELDS) {
          const val = row[f];
          if (f === "hasVisa" || f === "hasExitPermit") {
            updateFields[f] = val === true || val === false ? val : false;
          } else if (val !== undefined && val !== null && val !== "") {
            updateFields[f] = val;
          }
        }
        // Update name fields if present in Excel
        if (row.firstName) updateFields.firstName = row.firstName;
        if (row.firstSurname) updateFields.firstSurname = row.firstSurname;
        if (row.secondSurname) updateFields.secondSurname = row.secondSurname;
        const normalizedRole = normalizeRole(row.role);
        if (normalizedRole) updateFields.role = normalizedRole;
        // Re-compute fingerprint with corrected name data
        if (row.firstName && row.firstSurname && row.identification) {
          updateFields.fingerprint = TourParticipant.buildFingerprint(
            row.firstName, row.firstSurname, row.identification,
          );
        }
        toUpdate.push({ id: existingId, fields: updateFields });
      } else {
        duplicatesSkipped++;
      }
      continue;
    }

    // New participant → insert
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

    for (const f of OPTIONAL_FIELDS) {
      const val = row[f];
      if (f === "hasVisa" || f === "hasExitPermit") {
        doc[f] = val === true ? true : false;
      } else if (val !== undefined && val !== null && val !== "") {
        doc[f] = val;
      }
    }

    const normalizedRole = normalizeRole(row.role);
    if (normalizedRole) doc.role = normalizedRole;

    toInsert.push(doc);
  }

  // Execute inserts
  let insertedIds = [];
  if (toInsert.length > 0) {
    const inserted = await TourParticipant.insertMany(toInsert, { ordered: false });
    insertedIds = inserted.map((p) => p._id);
  }

  // Execute updates (UPSERT mode)
  let updatedCount = 0;
  if (toUpdate.length > 0 && isUpsert) {
    const bulkOps = toUpdate.map(({ id, fields }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { ...fields, updatedAt: new Date() } },
      },
    }));
    const result = await TourParticipant.bulkWrite(bulkOps, { ordered: false });
    updatedCount = result.modifiedCount || 0;
  }

  await TourImportBatch.findByIdAndUpdate(batchId, {
    status: "CONFIRMED",
    importedCount: insertedIds.length,
    confirmedBy: adminId,
    confirmedAt: new Date(),
    ...(isUpsert ? { updatedCount } : {}),
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
    updatedCount,
    duplicates: duplicatesSkipped,
    errors: parseErrors,
    participants,
    mode,
  };
}

async function confirmTourParticipantImport(batchId, ctx) {
  throw new Error(
    "Para confirmar, usa la mutación confirmTourParticipantImport enviando el archivo original con fileBase64",
  );
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
