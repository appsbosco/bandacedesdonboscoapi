/**
 * CashSession — Sesión de caja por día operativo.
 *
 * CAMBIOS v2:
 * - Agregado cashBoxId: cada sesión pertenece a una CashBox específica.
 * - Roto unique index { businessDate } → nuevo unique { cashBoxId, businessDate }.
 * - Legacy: si cashBoxId es null, se asume la caja "default" (migración).
 * - Agregado cashBoxSnapshot: nombre de la caja al momento de apertura.
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
    transfer: { type: Number, default: 0 },
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
    // ── Multi-caja ────────────────────────────────────────────────────────
    // Si null: sesión legacy sin caja asignada (migración backfill a caja default).
    cashBoxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CashBox",
      default: null,
    },
    cashBoxSnapshot: { type: String, trim: true }, // Nombre de la caja al abrir

    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    openingCash: { type: Number, default: 0 },

    // Solo contiene movimientos con cashSessionId === this._id.
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

// CAMBIO CRÍTICO: ya no es unique por businessDate solo.
// Ahora una caja puede tener 1 sesión por día, pero pueden coexistir múltiples
// sesiones el mismo día (de distintas cajas).
CashSessionSchema.index(
  { cashBoxId: 1, businessDate: 1 },
  { unique: true, sparse: true },
);

// Índice de compatibilidad para consultas legacy por businessDate
CashSessionSchema.index({ businessDate: 1 });
CashSessionSchema.index({ status: 1 });

module.exports = mongoose.model("CashSession", CashSessionSchema);
