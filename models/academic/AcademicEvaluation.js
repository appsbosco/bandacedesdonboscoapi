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
    // Derivados de Cloudinary — generados via script de migración o al crear/actualizar
    // Si null → el cliente usa evidenceUrl como fallback (retrocompatibilidad total)
    evidenceThumbnailUrl: { type: String, default: null }, // 120×120 para listas
    evidencePreviewUrl: { type: String, default: null },   // 800w para modal

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

// ─── Índices ───────────────────────────────────────────────────────────────────
// Simple — para lookups directos por campo
AcademicEvaluationSchema.index({ student: 1 });
AcademicEvaluationSchema.index({ period: 1 });
AcademicEvaluationSchema.index({ status: 1 });

// Compuestos — cubren los patrones de query más frecuentes
// Cubre: getMyEvaluations, getStudentEvaluations con filtros de período/estado
AcademicEvaluationSchema.index({ student: 1, period: 1, status: 1 });
// Cubre: getAdminPendingEvaluations (pending + period, ordenado por submittedByStudentAt)
AcademicEvaluationSchema.index({ status: 1, period: 1, submittedByStudentAt: -1 });
// Cubre: calculateStudentPerformance (approved + student, ordenado por createdAt)
AcademicEvaluationSchema.index({ student: 1, status: 1, createdAt: 1 });
// Cubre: parent acknowledgement queries
AcademicEvaluationSchema.index({ student: 1, status: 1, parentAcknowledged: 1 });
// Cubre: conteos globales por student (dashboard bulk load)
AcademicEvaluationSchema.index({ status: 1, student: 1 });

module.exports = mongoose.model("AcademicEvaluation", AcademicEvaluationSchema);
