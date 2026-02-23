/**
 * InventoryMovement — Todos los movimientos de inventario.
 *
 * Tipos:
 *   PURCHASE         - Compra (sale dinero, entra stock). Vinculado a Expense.
 *   DONATION_IN_KIND - Donación en especie (entra stock sin salida de dinero).
 *   CONSUMPTION      - Consumo por actividad (sale stock, se reconoce costo imputado).
 *   ADJUSTMENT_IN    - Ajuste positivo (conteo, corrección).
 *   ADJUSTMENT_OUT   - Ajuste negativo (conteo, corrección).
 *   SHRINKAGE        - Merma / pérdida / vencimiento.
 *   SALE_OUT         - Salida por venta directa del ítem (si aplica).
 *
 * Regla de stock:
 *   PURCHASE, DONATION_IN_KIND, ADJUSTMENT_IN → qty positivo (entra)
 *   CONSUMPTION, ADJUSTMENT_OUT, SHRINKAGE, SALE_OUT → qty negativo (sale)
 *
 * Costeo WAC (costo promedio ponderado):
 *   Al registrar CONSUMPTION, el service calcula el costo promedio de compras activas
 *   y lo guarda en `unitCostSnapshot`. Esto fija el costo de esa salida en el tiempo.
 *   `totalCostSnapshot` = unitCostSnapshot * qty (valor absoluto).
 */
const mongoose = require("mongoose");

const InventoryMovementSchema = new mongoose.Schema(
  {
    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "PURCHASE",
        "DONATION_IN_KIND",
        "CONSUMPTION",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
        "SHRINKAGE",
        "SALE_OUT",
      ],
      required: true,
    },
    // Cantidad siempre positiva; el tipo determina la dirección
    quantity: { type: Number, required: true, min: 0.001 },

    // Costo unitario:
    //   - En PURCHASE/DONATION_IN_KIND: precio unitario de la compra/valoración
    //   - En CONSUMPTION/SHRINKAGE/SALE_OUT: costo promedio WAC calculado al momento
    unitCostSnapshot: { type: Number, default: 0 },
    totalCostSnapshot: { type: Number, default: 0 }, // unitCostSnapshot * quantity

    // Valor estimado (para donaciones en especie donde no hay factura)
    estimatedValue: { type: Number },

    concept: { type: String, trim: true },
    detail: { type: String, trim: true },

    // Vínculos
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity" }, // Para CONSUMPTION
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: "Expense" }, // Para PURCHASE
    cashSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "CashSession" },

    // Proveedor (para compras)
    vendor: { type: String, trim: true },

    status: {
      type: String,
      enum: ["ACTIVE", "VOIDED"],
      default: "ACTIVE",
    },
    voidReason: { type: String, trim: true },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

InventoryMovementSchema.index({ itemId: 1, businessDate: 1 });
InventoryMovementSchema.index({ itemId: 1, type: 1, status: 1 });
InventoryMovementSchema.index({ activityId: 1, businessDate: 1 });
InventoryMovementSchema.index({ expenseId: 1 }, { sparse: true });
InventoryMovementSchema.index({ businessDate: 1, type: 1 });
InventoryMovementSchema.index({ status: 1 });

module.exports = mongoose.model("InventoryMovement", InventoryMovementSchema);
