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
    subjectType: {
      type: String,
      enum: ["EXAM_BASED", "SEMESTER_FINAL_ONLY"],
      default: "EXAM_BASED",
      required: true,
    },
    bands: [{ type: String, trim: true }],
    grades: [{ type: String, trim: true }],
    scienceGroup: {
      type: String,
      enum: ["GENERAL_SCIENCE", "BIOLOGY", "CHEMISTRY", "PHYSICS", null],
      default: null,
    },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AcademicSubjectSchema.index({ isActive: 1 });
AcademicSubjectSchema.index({ subjectType: 1, isActive: 1 });
AcademicSubjectSchema.index({ grades: 1 });
AcademicSubjectSchema.index({ order: 1, name: 1 });

module.exports = mongoose.model("AcademicSubject", AcademicSubjectSchema);
