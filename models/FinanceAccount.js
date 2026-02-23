/**
 * FinanceAccount — Cuenta financiera de la organización.
 *
 * Representa cualquier "bolsa de dinero" rastreable:
 *   - BANK: cuenta bancaria real
 *   - CASH_BOX: referencia a una CashBox (se usa para transferencias caja↔banco)
 *   - EXTERNAL: fondos externos (donantes, patrocinadores, etc.)
 *   - OTHER: cualquier otro fondo
 *
 * Para cajas físicas lo principal sigue siendo CashSession, pero FinanceAccount
 * permite registrar transferencias formales hacia/desde banco con trazabilidad.
 *
 * SALDO: se calcula a partir de movimientos (no se guarda como campo mutable),
 * excepto `openingBalance` que es el saldo de arranque.
 */
const mongoose = require("mongoose");

const FinanceAccountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // "Banco BCR - Cuenta corriente"
    code: { type: String, trim: true, uppercase: true }, // "BCR-CC"
    type: {
      type: String,
      enum: ["BANK", "CASH_BOX", "EXTERNAL", "OTHER"],
      required: true,
    },
    // Para tipo CASH_BOX: referencia a la CashBox que representa
    cashBoxId: { type: mongoose.Schema.Types.ObjectId, ref: "CashBox" },
    // Información bancaria (solo para type=BANK)
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true }, // últimos 4 dígitos o referencia
    currency: { type: String, default: "CRC", trim: true }, // CRC, USD, etc.
    // Saldo inicial (de arranque del sistema, no cambia)
    openingBalance: { type: Number, default: 0 },
    openingBalanceDate: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

FinanceAccountSchema.index({ type: 1, isActive: 1 });
FinanceAccountSchema.index({ cashBoxId: 1 }, { sparse: true });
FinanceAccountSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("FinanceAccount", FinanceAccountSchema);
