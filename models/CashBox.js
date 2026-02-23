/**
 * CashBox — Catálogo de cajas físicas (Kiosco, Entradas, Comidas, etc.)
 *
 * Cada CashBox puede tener una sesión abierta por businessDate.
 * El único index unique ahora es { cashBoxId, businessDate } en CashSession.
 */
const mongoose = require("mongoose");

const CashBoxSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // "Kiosco", "Entradas"
    code: { type: String, trim: true, uppercase: true }, // "KSK", "ENT"
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false }, // Caja principal del negocio
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

CashBoxSchema.index({ isActive: 1 });
CashBoxSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("CashBox", CashBoxSchema);
