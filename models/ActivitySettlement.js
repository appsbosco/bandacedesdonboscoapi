/**
 * ActivitySettlement — Liquidación de utilidad de una actividad.
 *
 * Cuando se decide distribuir la utilidad de una actividad entre los comités,
 * se crea este documento como "comprobante" de esa liquidación.
 *
 * REGLA CRÍTICA: Solo puede haber UN ActivitySettlement con status="ACTIVE"
 * por activityId. Esto garantiza que una actividad no se distribuya dos veces.
 * El índice unique en { activityId: 1 } con partial filter { status: "ACTIVE" }
 * lo garantiza a nivel de base de datos.
 *
 * Flujo:
 * 1. El usuario solicita distribuir la utilidad de una actividad.
 * 2. El servicio calcula la utilidad neta (sales - expenses - inventoryCost).
 * 3. Si la utilidad > 0, se crea este documento.
 * 4. Se crea un CommitteeLedgerEntry de tipo UTILITY_DISTRIBUTION por cada
 *    comité activo, proporcionalmente según sus porcentajes.
 * 5. El activitySettlementId queda referenciado en cada CommitteeLedgerEntry
 *    para trazabilidad completa.
 *
 * Si la utilidad es 0 o negativa, se puede registrar igualmente como documento
 * de cierre (con distribuciones en 0) para marcar la actividad como "revisada".
 */
const mongoose = require("mongoose");

// Snapshot de la distribución calculada al momento de la liquidación
const SettlementDistributionSchema = new mongoose.Schema(
  {
    committeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Committee",
      required: true,
    },
    committeeName: { type: String, required: true },
    committeeSlug: { type: String, required: true },
    percentage: { type: Number, required: true },
    amount: { type: Number, required: true }, // Puede ser 0 si utilidad es 0
    ledgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommitteeLedgerEntry",
    },
  },
  { _id: false },
);

const ActivitySettlementSchema = new mongoose.Schema(
  {
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
    },
    // Snapshot del nombre de la actividad (para reportes históricos)
    activityNameSnapshot: { type: String, required: true },

    // Fecha del negocio de la liquidación
    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    // ── Métricas calculadas de la actividad (snapshot al momento de liquidar) ──
    totalSales: { type: Number, required: true, default: 0 },
    totalExpenses: { type: Number, required: true, default: 0 },
    inventoryCostConsumed: { type: Number, required: true, default: 0 },
    // Utilidad neta = totalSales - totalExpenses - inventoryCostConsumed
    netProfit: { type: Number, required: true },

    // Rango de fechas usado para calcular la utilidad (para auditoría)
    calculatedFromDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    calculatedToDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },

    // Monto total distribuido (puede diferir de netProfit por redondeo)
    totalDistributed: { type: Number, required: true, default: 0 },

    // Snapshot de la distribución por comité
    distributionSnapshot: {
      type: [SettlementDistributionSchema],
      default: [],
    },

    notes: { type: String, trim: true },

    // Estado — solo puede haber un ACTIVE por actividad
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

// GARANTÍA DB: una actividad solo puede tener un settlement ACTIVE
ActivitySettlementSchema.index(
  { activityId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
    name: "unique_active_settlement_per_activity",
  },
);

ActivitySettlementSchema.index({ businessDate: 1 });
ActivitySettlementSchema.index({ status: 1 });

module.exports = mongoose.model("ActivitySettlement", ActivitySettlementSchema);
