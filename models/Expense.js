/**
 * Expense — Egreso registrado en caja o externo.
 *
 * CAMBIOS v2:
 * - expenseType: clasifica el gasto más allá de `isAssetPurchase`
 * - inventoryItemId: vínculo si el gasto compra inventario
 * - inventoryQuantity, inventoryUnitCost: datos para el InventoryMovement creado
 * - isAssetPurchase se mantiene por compatibilidad pero se deriva de expenseType
 * - assetDescription: descripción del activo comprado
 *
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

    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    categorySnapshot: { type: String, trim: true },

    concept: { type: String, required: true, trim: true },
    detail: { type: String, trim: true },

    amount: { type: Number, required: true, min: 0.01 },

    paymentMethod: {
      type: String,
      enum: ["CASH", "SINPE", "CARD", "TRANSFER", "OTHER"],
      required: true,
    },

    // ── Tipo de gasto ─────────────────────────────────────────────────────
    expenseType: {
      type: String,
      enum: [
        "REGULAR", // Gasto operativo normal
        "INVENTORY_PURCHASE", // Compra de inventario (genera InventoryMovement)
        "ASSET_PURCHASE", // Compra de activo (instrumento, equipo)
        "TRANSFER_OUT", // Transferencia hacia banco (no es gasto real)
        "OTHER",
      ],
      default: "REGULAR",
    },

    // Legacy: se calcula de expenseType === "ASSET_PURCHASE"
    isAssetPurchase: { type: Boolean, default: false },
    assetDescription: { type: String, trim: true },
    purpose: { type: String, trim: true },

    // ── Inventario ────────────────────────────────────────────────────────
    // Solo para expenseType === "INVENTORY_PURCHASE"
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
    },
    inventoryQuantity: { type: Number, min: 0 },
    inventoryUnitCost: { type: Number, min: 0 },

    vendor: { type: String, trim: true },
    receiptUrl: { type: String, trim: true },

    status: {
      type: String,
      enum: ["ACTIVE", "VOIDED"],
      default: "ACTIVE",
    },
    voidReason: { type: String, trim: true },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    scope: {
      type: String,
      enum: ["SESSION", "EXTERNAL"],
      // required: true,
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
ExpenseSchema.index({ expenseType: 1, businessDate: 1 });
ExpenseSchema.index({ inventoryItemId: 1 }, { sparse: true });

module.exports = mongoose.model("Expense", ExpenseSchema);
