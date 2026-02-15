/**
 * medicalRecords - Service
 * Lógica de negocio + DB (Mongoose)
 * CommonJS
 *
 * NOTA IMPORTANTE:
 * En tu snippet hay 2 paths distintos para MedicalRecord:
 *  - ../../../../models/MedicalRecord   (mutations)
 *  - ../../../../database/models/MedicalRecord (queries)
 * Para no “inventar”, dejo un require con fallback.
 */

const MedicalRecord = require("../../../../../models/MedicalRecord");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

function getUserIdFromCtx(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return (u && (u.id || u._id || u.userId)) || null;
}

function requireUserId(ctx) {
  requireAuth(ctx);
  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("User not authenticated");
  return String(userId);
}

async function createMedicalRecord(input, ctx) {
  const userId = requireUserId(ctx);

  if (!input) throw new Error("Datos de ficha médica requeridos");

  // No confiar en input.user
  const created = await MedicalRecord.create({
    ...input,
    user: userId,
  });

  return created;
}

async function updateMedicalRecord(id, input, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de ficha médica requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const exists = await MedicalRecord.findById(id);
  if (!exists) throw new Error("Ficha médica no existe");

  // Evitar cambiar el user por input
  const { user, ...safeInput } = input || {};

  const updated = await MedicalRecord.findByIdAndUpdate(id, safeInput, {
    new: true,
    runValidators: true,
  });

  if (!updated) throw new Error("Ficha médica no existe");
  return updated;
}

async function deleteMedicalRecord(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de ficha médica requerido");

  const deleted = await MedicalRecord.findByIdAndDelete(id);
  if (!deleted) throw new Error("Ficha médica no existe");

  return "Ficha médica eliminada correctamente";
}

async function getMedicalRecord(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de ficha médica requerido");

  const medicalRecord = await MedicalRecord.findById(id);
  if (!medicalRecord) throw new Error("Ficha médica no existe");

  return medicalRecord;
}

async function getMedicalRecords(ctx) {
  requireAuth(ctx);

  const medicalRecords = await MedicalRecord.find({}).populate("user");
  return medicalRecords;
}

async function getMedicalRecordByUser(ctx) {
  const userId = requireUserId(ctx);

  const medicalRecord = await MedicalRecord.find({ user: userId });
  return medicalRecord;
}

module.exports = {
  requireAuth,
  createMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
  getMedicalRecord,
  getMedicalRecords,
  getMedicalRecordByUser,
};
