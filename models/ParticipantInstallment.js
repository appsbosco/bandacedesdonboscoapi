/**
 * models/ParticipantInstallment.js
 *
 * Cuota individual de un participante dentro de una gira.
 * Generada a partir del TourPaymentPlan, pero es independiente:
 * puede tener monto o fecha distintos al plan general (becas, ajustes).
 *
 * Es la unidad mínima del cronograma de pagos por persona.
 */
"use strict";

const mongoose = require("mongoose");
const {
  Schema,
  Types: { ObjectId },
} = mongoose;

const ParticipantInstallmentSchema = new Schema(
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
    // Referencia al plan que originó esta cuota (opcional, por trazabilidad)
    paymentPlan: {
      type: ObjectId,
      ref: "TourPaymentPlan",
      default: null,
    },

    // ── Definición de la cuota ────────────────────────────────────────────────
    order: { type: Number, required: true },
    dueDate: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    concept: { type: String, required: true, trim: true },

    // ── Estado de la cuota ────────────────────────────────────────────────────
    paidAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["PENDING", "PARTIAL", "PAID", "LATE", "WAIVED"],
      default: "PENDING",
      index: true,
    },

    // Fecha en que quedó completamente pagada
    paidAt: { type: Date, default: null },

    // ── Metadatos ─────────────────────────────────────────────────────────────
    createdBy: { type: ObjectId, ref: "User" },
    updatedBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true },
);

ParticipantInstallmentSchema.index({ tour: 1, participant: 1, order: 1 });
ParticipantInstallmentSchema.index({ tour: 1, participant: 1, status: 1 });
ParticipantInstallmentSchema.index({ tour: 1, dueDate: 1, status: 1 });

/**
 * Sincroniza remainingAmount con paidAmount y amount.
 * Actualiza status automáticamente.
 */
ParticipantInstallmentSchema.methods.syncStatus = function (now = new Date()) {
  this.remainingAmount = Math.max(0, this.amount - this.paidAmount);

  if (this.status === "WAIVED") return; // no tocar cuotas condonadas

  if (this.paidAmount >= this.amount) {
    this.status = "PAID";
    this.paidAt = this.paidAt || now;
  } else if (this.paidAmount > 0) {
    this.status = this.dueDate < now ? "LATE" : "PARTIAL";
    this.paidAt = null;
  } else {
    this.status = this.dueDate < now ? "LATE" : "PENDING";
    this.paidAt = null;
  }
};

module.exports = mongoose.model(
  "ParticipantInstallment",
  ParticipantInstallmentSchema,
);
