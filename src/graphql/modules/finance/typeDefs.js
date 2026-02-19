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

  # ─── CashSession ────────────────────────────────────────────────────────────

  type MethodTotals {
    cash: Float!
    sinpe: Float!
    card: Float!
    transfer: Float! # ← NUEVO: transferencias bancarias
    other: Float!
  }

  type CashSession {
    id: ID!
    businessDate: String!
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
    lineItems: [SaleLineItem!]!
    total: Float!
    status: SaleStatus!
    voidReason: String
    refundReason: String
    voidedAt: String
    createdBy: ID
    createdAt: String
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
    vendor: String
    receiptUrl: String
    isAssetPurchase: Boolean!
    purpose: String
    status: ExpenseStatus!
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
    net: Float!
  }

  """
  Desglose sesión (movimientos con cashSessionId) vs externos (sin cashSessionId).
  Solo aparece en dailySummary cuando existe una sesión para ese día.
  Campo 'breakdown' es nullable para compatibilidad hacia atrás.
  """
  type SessionVsExternalBreakdown {
    # Movimientos vinculados a la sesión de caja
    sessionSales: Float!
    sessionExpenses: Float!
    sessionNet: Float!
    sessionByMethod: [PaymentMethodBreakdown!]!

    # Movimientos externos (sin cashSessionId)
    externalSales: Float!
    externalExpenses: Float!
    externalNet: Float!
    externalByMethod: [PaymentMethodBreakdown!]!
  }

  type DailySummaryReport {
    businessDate: String!
    session: CashSession

    # Totales completos del día (sesión + externos)
    totalSales: Float!
    totalExpenses: Float!
    net: Float!
    salesByMethod: [PaymentMethodBreakdown!]!
    expensesByMethod: [PaymentMethodBreakdown!]!
    productSales: [ProductSalesSummary!]!
    expensesByCategory: [CategoryExpenseSummary!]!

    # Desglose sesión vs externos. Null si no hay sesión ese día.
    breakdown: SessionVsExternalBreakdown
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
  }

  type MonthlyReportDataset {
    month: Int!
    year: Int!
    generatedAt: String!
    summary: RangeSummaryReport!
    dailyBreakdown: [DailySummaryReport!]!
    assetPurchases: [Expense!]!
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
    purpose: String
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

  # ─── Mutations ──────────────────────────────────────────────────────────────

  extend type Mutation {
    openCashSession(
      businessDate: String!
      openingCash: Float
      notes: String
    ): CashSession

    closeCashSession(input: CloseCashSessionInput!): CashSession

    recordSale(input: RecordSaleInput!): Sale
    voidSale(saleId: ID!, reason: String!): Sale
    refundSale(saleId: ID!, reason: String!): Sale

    recordExpense(input: RecordExpenseInput!): Expense
    voidExpense(expenseId: ID!, reason: String!): Expense

    createCategory(input: CreateCategoryInput!): Category
    createActivity(input: CreateActivityInput!): Activity
    toggleCategoryActive(id: ID!): Category
    toggleActivityActive(id: ID!): Activity
  }

  # ─── Queries ────────────────────────────────────────────────────────────────

  extend type Query {
    categories(onlyActive: Boolean): [Category!]!
    activities(onlyActive: Boolean): [Activity!]!

    cashSessionDetail(businessDate: String, cashSessionId: ID): CashSession
    cashSessions(dateFrom: String!, dateTo: String!): [CashSession!]!

    salesByDate(businessDate: String!): [Sale!]!
    expensesByDate(businessDate: String!): [Expense!]!

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
  }
`;
