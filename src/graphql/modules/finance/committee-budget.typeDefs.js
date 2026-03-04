/**
 * finance/committee-budget.typeDefs.js
 *
 * GraphQL schema para el módulo de presupuestos por comités del STAFF.
 * Se extiende sobre el schema existente del módulo de finanzas.
 *
 * Convención: sigue el mismo estilo del typeDefs.js existente.
 */

const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums nuevos ────────────────────────────────────────────────────────────

  #   """
  #   Tipo de movimiento en el ledger de un comité.
  #   """
  enum CommitteeLedgerEntryType {
    INITIAL_ALLOCATION
    UTILITY_DISTRIBUTION
    EXPENSE_DEBIT
    MANUAL_CREDIT
    MANUAL_DEBIT
    ADJUSTMENT
  }

  enum BudgetInitializationStatus {
    ACTIVE
    VOIDED
  }

  enum ActivitySettlementStatus {
    ACTIVE
    VOIDED
  }

  # ─── Tipos base ───────────────────────────────────────────────────────────────

  #   """
  #   Comité del STAFF con su porcentaje de distribución presupuestaria.
  #   """
  type Committee {
    id: ID!
    name: String!
    slug: String!
    distributionPercentage: Float!
    description: String
    isActive: Boolean!
    displayOrder: Int!
    createdAt: String
    updatedAt: String
  }

  #   """
  #   Movimiento individual en el ledger de un comité.
  #   Cada entrada representa un cambio en el saldo del comité (crédito o débito).
  #   """
  type CommitteeLedgerEntry {
    id: ID!
    committeeId: ID!
    committeeNameSnapshot: String!
    entryType: CommitteeLedgerEntryType!
    businessDate: String!

    # Montos — solo uno debe ser > 0 por entrada
    creditAmount: Float!
    debitAmount: Float!

    # Saldo acumulado del comité después de este movimiento
    runningBalance: Float!

    # Snapshot del porcentaje al momento del movimiento
    percentageSnapshot: Float

    description: String!
    notes: String

    # Referencias a documentos fuente (según entryType)
    budgetInitializationId: ID
    activitySettlementId: ID
    activityId: ID
    expenseId: ID

    status: String!
    voidReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
  }

  #   """
  #   Snapshot de la distribución a un comité específico dentro de un evento de distribución.
  #   """
  type DistributionSnapshot {
    committeeId: ID!
    committeeName: String!
    committeeSlug: String!
    percentage: Float!
    amount: Float!
    ledgerEntryId: ID
  }

  #   """
  #   Registro único del saldo inicial general del sistema de presupuestos.
  #   Solo puede existir uno activo a la vez.
  #   """
  type BudgetInitialization {
    id: ID!
    totalAmount: Float!
    businessDate: String!
    description: String
    notes: String
    distributionSnapshot: [DistributionSnapshot!]!
    status: BudgetInitializationStatus!
    voidReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
  }

  #   """
  #   Liquidación de la utilidad de una actividad — distribuye la ganancia entre comités.
  #   Una actividad solo puede tener un settlement activo.
  #   """
  type ActivitySettlement {
    id: ID!
    activityId: ID!
    activityNameSnapshot: String!
    businessDate: String!

    # Métricas de la actividad al momento de la liquidación
    totalSales: Float!
    totalExpenses: Float!
    inventoryCostConsumed: Float!
    netProfit: Float!

    # Rango de fechas usado para el cálculo
    calculatedFromDate: String
    calculatedToDate: String

    totalDistributed: Float!
    distributionSnapshot: [DistributionSnapshot!]!

    notes: String
    status: ActivitySettlementStatus!
    voidReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
  }

  # ─── Tipos de reporte / consulta ─────────────────────────────────────────────

  #   """
  #   Resultado del cálculo de utilidad de una actividad (previo a liquidar).
  #   """
  type ActivityProfitCalculation {
    activityId: ID!
    activityName: String!
    totalSales: Float!
    totalExpenses: Float!
    inventoryCostConsumed: Float!
    netProfit: Float!
    isAlreadySettled: Boolean!
    settlementId: ID
    settlementDate: String
    dateFrom: String
    dateTo: String
  }

  #   """
  #   Resumen de presupuesto de un comité individual.
  #   """
  type CommitteeBudgetSummary {
    committee: Committee!
    # Ingresos por tipo
    initialAllocation: Float!
    utilityDistributions: Float!
    manualCredits: Float!
    totalCredits: Float!
    # Egresos por tipo
    expenseDebits: Float!
    manualDebits: Float!
    totalDebits: Float!
    # Saldo
    currentBalance: Float!
    entryCount: Int!
    distributionPercentage: Float!
  }

  """
  Estado de cuenta completo de un comité con historial de movimientos.
  """
  type CommitteeLedger {
    committee: Committee!
    entries: [CommitteeLedgerEntry!]!
    currentBalance: Float!
    totalCredits: Float!
    totalDebits: Float!
    entryCount: Int!
  }

  #   """
  #   Configuración actual de distribución porcentual entre comités.
  #   """
  type CommitteeDistributionConfig {
    committees: [Committee!]!
    totalPercentage: Float!
    isValid: Boolean!
  }

  #   """
  #   Resumen global de todos los presupuestos de comités.
  #   """
  type AllCommitteeBudgetsSummary {
    committees: [CommitteeBudgetSummary!]!
    totalBudget: Float!
    totalExpended: Float!
    totalAvailable: Float!
    isInitialized: Boolean!
    initialization: BudgetInitialization
  }

  # ─── Inputs ──────────────────────────────────────────────────────────────────

  input CreateCommitteeInput {
    name: String!
    slug: String!
    distributionPercentage: Float!
    description: String
    displayOrder: Int
  }

  input CommitteePercentageUpdateInput {
    committeeId: ID!
    percentage: Float!
  }

  input InitializeCommitteeBudgetsInput {
    totalAmount: Float!
    businessDate: String!
    description: String
    notes: String
  }

  input DistributeActivityProfitInput {
    activityId: ID!
    businessDate: String!
    # """
    # Rango opcional para calcular la utilidad. Si se omite, usa toda la historia.
    # """
    dateFrom: String
    dateTo: String
    notes: String
    # """
    # Si true, permite liquidar actividades con utilidad <= 0 (para marcarlas como revisadas).
    # """
    forceIfZero: Boolean
  }

  #   """
  #   Input para cargar un gasto al presupuesto de un comité.

  #   FLUJO A: si se proporciona expenseId, vincula un Expense ya existente al comité.
  #   FLUJO B: si se proporciona expenseData, crea el Expense y lo vincula en una sola operación.
  #   """
  input RecordCommitteeExpenseInput {
    committeeId: ID!
    businessDate: String!
    amount: Float!
    concept: String!
    notes: String
    activityId: ID
    # """
    # Flujo A: ID de un Expense ya existente a vincular con este comité.
    # """
    expenseId: ID
    # """
    # Flujo B: datos para crear un nuevo Expense (se ignora si se provee expenseId).
    # """
    expenseData: CommitteeExpenseDataInput
    # """
    # Si true, permite que el comité quede con saldo negativo. Default: false.
    # """
    allowNegativeBalance: Boolean
  }

  input CommitteeExpenseDataInput {
    paymentMethod: PaymentMethod!
    categoryId: ID
    detail: String
    vendor: String
    receiptUrl: String
    isAssetPurchase: Boolean
    expenseType: ExpenseType
    cashSessionId: ID
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    # ── Configuración de comités ──────────────────────────────────────────────

    # """
    # Crea los 6 comités por defecto con sus porcentajes estándar.
    # Idempotente: si ya existen comités, no hace nada.
    # """
    seedCommittees: [Committee!]!

    # """
    # Crea un comité nuevo. Valida que los porcentajes no superen el 100%.
    # """
    createCommittee(input: CreateCommitteeInput!): Committee!

    # """
    # Actualiza los porcentajes de distribución de los comités.
    # TODOS los comités activos deben ser incluidos y la suma debe ser exactamente 100%.
    # """
    updateCommitteeDistributionConfig(
      updates: [CommitteePercentageUpdateInput!]!
    ): CommitteeDistributionConfig!

    # ── Saldo inicial ─────────────────────────────────────────────────────────

    # """
    # Registra el saldo inicial del sistema de presupuestos y lo distribuye
    # automáticamente entre todos los comités activos según sus porcentajes.
    # Solo puede ejecutarse una vez (un solo saldo inicial activo).
    # """
    initializeCommitteeBudgets(
      input: InitializeCommitteeBudgetsInput!
    ): BudgetInitialization!

    # ── Utilidad de actividades ───────────────────────────────────────────────

    # """
    # Liquida la utilidad de una actividad y la distribuye entre los comités.
    # Una actividad solo puede liquidarse una vez.
    # Internamente reutiliza la lógica de Sale + Expense + InventoryMovement.
    # """
    distributeActivityProfit(
      input: DistributeActivityProfitInput!
    ): ActivitySettlement!

    # ── Gastos por comité ─────────────────────────────────────────────────────

    # """
    # Registra un gasto que rebaja el presupuesto de un comité específico.
    # Puede vincular un Expense ya existente (Flujo A) o crear uno nuevo (Flujo B).
    # """
    recordCommitteeExpense(
      input: RecordCommitteeExpenseInput!
    ): CommitteeLedgerEntry!
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    # ── Comités ───────────────────────────────────────────────────────────────

    # """
    # Lista todos los comités (activos por defecto).
    # """
    committees(onlyActive: Boolean): [Committee!]!

    # """
    # Configuración actual de distribución porcentual.
    # Incluye la suma total y si es válida (suma = 100%).
    # """
    committeeDistributionConfig: CommitteeDistributionConfig!

    # ── Presupuesto global ────────────────────────────────────────────────────

    # """
    # Resumen de presupuesto de todos los comités activos.
    # Panel de control principal.
    # """
    allCommitteeBudgets: AllCommitteeBudgetsSummary!

    # """
    # Resumen de presupuesto de un comité específico.
    # """
    committeeBudgetSummary(committeeId: ID!): CommitteeBudgetSummary!

    # """
    # Estado de cuenta completo (ledger) de un comité.
    # Incluye historial de todos los movimientos.
    # """
    committeeLedger(
      committeeId: ID!
      dateFrom: String
      dateTo: String
      entryType: CommitteeLedgerEntryType
    ): CommitteeLedger!

    # ── Saldo inicial ─────────────────────────────────────────────────────────

    # """
    # Obtiene el saldo inicial activo del sistema (si existe).
    # """
    budgetInitialization: BudgetInitialization

    # ── Actividades ───────────────────────────────────────────────────────────

    # """
    # Calcula la utilidad neta de una actividad sin liquidarla.
    # Útil para previsualizar antes de distribuir.
    # """
    activityProfitCalculation(
      activityId: ID!
      dateFrom: String
      dateTo: String
    ): ActivityProfitCalculation!

    # """
    # Lista actividades que tienen movimientos financieros pero no han sido
    # liquidadas (distribuidas entre comités) todavía.
    # """
    activitiesPendingSettlement(
      dateFrom: String
      dateTo: String
    ): [ActivityProfitCalculation!]!

    # """
    # Obtiene el settlement de una actividad específica (si fue liquidada).
    # """
    activitySettlement(activityId: ID!): ActivitySettlement

    # """
    # Lista todos los settlements (liquidaciones de actividades).
    # """
    allActivitySettlements(
      dateFrom: String
      dateTo: String
    ): [ActivitySettlement!]!
  }
`;
