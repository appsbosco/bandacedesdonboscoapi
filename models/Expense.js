/**
 * Expense — Egreso registrado en caja.
 * businessDate: String "YYYY-MM-DD"
 */
const mongoose = require("mongoose");

const ExpenseSchema = new mongoose.Schema(
  {
    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    cashSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "CashSession" },
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity" },

    // Categoría con snapshot para no perder nombre si se edita
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    categorySnapshot: { type: String, trim: true },

    concept: { type: String, required: true, trim: true }, // ej: "Compra papel"
    detail: { type: String, trim: true }, // detalle libre opcional

    amount: { type: Number, required: true, min: 0.01 },

    paymentMethod: {
      type: String,
      enum: ["CASH", "SINPE", "CARD", "TRANSFER", "OTHER"],
      required: true,
    },

    vendor: { type: String, trim: true },
    receiptUrl: { type: String, trim: true },

    // Para instrumentos/equipo
    isAssetPurchase: { type: Boolean, default: false },
    purpose: { type: String, trim: true },

    status: {
      type: String,
      enum: ["ACTIVE", "VOIDED"],
      default: "ACTIVE",
    },

    // Audit
    voidReason: { type: String, trim: true },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    scope: {
      type: String,
      enum: ["SESSION", "EXTERNAL"],
      required: true,
      default: "SESSION",
    },
  },
  { timestamps: true },
);

ExpenseSchema.index({ businessDate: 1 });
ExpenseSchema.index({ businessDate: 1, status: 1 });
ExpenseSchema.index({ categoryId: 1, businessDate: 1 });
ExpenseSchema.index({ paymentMethod: 1, businessDate: 1 });
ExpenseSchema.index({ status: 1 });
ExpenseSchema.index({ activityId: 1, businessDate: 1 });
ExpenseSchema.index({ isAssetPurchase: 1, businessDate: 1 });
ExpenseSchema.index({ cashSessionId: 1 });
ExpenseSchema.index({ scope: 1, businessDate: 1 });

module.exports = mongoose.model("Expense", ExpenseSchema);
