/**
 * models/TourPayment.js
 *
 * Registro de un pago real realizado por un participante.
 * Es el comprobante del dinero recibido. No define cuánto se debe:
 * eso lo hace ParticipantFinancialAccount + ParticipantInstallment.
 *
 * Al registrar un pago, el servicio distribuye el monto
 * automáticamente entre las cuotas pendientes (FIFO por order/dueDate).
 */
"use strict";

const mongoose = require("mongoose");
const {
  Schema,
  Types: { ObjectId },
} = mongoose;

const TourPaymentSchema = new Schema(
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

    // ── Datos del pago ────────────────────────────────────────────────────────
    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: Date, required: true, default: Date.now },

    method: {
      type: String,
      enum: ["CASH", "TRANSFER", "CARD", "CHECK", "OTHER"],
      default: "CASH",
    },
    reference: { type: String, trim: true }, // número de transferencia, cheque, etc.
    notes: { type: String, trim: true },

    // ── Distribución automática aplicada ─────────────────────────────────────
    // Detalle de cómo se distribuyó este pago entre cuotas
    appliedTo: [
      {
        installment: { type: ObjectId, ref: "ParticipantInstallment" },
        amountApplied: { type: Number, min: 0 },
        _id: false,
      },
    ],

    // Monto del pago que excedió todas las cuotas (pago adelantado / excedente)
    unappliedAmount: { type: Number, default: 0, min: 0 },

    // ── Auditoría ─────────────────────────────────────────────────────────────
    registeredBy: { type: ObjectId, ref: "User" },

    // Enlace opcional a User si participant.linkedUser existe
    linkedUser: { type: ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

TourPaymentSchema.index({ tour: 1, participant: 1 });
TourPaymentSchema.index({ tour: 1, paymentDate: -1 });
TourPaymentSchema.index({ participant: 1, paymentDate: -1 });

module.exports = mongoose.model("TourPayment", TourPaymentSchema);
