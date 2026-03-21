const Formation = require("../../models/Formation");

const FORMATION_EDITOR_ROLES = new Set([
  "Admin",
  "Director",
  "Subdirector",
  "Principal de sección",
  "Asistente de sección",
]);

async function persistFormationSlotsHandler(req, res) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "No autenticado" });
  }

  if (!FORMATION_EDITOR_ROLES.has(user.role)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const { id } = req.params;
  const { slots } = req.body;

  if (!slots || !Array.isArray(slots)) {
    return res.status(400).json({ error: "slots debe ser un array" });
  }

  // Validación mínima de cada slot para no guardar basura en Mongo
  const validSlots = slots.filter(
    (s) =>
      s &&
      typeof s.zone === "string" &&
      typeof s.row === "number" &&
      typeof s.col === "number",
  );

  try {
    const result = await Formation.findByIdAndUpdate(
      id,
      { $set: { slots: validSlots } },
      { new: false, runValidators: false, timestamps: false },
    );

    if (!result) {
      return res.status(404).json({ error: "Formación no encontrada" });
    }

    return res.json({ ok: true, persisted: validSlots.length });
  } catch (e) {
    console.error("[persist-slots] error:", e.message, e.stack);
    return res
      .status(500)
      .json({ error: "No se pudo persistir", detail: e.message });
  }
}

module.exports = { persistFormationSlotsHandler };
