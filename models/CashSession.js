/**
 * CashSession — Sesión de caja por día operativo.
 *
 * TIMEZONE DECISION:
 * businessDate se almacena como String "YYYY-MM-DD" (date-only, timezone-agnostic).
 * Razón: evitar ambigüedades UTC vs America/Costa_Rica al comparar días. El cliente
 * siempre envía la fecha del día real de operación ("2025-03-15"), no un timestamp.
 * createdAt/updatedAt usan Date UTC estándar para auditoría.
 */
const mongoose = require("mongoose");

const MethodTotalsSchema = new mongoose.Schema(
  {
    cash: { type: Number, default: 0 },
    sinpe: { type: Number, default: 0 },
    card: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
  },
  { _id: false },
);

const CashSessionSchema = new mongoose.Schema(
  {
    businessDate: {
      type: String, // "YYYY-MM-DD"
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    openingCash: { type: Number, default: 0 },

    // Totales esperados al cierre (calculados de Sales/Expenses)
    expectedTotalsByMethod: { type: MethodTotalsSchema, default: () => ({}) },

    // Cierre real
    countedCash: { type: Number }, // efectivo contado físicamente
    difference: { type: Number }, // countedCash - expected.cash

    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Un solo día abierto a la vez (unique en businessDate)
CashSessionSchema.index({ businessDate: 1 }, { unique: true });
CashSessionSchema.index({ status: 1 });

module.exports = mongoose.model("CashSession", CashSessionSchema);
