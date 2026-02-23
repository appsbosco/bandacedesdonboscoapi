const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum PaymentMethod {
    CASH
    SINPE
    CARD
    TRANSFER
    OTHER
  }

  enum SaleSource {
    ORDER
    WALK_IN
    DONATION
    BANK_INCOME
  }

  enum SaleStatus {
    ACTIVE
    VOIDED
    REFUNDED
  }

  enum ExpenseStatus {
    ACTIVE
    VOIDED
  }

  enum CashSessionStatus {
    OPEN
    CLOSED
  }

  enum MovementScope {
    SESSION
    EXTERNAL
  }

  enum DonationType {
    MONETARY
  }

  enum ExpenseType {
    REGULAR
    INVENTORY_PURCHASE
    ASSET_PURCHASE
    TRANSFER_OUT
    OTHER
  }

  enum FinanceAccountType {
    BANK
    CASH_BOX
    EXTERNAL
    OTHER
  }

  enum BankEntryType {
    DEPOSIT
    WITHDRAWAL
    INCOMING_TRANSFER
    OUTGOING_TRANSFER
    PAYMENT
    INCOME
    COMMISSION
    ADJUSTMENT
  }

  enum BankDirection {
    CREDIT
    DEBIT
  }

  enum InventoryMovementType {
    PURCHASE
    DONATION_IN_KIND
    CONSUMPTION
    ADJUSTMENT_IN
    ADJUSTMENT_OUT
    SHRINKAGE
    SALE_OUT
  }

  # ─── Catalogues ─────────────────────────────────────────────────────────────

  type Category {
    id: ID!
    name: String!
    code: String
    isActive: Boolean!
    createdAt: String
  }

  type Activity {
    id: ID!
    name: String!
    code: String
    isActive: Boolean!
    createdAt: String
  }

  # ─── CashBox ─────────────────────────────────────────────────────────────────

  type CashBox {
    id: ID!
    name: String!
    code: String
    description: String
    isActive: Boolean!
    isDefault: Boolean!
    createdAt: String
  }

  # ─── FinanceAccount ──────────────────────────────────────────────────────────

  type FinanceAccount {
    id: ID!
    name: String!
    code: String
    type: FinanceAccountType!
    cashBoxId: ID
    bankName: String
    accountNumber: String
    currency: String!
    openingBalance: Float!
    openingBalanceDate: String
    isActive: Boolean!
    notes: String
    createdAt: String
    # Saldo calculado (computed, requiere query separada o se incluye en bankReport)
    currentBalance: Float
  }

  # ─── BankEntry ───────────────────────────────────────────────────────────────

  type BankEntry {
    id: ID!
    businessDate: String!
    accountId: ID!
    type: BankEntryType!
    direction: BankDirection!
    amount: Float!
    concept: String!
    detail: String
    reference: String
    expenseId: ID
    saleId: ID
    activityId: ID
    transferPairId: ID
    status: String!
    voidReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
  }

  # ─── CashSession ────────────────────────────────────────────────────────────

  type MethodTotals {
    cash: Float!
    sinpe: Float!
    card: Float!
    transfer: Float!
    other: Float!
  }

  type CashSession {
    id: ID!
    businessDate: String!
    cashBoxId: ID
    cashBoxSnapshot: String
    status: CashSessionStatus!
    openedAt: String
    closedAt: String
    openingCash: Float
    expectedTotalsByMethod: MethodTotals
    countedCash: Float
    difference: Float
    notes: String
    createdBy: ID
    closedBy: ID
    createdAt: String
  }

  # ─── Sale ───────────────────────────────────────────────────────────────────

  type SaleLineItem {
    id: ID!
    productId: ID
    nameSnapshot: String!
    unitPriceSnapshot: Float!
    quantity: Int!
    subtotal: Float!
  }

  type Sale {
    id: ID!
    businessDate: String!
    cashSessionId: ID
    activityId: ID
    orderId: ID
    paymentMethod: PaymentMethod!
    source: SaleSource!
    donationType: DonationType
    donorName: String
    lineItems: [SaleLineItem!]!
    total: Float!
    status: SaleStatus!
    voidReason: String
    refundReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
    scope: MovementScope!
  }

  # ─── Expense ────────────────────────────────────────────────────────────────

  type Expense {
    id: ID!
    businessDate: String!
    cashSessionId: ID
    activityId: ID
    categoryId: ID
    categorySnapshot: String
    concept: String!
    detail: String
    amount: Float!
    paymentMethod: PaymentMethod!
    expenseType: ExpenseType!
    vendor: String
    receiptUrl: String
    isAssetPurchase: Boolean!
    assetDescription: String
    purpose: String
    inventoryItemId: ID
    inventoryQuantity: Float
    inventoryUnitCost: Float
    status: ExpenseStatus!
    voidReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
    scope: MovementScope!
  }

  # ─── Inventory ───────────────────────────────────────────────────────────────

  type InventoryItem {
    id: ID!
    name: String!
    code: String
    description: String
    unit: String!
    productId: ID
    isActive: Boolean!
    minStockAlert: Float!
    currentStock: Float # Calculado
    averageCost: Float # Calculado (WAC)
    createdAt: String
  }

  type InventoryMovement {
    id: ID!
    businessDate: String!
    itemId: ID!
    type: InventoryMovementType!
    quantity: Float!
    unitCostSnapshot: Float!
    totalCostSnapshot: Float!
    estimatedValue: Float
    concept: String
    detail: String
    activityId: ID
    expenseId: ID
    cashSessionId: ID
    vendor: String
    status: String!
    voidReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
  }

  # ─── Report types ───────────────────────────────────────────────────────────

  type PaymentMethodBreakdown {
    method: String!
    total: Float!
    count: Int!
  }

  type ProductSalesSummary {
    productId: ID
    name: String!
    totalUnits: Int!
    totalRevenue: Float!
  }

  type CategoryExpenseSummary {
    categoryId: ID
    categorySnapshot: String!
    totalAmount: Float!
    count: Int!
  }

  type ActivitySummary {
    activityId: ID!
    name: String
    totalSales: Float!
    totalExpenses: Float!
    inventoryCostConsumed: Float!
    totalDonations: Float!
    net: Float!
  }

  type InventoryConsumptionSummary {
    itemId: ID!
    itemName: String!
    totalQuantity: Float!
    totalCost: Float!
  }

  type DonationSummary {
    monetary: Float!
    inKindEstimated: Float!
    count: Int!
  }

  type CashBoxSessionSummary {
    cashBoxId: ID
    cashBoxName: String
    session: CashSession
    sessionSales: Float!
    sessionExpenses: Float!
    sessionNet: Float!
    sessionByMethod: [PaymentMethodBreakdown!]!
  }

  type BankAccountSummary {
    accountId: ID!
    accountName: String!
    openingBalance: Float!
    credits: Float!
    debits: Float!
    closingBalance: Float!
    movements: [BankEntry!]!
  }

  """
  Desglose sesión (movimientos con cashSessionId) vs externos (sin cashSessionId).
  """
  type SessionVsExternalBreakdown {
    sessionSales: Float!
    sessionExpenses: Float!
    sessionNet: Float!
    sessionByMethod: [PaymentMethodBreakdown!]!
    externalSales: Float!
    externalExpenses: Float!
    externalNet: Float!
    externalByMethod: [PaymentMethodBreakdown!]!
  }

  type DailySummaryReport {
    businessDate: String!

    # Totales consolidados (sesión + externos, excluye TRANSFER_OUT para no doble contar)
    totalSales: Float!
    totalExpenses: Float!
    net: Float!
    salesByMethod: [PaymentMethodBreakdown!]!
    expensesByMethod: [PaymentMethodBreakdown!]!
    productSales: [ProductSalesSummary!]!
    expensesByCategory: [CategoryExpenseSummary!]!

    # Desglose sesión vs externos (null si no hay sesiones ese día)
    breakdown: SessionVsExternalBreakdown

    # ── Nuevo en v2 ──────────────────────────────────────────────────────
    # Desglose por caja (una entrada por sesión abierta ese día)
    cashBoxBreakdown: [CashBoxSessionSummary!]!

    # Movimientos bancarios del día
    bankSummary: [BankAccountSummary!]!

    # Donaciones
    donations: DonationSummary!

    # Activos comprados hoy
    assetPurchases: [Expense!]!

    # Consumo de inventario del día
    inventoryConsumption: [InventoryConsumptionSummary!]!

    # Donaciones en especie recibidas hoy
    inKindDonations: [InventoryMovement!]!
  }

  type RangeSummaryReport {
    dateFrom: String!
    dateTo: String!
    totalSales: Float!
    totalExpenses: Float!
    net: Float!
    salesByMethod: [PaymentMethodBreakdown!]!
    expensesByMethod: [PaymentMethodBreakdown!]!
    productSales: [ProductSalesSummary!]!
    expensesByCategory: [CategoryExpenseSummary!]!
    activitiesSummary: [ActivitySummary!]!
    donations: DonationSummary!
    inventoryConsumption: [InventoryConsumptionSummary!]!
    totalAssetPurchases: Float!
  }

  type MonthlyReportDataset {
    month: Int!
    year: Int!
    generatedAt: String!
    summary: RangeSummaryReport!
    dailyBreakdown: [DailySummaryReport!]!
    assetPurchases: [Expense!]!
    bankMovements: [BankEntry!]!
    inventoryReport: InventoryRangeReport!
  }

  type ActivityPnLReport {
    activityId: ID!
    activityName: String
    dateFrom: String!
    dateTo: String!
    totalSales: Float!
    totalExpenses: Float!
    inventoryCostConsumed: Float!
    donationsMonetary: Float!
    donationsInKindEstimated: Float!
    net: Float!
    salesByMethod: [PaymentMethodBreakdown!]!
    expensesByCategory: [CategoryExpenseSummary!]!
    inventoryDetail: [InventoryConsumptionSummary!]!
  }

  type CashSessionReport {
    session: CashSession!
    sales: [Sale!]!
    expenses: [Expense!]!
    expectedTotalsByMethod: MethodTotals!
    totalSales: Float!
    totalExpenses: Float!
    net: Float!
  }

  type BankReport {
    account: FinanceAccount!
    dateFrom: String!
    dateTo: String!
    openingBalance: Float!
    totalCredits: Float!
    totalDebits: Float!
    closingBalance: Float!
    movements: [BankEntry!]!
    byType: [PaymentMethodBreakdown!]!
  }

  type InventoryStockEntry {
    item: InventoryItem!
    currentStock: Float!
    averageCost: Float!
    totalValue: Float!
    lastMovementDate: String
  }

  type InventoryRangeReport {
    dateFrom: String!
    dateTo: String!
    purchases: [InventoryMovement!]!
    consumptions: [InventoryMovement!]!
    donations: [InventoryMovement!]!
    shrinkages: [InventoryMovement!]!
    costConsumedByActivity: [ActivitySummary!]!
    currentStock: [InventoryStockEntry!]!
  }

  # ─── Inputs ─────────────────────────────────────────────────────────────────

  input SaleLineItemInput {
    productId: ID
    nameSnapshot: String!
    unitPriceSnapshot: Float!
    quantity: Int!
  }

  input RecordSaleInput {
    businessDate: String!
    paymentMethod: PaymentMethod!
    source: SaleSource
    total: Float
    lineItems: [SaleLineItemInput!]
    orderId: ID
    activityId: ID
    cashSessionId: ID
    scope: MovementScope
    donationType: DonationType
    donorName: String
  }

  input RecordExpenseInput {
    businessDate: String!
    paymentMethod: PaymentMethod!
    concept: String!
    amount: Float!
    categoryId: ID
    activityId: ID
    cashSessionId: ID
    detail: String
    vendor: String
    receiptUrl: String
    isAssetPurchase: Boolean
    assetDescription: String
    purpose: String
    scope: MovementScope
    expenseType: ExpenseType
    inventoryItemId: ID
    inventoryQuantity: Float
    inventoryUnitCost: Float
  }

  input CloseCashSessionInput {
    businessDate: String
    cashSessionId: ID
    countedCash: Float!
    notes: String
  }

  input CreateCategoryInput {
    name: String!
    code: String
  }

  input CreateActivityInput {
    name: String!
    code: String
  }

  input CreateCashBoxInput {
    name: String!
    code: String
    description: String
    isDefault: Boolean
  }

  input CreateFinanceAccountInput {
    name: String!
    code: String
    type: FinanceAccountType!
    cashBoxId: ID
    bankName: String
    accountNumber: String
    currency: String
    openingBalance: Float
    openingBalanceDate: String
    notes: String
  }

  input RecordBankEntryInput {
    businessDate: String!
    accountId: ID!
    type: BankEntryType!
    direction: BankDirection!
    amount: Float!
    concept: String!
    detail: String
    reference: String
    activityId: ID
    expenseId: ID
    saleId: ID
  }

  input RecordInventoryConsumptionInput {
    businessDate: String!
    itemId: ID!
    quantity: Float!
    activityId: ID
    concept: String
    detail: String
    cashSessionId: ID
  }

  input RecordDonationInKindInput {
    businessDate: String!
    itemId: ID!
    quantity: Float!
    estimatedValue: Float
    donorName: String
    activityId: ID
    concept: String
    detail: String
  }

  input CreateInventoryItemInput {
    name: String!
    code: String
    description: String
    unit: String
    productId: ID
    minStockAlert: Float
  }

  # ─── Mutations ──────────────────────────────────────────────────────────────

  extend type Mutation {
    # ── Caja ──────────────────────────────────────────────────────────────────
    openCashSession(
      businessDate: String!
      cashBoxId: ID # null = caja legacy / default
      openingCash: Float
      notes: String
    ): CashSession

    closeCashSession(input: CloseCashSessionInput!): CashSession

    # ── Ventas ────────────────────────────────────────────────────────────────
    recordSale(input: RecordSaleInput!): Sale
    voidSale(saleId: ID!, reason: String!): Sale
    refundSale(saleId: ID!, reason: String!): Sale

    # ── Egresos ───────────────────────────────────────────────────────────────
    recordExpense(input: RecordExpenseInput!): Expense
    voidExpense(expenseId: ID!, reason: String!): Expense

    # ── Catálogos ─────────────────────────────────────────────────────────────
    createCategory(input: CreateCategoryInput!): Category
    createActivity(input: CreateActivityInput!): Activity
    toggleCategoryActive(id: ID!): Category
    toggleActivityActive(id: ID!): Activity

    # ── CashBox ───────────────────────────────────────────────────────────────
    createCashBox(input: CreateCashBoxInput!): CashBox
    toggleCashBoxActive(id: ID!): CashBox

    # ── FinanceAccount ────────────────────────────────────────────────────────
    createFinanceAccount(input: CreateFinanceAccountInput!): FinanceAccount
    toggleFinanceAccountActive(id: ID!): FinanceAccount

    # ── Banco ─────────────────────────────────────────────────────────────────
    recordBankEntry(input: RecordBankEntryInput!): BankEntry
    voidBankEntry(entryId: ID!, reason: String!): BankEntry

    """
    Transfiere dinero de una sesión de caja al banco.
    Crea: Expense (TRANSFER_OUT, scope SESSION) + BankEntry (DEPOSIT CREDIT).
    """
    transferCashToBank(
      cashSessionId: ID!
      accountId: ID!
      amount: Float!
      concept: String
      businessDate: String!
    ): TransferResult

    """
    Transfiere dinero del banco a una caja.
    Crea: BankEntry (WITHDRAWAL DEBIT) + Sale (scope SESSION, source BANK_INCOME) o Expense negativo.
    """
    transferBankToCash(
      accountId: ID!
      cashSessionId: ID!
      amount: Float!
      concept: String
      businessDate: String!
    ): TransferResult

    # ── Inventario ────────────────────────────────────────────────────────────
    createInventoryItem(input: CreateInventoryItemInput!): InventoryItem
    toggleInventoryItemActive(id: ID!): InventoryItem

    """
    Registra consumo de inventario por una actividad (calcula WAC automáticamente).
    """
    recordInventoryConsumption(
      input: RecordInventoryConsumptionInput!
    ): InventoryMovement

    """
    Registra donación en especie (entra stock sin salida de dinero).
    """
    recordDonationInKind(input: RecordDonationInKindInput!): InventoryMovement

    """
    Registra merma/pérdida de inventario.
    """
    recordInventoryShrinkage(
      itemId: ID!
      quantity: Float!
      businessDate: String!
      concept: String
      detail: String
    ): InventoryMovement

    voidInventoryMovement(movementId: ID!, reason: String!): InventoryMovement
  }

  type TransferResult {
    expense: Expense
    sale: Sale
    bankEntry: BankEntry!
  }

  # ─── Queries ────────────────────────────────────────────────────────────────

  extend type Query {
    # ── Catálogos ─────────────────────────────────────────────────────────────
    categories(onlyActive: Boolean): [Category!]!
    activities(onlyActive: Boolean): [Activity!]!
    cashBoxes(onlyActive: Boolean): [CashBox!]!
    financeAccounts(
      onlyActive: Boolean
      type: FinanceAccountType
    ): [FinanceAccount!]!
    inventoryItems(onlyActive: Boolean): [InventoryItem!]!

    # ── Sesiones ──────────────────────────────────────────────────────────────
    # Legacy: busca por businessDate (todas las sesiones de ese día) o por cashSessionId
    cashSessionDetail(businessDate: String, cashSessionId: ID): CashSession
    # Multi-caja: devuelve todas las sesiones de un día o rango
    cashSessions(dateFrom: String!, dateTo: String!): [CashSession!]!
    cashSessionsByDate(businessDate: String!): [CashSession!]!

    # ── Ventas / Egresos del día ──────────────────────────────────────────────
    salesByDate(businessDate: String!): [Sale!]!
    expensesByDate(businessDate: String!): [Expense!]!

    # ── Inventario ────────────────────────────────────────────────────────────
    inventoryMovements(
      itemId: ID
      dateFrom: String
      dateTo: String
      type: InventoryMovementType
    ): [InventoryMovement!]!
    inventoryStock: [InventoryStockEntry!]!

    # ── Banco ─────────────────────────────────────────────────────────────────
    bankEntries(
      accountId: ID!
      dateFrom: String!
      dateTo: String!
    ): [BankEntry!]!
    bankReport(accountId: ID!, dateFrom: String!, dateTo: String!): BankReport!

    # ── Reportes principales ──────────────────────────────────────────────────
    dailySummary(businessDate: String!): DailySummaryReport!
    rangeSummary(dateFrom: String!, dateTo: String!): RangeSummaryReport!
    productSalesReport(
      dateFrom: String!
      dateTo: String!
    ): [ProductSalesSummary!]!
    expenseReport(
      dateFrom: String!
      dateTo: String!
    ): [CategoryExpenseSummary!]!
    monthlyReportDataset(month: Int!, year: Int!): MonthlyReportDataset!

    # ── Reportes nuevos v2 ────────────────────────────────────────────────────
    activityPnLReport(
      activityId: ID!
      dateFrom: String!
      dateTo: String!
    ): ActivityPnLReport!
    cashSessionReport(cashSessionId: ID!): CashSessionReport!
    inventoryRangeReport(
      dateFrom: String!
      dateTo: String!
    ): InventoryRangeReport!
  }
`;
