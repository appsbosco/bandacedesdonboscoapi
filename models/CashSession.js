/**
 * CashSession — Sesión de caja por día operativo.
 *
 * TIMEZONE DECISION:
 * businessDate se almacena como String "YYYY-MM-DD" (date-only, timezone-agnostic).
 */
const mongoose = require("mongoose");

const MethodTotalsSchema = new mongoose.Schema(
  {
    cash: { type: Number, default: 0 },
    sinpe: { type: Number, default: 0 },
    card: { type: Number, default: 0 },
    transfer: { type: Number, default: 0 }, // ← AGREGADO
    other: { type: Number, default: 0 },
  },
  { _id: false },
);

const CashSessionSchema = new mongoose.Schema(
  {
    businessDate: {
      type: String,
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

    // IMPORTANTE: solo contiene movimientos con cashSessionId === this._id.
    // Los movimientos externos (sin cashSessionId) NO afectan este subtotal.
    expectedTotalsByMethod: { type: MethodTotalsSchema, default: () => ({}) },

    countedCash: { type: Number },
    difference: { type: Number }, // countedCash - (expectedCash + openingCash)

    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

CashSessionSchema.index({ businessDate: 1 }, { unique: true });
CashSessionSchema.index({ status: 1 });

module.exports = mongoose.model("CashSession", CashSessionSchema);
