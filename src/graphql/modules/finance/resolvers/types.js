/**
 * finance/resolvers/types.js
 * Field-level resolvers para mapear _id → id y serializar fechas.
 */
const toId = (parent) => String(parent._id || parent.id || "");
const toStr = (v) => (v ? String(v) : null);

const sharedFields = {
  id: toId,
  createdAt: (p) => toStr(p.createdAt),
};

module.exports = {
  CashSession: {
    ...sharedFields,
    openedAt: (p) => toStr(p.openedAt),
    closedAt: (p) => toStr(p.closedAt),
    createdBy: (p) => toStr(p.createdBy),
    closedBy: (p) => toStr(p.closedBy),
  },

  Sale: {
    ...sharedFields,
    cashSessionId: (p) => toStr(p.cashSessionId),
    activityId: (p) => toStr(p.activityId),
    orderId: (p) => toStr(p.orderId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
  },

  SaleLineItem: {
    id: toId,
    productId: (p) => toStr(p.productId),
  },

  Expense: {
    ...sharedFields,
    cashSessionId: (p) => toStr(p.cashSessionId),
    activityId: (p) => toStr(p.activityId),
    categoryId: (p) => toStr(p.categoryId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
  },

  Category: {
    ...sharedFields,
  },

  Activity: {
    ...sharedFields,
  },

  // DailySummaryReport.session puede ser null → el resolver de campo lo maneja
  DailySummaryReport: {
    session: (p) => p.session || null,
  },

  ActivitySummary: {
    activityId: (p) => toStr(p.activityId),
  },

  CategoryExpenseSummary: {
    categoryId: (p) => (p.categoryId ? toStr(p.categoryId) : null),
  },

  ProductSalesSummary: {
    productId: (p) => (p.productId ? toStr(p.productId) : null),
  },
};
