/**
 * Committee — Catálogo de comités del STAFF.
 *
 * Los comités son entidades fijas (Operativa, Ventas, Becas, Giras, Visuales, Pastoral)
 * pero su porcentaje de distribución es configurable en cualquier momento,
 * siempre que la suma de todos los comités activos sea 100%.
 *
 * Diseño deliberado:
 * - El porcentaje vive en el Committee mismo (no en una tabla separada de configuración)
 *   para simplificar consultas y mantener la historia con el ledger.
 * - Un snapshot del porcentaje se guarda en CommitteeLedgerEntry al momento de
 *   crear cada movimiento, para que los reportes históricos sean correctos aunque
 *   el porcentaje cambie después.
 */
const mongoose = require("mongoose");

const CommitteeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    // Slug legible para uso interno y semillas (ej: "operativa", "ventas")
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    // Porcentaje de distribución (0-100). La suma de todos los comités activos debe = 100.
    distributionPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // Orden de presentación en UI
    displayOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

CommitteeSchema.index({ isActive: 1, displayOrder: 1 });
CommitteeSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Committee", CommitteeSchema);
