/**
 * BankEntry — Movimiento individual en una cuenta bancaria (FinanceAccount type=BANK).
 *
 * Estrategia: el saldo bancario se calcula sumando openingBalance + todos los BankEntry.
 * No hay campo de saldo que requiera actualización concurrente.
 *
 * Tipos de movimiento:
 *   DEPOSIT          - Depósito de efectivo al banco (puede venir de caja)
 *   WITHDRAWAL       - Retiro de banco (puede ir a caja)
 *   INCOMING_TRANSFER- Transferencia recibida (SINPE, wire, etc.)
 *   OUTGOING_TRANSFER- Transferencia enviada (pago a proveedor, etc.)
 *   PAYMENT          - Pago de gasto desde banco (vinculable a Expense)
 *   INCOME           - Ingreso directo en banco (vinculable a Sale)
 *   COMMISSION       - Comisión bancaria
 *   ADJUSTMENT       - Ajuste manual
 *
 * Para transferencias caja↔banco se crea un BankEntry + Expense/Sale con
 * referencia cruzada (transferPairId) para evitar doble conteo en reportes.
 */
const mongoose = require("mongoose");

const BankEntrySchema = new mongoose.Schema(
  {
    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinanceAccount",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "DEPOSIT",
        "WITHDRAWAL",
        "INCOMING_TRANSFER",
        "OUTGOING_TRANSFER",
        "PAYMENT",
        "INCOME",
        "COMMISSION",
        "ADJUSTMENT",
      ],
      required: true,
    },
    // CREDIT = entra dinero al banco (positivo), DEBIT = sale dinero del banco (negativo)
    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    concept: { type: String, required: true, trim: true },
    detail: { type: String, trim: true },
    reference: { type: String, trim: true }, // Referencia bancaria o número de transacción

    // Vínculos opcionales con otros documentos
    expenseId: { type: mongoose.Schema.Types.ObjectId, ref: "Expense" },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity" },

    // Para transferencias caja↔banco: par de movimiento contrario
    transferPairId: { type: mongoose.Schema.Types.ObjectId }, // ID del Expense/Sale contraparte
    transferPairCollection: {
      type: String,
      enum: ["Sale", "Expense", "BankEntry", null],
    },

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

BankEntrySchema.index({ businessDate: 1, accountId: 1 });
BankEntrySchema.index({ accountId: 1, businessDate: 1, status: 1 });
BankEntrySchema.index({ type: 1, businessDate: 1 });
BankEntrySchema.index({ activityId: 1, businessDate: 1 });
BankEntrySchema.index({ status: 1 });

module.exports = mongoose.model("BankEntry", BankEntrySchema);
