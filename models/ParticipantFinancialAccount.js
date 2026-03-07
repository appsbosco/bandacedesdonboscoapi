/**
 * models/ParticipantFinancialAccount.js
 *
 * Cuenta financiera individual de un participante dentro de una gira.
 * Centraliza el estado financiero: deuda, pagado, saldo, estado.
 *
 * Es el "estado de cuenta" del participante: no almacena pagos individuales,
 * sino los totales calculados y derivados. Se recalcula al registrar pagos.
 */
"use strict";

const mongoose = require("mongoose");
const {
  Schema,
  Types: { ObjectId },
} = mongoose;

/**
 * Estados financieros posibles:
 *  UP_TO_DATE  → ha pagado todo lo que debería según cronograma a la fecha
 *  LATE        → adeuda cuotas vencidas
 *  PARTIAL     → hay cuotas vencidas con pago parcial
 *  PAID        → balance = 0 (monto total cubierto)
 *  OVERPAID    → pagó más de lo asignado
 *  PENDING     → no ha realizado ningún pago
 */

const AdjustmentSchema = new Schema(
  {
    concept: { type: String, required: true, trim: true },
    amount: { type: Number, required: true }, // positivo = cargo extra, negativo = descuento
    appliedBy: { type: ObjectId, ref: "User" },
    appliedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  { _id: true },
);

const ParticipantFinancialAccountSchema = new Schema(
  {
    tour: {
      type: ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    participant: {
      type: ObjectId,
      ref: "TourParticipant",
      required: true,
      index: true,
    },
    paymentPlan: {
      type: ObjectId,
      ref: "TourPaymentPlan",
      default: null,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "USD",
    },

    // ── Composición del monto final ───────────────────────────────────────────
    baseAmount: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 }, // descuento fijo
    scholarship: { type: Number, min: 0, default: 0 }, // beca (descuento especial)
    adjustments: { type: [AdjustmentSchema], default: [] }, // ajustes variables

    // finalAmount = baseAmount - discount - scholarship + sum(adjustments)
    finalAmount: { type: Number, required: true, min: 0, default: 0 },

    // ── Totales calculados (se actualizan con cada pago) ──────────────────────
    totalPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 }, // finalAmount - totalPaid (puede ser negativo)
    overpayment: { type: Number, default: 0, min: 0 }, // abs(balance) cuando balance < 0

    // ── Estado financiero ─────────────────────────────────────────────────────
    financialStatus: {
      type: String,
      enum: ["PENDING", "UP_TO_DATE", "LATE", "PARTIAL", "PAID", "OVERPAID"],
      default: "PENDING",
      index: true,
    },

    // ── Metadatos ─────────────────────────────────────────────────────────────
    createdBy: { type: ObjectId, ref: "User" },
    updatedBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Un participante tiene exactamente una cuenta por gira
ParticipantFinancialAccountSchema.index(
  { tour: 1, participant: 1 },
  { unique: true },
);
ParticipantFinancialAccountSchema.index({ tour: 1, financialStatus: 1 });

/**
 * Recalcula finalAmount a partir de los componentes.
 * Llamar antes de save cuando cambien baseAmount, discount, scholarship o adjustments.
 */
ParticipantFinancialAccountSchema.methods.recalculateFinalAmount = function () {
  const adjustmentsTotal = (this.adjustments || []).reduce(
    (sum, a) => sum + a.amount,
    0,
  );
  this.finalAmount = Math.max(
    0,
    this.baseAmount - this.discount - this.scholarship + adjustmentsTotal,
  );
};

/**
 * Recalcula balance y overpayment a partir de finalAmount y totalPaid.
 */
ParticipantFinancialAccountSchema.methods.recalculateBalance = function () {
  this.balance = this.finalAmount - this.totalPaid;
  this.overpayment = this.balance < 0 ? Math.abs(this.balance) : 0;
};

module.exports = mongoose.model(
  "ParticipantFinancialAccount",
  ParticipantFinancialAccountSchema,
);
