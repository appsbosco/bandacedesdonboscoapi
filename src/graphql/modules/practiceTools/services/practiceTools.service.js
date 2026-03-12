import PracticeSequence from "../../../../models/PracticeTools/PracticeSequence.js";
import PracticePreset from "../../../../models/PracticeTools/PracticePreset.js";
import MetronomeQuickSettings from "../../../../models/PracticeTools/MetronomeQuickSettings.js";

// ── Secuencias ──────────────────────────────────────────────

export async function getMisSecuencias(userId) {
  return PracticeSequence.find({ user: userId })
    .sort({ lastUsedAt: -1 })
    .lean();
}

export async function getSecuencia(id, userId) {
  const seq = await PracticeSequence.findOne({ _id: id, user: userId }).lean();
  if (!seq) throw new Error("Secuencia no encontrada");
  return seq;
}

export async function getUltimaSecuencia(userId) {
  return PracticeSequence.findOne({ user: userId, ultimaAbierta: true }).lean();
}

export async function crearSecuencia(userId, input) {
  const seq = new PracticeSequence({ user: userId, ...input });
  await seq.save();
  return seq.toObject();
}

export async function actualizarSecuencia(id, userId, input) {
  const seq = await PracticeSequence.findOneAndUpdate(
    { _id: id, user: userId },
    { ...input, lastUsedAt: new Date() },
    { new: true, runValidators: true },
  ).lean();
  if (!seq) throw new Error("Secuencia no encontrada o sin permiso");
  return seq;
}

export async function eliminarSecuencia(id, userId) {
  const result = await PracticeSequence.deleteOne({ _id: id, user: userId });
  return result.deletedCount > 0;
}

export async function marcarUltimaSecuencia(id, userId) {
  // Desmarcar todas
  await PracticeSequence.updateMany({ user: userId }, { ultimaAbierta: false });
  // Marcar la seleccionada
  const seq = await PracticeSequence.findOneAndUpdate(
    { _id: id, user: userId },
    { ultimaAbierta: true, lastUsedAt: new Date() },
    { new: true },
  ).lean();
  if (!seq) throw new Error("Secuencia no encontrada");
  return seq;
}

// ── Quick Settings ──────────────────────────────────────────

export async function getQuickSettings(userId) {
  return MetronomeQuickSettings.findOne({ user: userId }).lean();
}

export async function guardarQuickSettings(userId, input) {
  const settings = await MetronomeQuickSettings.findOneAndUpdate(
    { user: userId },
    { ...input },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return settings;
}

// ── Presets ─────────────────────────────────────────────────

export async function getMisPresets(userId) {
  return PracticePreset.find({ user: userId })
    .sort({ esFavorito: -1, lastUsedAt: -1 })
    .lean();
}

export async function getPresetsPublicos(limite = 20, offset = 0) {
  return PracticePreset.find({ esPublico: true })
    .sort({ vecesUsado: -1, createdAt: -1 })
    .skip(offset)
    .limit(limite)
    .lean();
}

export async function getPreset(id, userId) {
  const preset = await PracticePreset.findById(id).lean();
  if (!preset) throw new Error("Preset no encontrado");
  if (!preset.esPublico && String(preset.user) !== String(userId)) {
    throw new Error("Sin acceso a este preset");
  }
  return preset;
}

export async function crearPreset(userId, input) {
  const preset = new PracticePreset({ user: userId, ...input });
  await preset.save();
  return preset.toObject();
}

export async function actualizarPreset(id, userId, input) {
  const preset = await PracticePreset.findOneAndUpdate(
    { _id: id, user: userId },
    input,
    { new: true, runValidators: true },
  ).lean();
  if (!preset) throw new Error("Preset no encontrado o sin permiso");
  return preset;
}

export async function eliminarPreset(id, userId) {
  const result = await PracticePreset.deleteOne({ _id: id, user: userId });
  return result.deletedCount > 0;
}

export async function usarPreset(id, userId) {
  // Puede usarse un preset público sin ser dueño
  const preset = await PracticePreset.findById(id).lean();
  if (!preset) throw new Error("Preset no encontrado");
  if (!preset.esPublico && String(preset.user) !== String(userId)) {
    throw new Error("Sin acceso a este preset");
  }
  await PracticePreset.findByIdAndUpdate(id, {
    $inc: { vecesUsado: 1 },
    lastUsedAt: new Date(),
  });
  return { ...preset, vecesUsado: preset.vecesUsado + 1 };
}
