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

  type DailySummaryReport {
    businessDate: String!
    session: CashSession
    totalSales: Float!
    totalExpenses: Float!
    net: Float!
    salesByMethod: [PaymentMethodBreakdown!]!
    expensesByMethod: [PaymentMethodBreakdown!]!
    productSales: [ProductSalesSummary!]!
    expensesByCategory: [CategoryExpenseSummary!]!
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
    # Caja
    openCashSession(
      businessDate: String!
      openingCash: Float
      notes: String
    ): CashSession

    closeCashSession(input: CloseCashSessionInput!): CashSession

    # Ventas
    recordSale(input: RecordSaleInput!): Sale
    voidSale(saleId: ID!, reason: String!): Sale
    refundSale(saleId: ID!, reason: String!): Sale

    # Egresos
    recordExpense(input: RecordExpenseInput!): Expense
    voidExpense(expenseId: ID!, reason: String!): Expense

    # Catálogos
    createCategory(input: CreateCategoryInput!): Category
    createActivity(input: CreateActivityInput!): Activity
    toggleCategoryActive(id: ID!): Category
    toggleActivityActive(id: ID!): Activity
  }

  # ─── Queries ────────────────────────────────────────────────────────────────

  extend type Query {
    # Catálogos
    categories(onlyActive: Boolean): [Category!]!
    activities(onlyActive: Boolean): [Activity!]!

    # Sesiones
    cashSessionDetail(businessDate: String, cashSessionId: ID): CashSession
    cashSessions(dateFrom: String!, dateTo: String!): [CashSession!]!

    # Ventas / Egresos del día / rango
    salesByDate(businessDate: String!): [Sale!]!
    expensesByDate(businessDate: String!): [Expense!]!

    # Reportes agregados
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

    # Dataset mensual (para PDF)
    monthlyReportDataset(month: Int!, year: Int!): MonthlyReportDataset!
  }
`;
