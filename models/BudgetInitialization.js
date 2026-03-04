/**
 * BudgetInitialization — Registro único del saldo inicial general del sistema de presupuestos.
 *
 * REGLA DE NEGOCIO CRÍTICA:
 * Solo puede existir UN documento con status="ACTIVE" en toda la colección.
 * Cualquier intento de crear un segundo saldo inicial activo debe ser rechazado
 * a nivel de servicio (no solo de índice, para dar mensajes de error claros).
 *
 * El índice unique en { status: 1 } con partial filter { status: "ACTIVE" }
 * garantiza la unicidad a nivel de base de datos como segunda línea de defensa.
 *
 * Flujo:
 * 1. Se crea este documento con el monto total y la fecha.
 * 2. El servicio calcula automáticamente la distribución por comité según sus
 *    distributionPercentage actuales y crea un CommitteeLedgerEntry de tipo
 *    INITIAL_ALLOCATION por cada comité activo.
 * 3. El documento queda como referencia de auditoría: cuándo se inicializó,
 *    quién lo hizo, con qué monto y con qué configuración de porcentajes.
 */
const mongoose = require("mongoose");

// Snapshot de la distribución calculada en el momento de la inicialización
const DistributionSnapshotSchema = new mongoose.Schema(
  {
    committeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Committee",
      required: true,
    },
    committeeName: { type: String, required: true },
    committeeSlug: { type: String, required: true },
    percentage: { type: Number, required: true },
    amount: { type: Number, required: true },
    ledgerEntryId: {
      // Referencia al CommitteeLedgerEntry generado
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommitteeLedgerEntry",
    },
  },
  { _id: false },
);

const BudgetInitializationSchema = new mongoose.Schema(
  {
    // Monto total del saldo inicial general
    totalAmount: { type: Number, required: true, min: 0.01 },

    // Fecha del negocio de la inicialización
    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    // Descripción o concepto de este saldo inicial (para auditoría)
    description: { type: String, trim: true },
    notes: { type: String, trim: true },

    // Snapshot de cómo se distribuyó (para auditoría histórica)
    distributionSnapshot: { type: [DistributionSnapshotSchema], default: [] },

    // Estado — solo puede haber un ACTIVE
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

// Garantía a nivel DB: máximo un documento ACTIVE
BudgetInitializationSchema.index(
  { status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
    name: "unique_active_initialization",
  },
);

module.exports = mongoose.model(
  "BudgetInitialization",
  BudgetInitializationSchema,
);
