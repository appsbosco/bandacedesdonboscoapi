/**
 * CommitteeLedgerEntry — Libro mayor (ledger) de movimientos presupuestarios por comité.
 *
 * PRINCIPIO: cada vez que el saldo de un comité cambia, se crea un registro aquí.
 * El saldo actual de un comité = suma de (creditAmount - debitAmount) de todos sus
 * registros ACTIVE. Nunca se guarda un saldo "corriente" en el documento Committee;
 * siempre se recalcula a partir del ledger (igual que BankEntry con FinanceAccount).
 *
 * Tipos de movimiento (entryType):
 *
 *   INITIAL_ALLOCATION    — Distribución del saldo inicial general al comité.
 *                           Referencia: budgetInitializationId (BudgetInitialization)
 *
 *   UTILITY_DISTRIBUTION  — Distribución de utilidad de una actividad al comité.
 *                           Referencia: activitySettlementId (ActivitySettlement)
 *                           + activityId
 *
 *   EXPENSE_DEBIT         — Gasto cargado al comité (rebaja su saldo).
 *                           Referencia: expenseId (Expense existente)
 *
 *   MANUAL_CREDIT         — Abono manual extraordinario (requiere justificación).
 *   MANUAL_DEBIT          — Débito manual extraordinario (requiere justificación).
 *   ADJUSTMENT            — Ajuste contable (corrección de error, etc.)
 *
 * El campo `runningBalance` se precalcula y guarda al momento de crear la entrada,
 * recalculándose sobre el balance anterior más el movimiento actual. Esto permite
 * obtener un estado de cuenta ordenado sin recalcular toda la historia.
 *
 * IMPORTANTE: runningBalance es informativo y se recalcula en reportes de verificación.
 * La fuente de verdad siempre es la suma acumulada del ledger.
 */
const mongoose = require("mongoose");

const CommitteeLedgerEntrySchema = new mongoose.Schema(
  {
    committeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Committee",
      required: true,
    },
    // Snapshot del nombre del comité al momento del registro (para reportes históricos)
    committeeNameSnapshot: { type: String, required: true, trim: true },

    // Tipo de movimiento (determina la semántica del registro)
    entryType: {
      type: String,
      enum: [
        "INITIAL_ALLOCATION",
        "UTILITY_DISTRIBUTION",
        "EXPENSE_DEBIT",
        "MANUAL_CREDIT",
        "MANUAL_DEBIT",
        "ADJUSTMENT",
      ],
      required: true,
    },

    // Fecha del negocio a la que pertenece este movimiento
    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    // ── Montos ────────────────────────────────────────────────────────────
    // Solo uno de los dos debe ser > 0 en cada entrada.
    // creditAmount: dinero que entra al comité (incrementa saldo)
    // debitAmount:  dinero que sale del comité (reduce saldo)
    creditAmount: { type: Number, default: 0, min: 0 },
    debitAmount: { type: Number, default: 0, min: 0 },

    // Saldo acumulado del comité DESPUÉS de este movimiento.
    // Precalculado al insertar para eficiencia en estado de cuenta.
    runningBalance: { type: Number, required: true },

    // Porcentaje del comité en el momento del movimiento (snapshot para historial)
    percentageSnapshot: { type: Number },

    // ── Descripción y auditoría ────────────────────────────────────────────
    description: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },

    // ── Referencias a documentos fuente ──────────────────────────────────
    // Solo uno de estos aplica dependiendo del entryType:
    budgetInitializationId: {
      // Para INITIAL_ALLOCATION
      type: mongoose.Schema.Types.ObjectId,
      ref: "BudgetInitialization",
    },
    activitySettlementId: {
      // Para UTILITY_DISTRIBUTION
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivitySettlement",
    },
    activityId: {
      // Para UTILITY_DISTRIBUTION y EXPENSE_DEBIT (si aplica)
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
    },
    expenseId: {
      // Para EXPENSE_DEBIT
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
    },

    // Estado del registro (permite anulaciones de emergencia)
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

// Índices para consultas frecuentes
CommitteeLedgerEntrySchema.index({ committeeId: 1, status: 1, createdAt: 1 });
CommitteeLedgerEntrySchema.index({ committeeId: 1, businessDate: 1 });
CommitteeLedgerEntrySchema.index({ entryType: 1, status: 1 });
CommitteeLedgerEntrySchema.index({ activitySettlementId: 1 }, { sparse: true });
CommitteeLedgerEntrySchema.index({ expenseId: 1 }, { sparse: true });
CommitteeLedgerEntrySchema.index(
  { budgetInitializationId: 1 },
  { sparse: true },
);

module.exports = mongoose.model(
  "CommitteeLedgerEntry",
  CommitteeLedgerEntrySchema,
);
