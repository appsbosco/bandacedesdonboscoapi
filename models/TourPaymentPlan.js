/**
 * models/TourPaymentPlan.js
 *
 * Cronograma general de pagos de una gira.
 * Define las cuotas que se usarán como plantilla para todos los participantes.
 * Puede existir más de un plan por gira (ej: músicos vs directivos).
 */
"use strict";

const mongoose = require("mongoose");
const {
  Schema,
  Types: { ObjectId },
} = mongoose;

const InstallmentTemplateSchema = new Schema(
  {
    order: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    concept: { type: String, required: true, trim: true },
  },
  { _id: true },
);

const TourPaymentPlanSchema = new Schema(
  {
    tour: {
      type: ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      default: "Plan general",
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "USD",
    },
    // Total base del plan (suma de cuotas)
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    installments: {
      type: [InstallmentTemplateSchema],
      default: [],
    },
    isDefault: {
      type: Boolean,
      default: true,
    },
    createdBy: { type: ObjectId, ref: "User" },
    updatedBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Recalcular totalAmount automáticamente antes de guardar
TourPaymentPlanSchema.pre("save", function (next) {
  if (this.installments && this.installments.length > 0) {
    this.totalAmount = this.installments.reduce((sum, i) => sum + i.amount, 0);
  }
  next();
});

TourPaymentPlanSchema.index({ tour: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("TourPaymentPlan", TourPaymentPlanSchema);
