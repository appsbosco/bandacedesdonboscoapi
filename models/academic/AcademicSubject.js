const mongoose = require("mongoose");

/**
 * AcademicSubject — Materia académica
 * grades: lista de niveles a los que aplica esta materia (p.e. "7mo", "8vo")
 * bands: grupos de banda a los que aplica (opcional, para filtrar por contexto)
 */
const AcademicSubjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    bands: [{ type: String, trim: true }],
    grades: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

AcademicSubjectSchema.index({ isActive: 1 });
AcademicSubjectSchema.index({ grades: 1 });

module.exports = mongoose.model("AcademicSubject", AcademicSubjectSchema);
