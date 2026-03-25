const mongoose = require("mongoose");

/**
 * AcademicEvaluation — Evaluación académica de un estudiante
 *
 * Flujo de estado:
 *   pending  → aprobado/rechazado por admin
 *   rejected → el estudiante puede re-subir (actualizar) → vuelve a pending
 *
 * scoreNormalized100 se calcula SIEMPRE en backend.
 * La evidencia (imagen/PDF) se sube a Cloudinary desde el cliente y
 * se almacena la URL + publicId aquí.
 */
const AcademicEvaluationSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicSubject",
      required: true,
    },
    period: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicPeriod",
      required: true,
    },

    // Nota cruda (en la escala del examen)
    scoreRaw: { type: Number, required: true },
    scaleMin: { type: Number, default: 0 },
    scaleMax: { type: Number, default: 100 },
    // Calculado en backend: ((scoreRaw - scaleMin) / (scaleMax - scaleMin)) * 100
    scoreNormalized100: { type: Number, required: true },

    // Evidencia en Cloudinary
    evidenceUrl: { type: String, required: true },
    evidencePublicId: { type: String, required: true },
    evidenceResourceType: { type: String, default: "image" },
    evidenceOriginalName: { type: String },

    // Estado del ciclo de revisión
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    submittedByStudentAt: { type: Date },

    // Revisión por admin
    reviewedByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: { type: Date },
    reviewComment: { type: String },

    // Acuse del padre/madre
    parentAcknowledged: { type: Boolean, default: false },
    parentAcknowledgedAt: { type: Date },
    parentAcknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
    },
    parentComment: { type: String },
  },
  { timestamps: true }
);

AcademicEvaluationSchema.index({ student: 1 });
AcademicEvaluationSchema.index({ subject: 1 });
AcademicEvaluationSchema.index({ period: 1 });
AcademicEvaluationSchema.index({ student: 1, subject: 1, period: 1 });
AcademicEvaluationSchema.index({ status: 1 });
AcademicEvaluationSchema.index({ student: 1, status: 1 });

module.exports = mongoose.model("AcademicEvaluation", AcademicEvaluationSchema);
