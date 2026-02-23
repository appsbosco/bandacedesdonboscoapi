/**
 * InventoryItem — Catálogo de productos/insumos que pueden tener stock.
 *
 * Puede ser un producto existente (ref a Product) o un ítem propio de inventario
 * (insumos, materiales, consumibles, etc.).
 *
 * El stock se calcula a partir de InventoryMovement (no se guarda directamente
 * para evitar inconsistencias). Solo se mantiene `currentStockSnapshot` como
 * caché de referencia (se recalcula en reportes).
 *
 * Estrategia de costeo: COSTO PROMEDIO PONDERADO (WAC)
 * Se calcula al momento de consumo como:
 *   avgCost = (suma de costos de compra activos) / (suma de unidades compradas activas)
 * Se registra en InventoryMovement.unitCostSnapshot al momento del consumo.
 */
const mongoose = require("mongoose");

const InventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true },
    unit: { type: String, trim: true, default: "unidad" }, // "unidad", "litro", "kg", "botella"
    // Referencia opcional a Product (si este ítem también se vende)
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      sparse: true,
    },
    isActive: { type: Boolean, default: true },
    // Alertas de stock
    minStockAlert: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

InventoryItemSchema.index({ isActive: 1 });
InventoryItemSchema.index({ code: 1 }, { unique: true, sparse: true });
InventoryItemSchema.index({ productId: 1 }, { sparse: true });

module.exports = mongoose.model("InventoryItem", InventoryItemSchema);
