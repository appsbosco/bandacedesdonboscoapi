const toId = (p) => String(p._id || p.id || "");
const toStr = (v) => (v ? String(v) : null);

const sharedFields = {
  id: toId,
  createdAt: (p) => toStr(p.createdAt),
};

module.exports = {
  CashSession: {
    ...sharedFields,
    cashBoxId: (p) => toStr(p.cashBoxId),
    openedAt: (p) => toStr(p.openedAt),
    closedAt: (p) => toStr(p.closedAt),
    createdBy: (p) => toStr(p.createdBy),
    closedBy: (p) => toStr(p.closedBy),
  },

  CashBox: { ...sharedFields },

  FinanceAccount: {
    ...sharedFields,
    cashBoxId: (p) => toStr(p.cashBoxId),
    currentBalance: (p) => p.currentBalance ?? null,
  },

  BankEntry: {
    ...sharedFields,
    accountId: (p) => toStr(p.accountId),
    expenseId: (p) => toStr(p.expenseId),
    saleId: (p) => toStr(p.saleId),
    activityId: (p) => toStr(p.activityId),
    transferPairId: (p) => toStr(p.transferPairId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
  },

  Sale: {
    ...sharedFields,
    cashSessionId: (p) => toStr(p.cashSessionId),
    activityId: (p) => toStr(p.activityId),
    orderId: (p) => toStr(p.orderId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
    // FIX: scope non-nullable — docs legacy sin scope inferir del cashSessionId
    scope: (p) => p.scope || (p.cashSessionId ? "SESSION" : "EXTERNAL"),
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
    inventoryItemId: (p) => toStr(p.inventoryItemId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),

    // ── FIX: campos non-nullable que pueden faltar en docs legacy ──────────

    // scope: MovementScope! — docs pre-v2 no tienen este campo
    scope: (p) => p.scope || (p.cashSessionId ? "SESSION" : "EXTERNAL"),

    // expenseType: ExpenseType! — docs pre-v2 no tienen este campo
    expenseType: (p) =>
      p.expenseType || (p.isAssetPurchase ? "ASSET_PURCHASE" : "REGULAR"),

    // isAssetPurchase: Boolean! — puede ser null/undefined en docs legacy
    isAssetPurchase: (p) => p.isAssetPurchase ?? false,

    // status: ExpenseStatus! — fallback por si acaso
    status: (p) => p.status || "ACTIVE",
  },

  Category: { ...sharedFields },
  Activity: { ...sharedFields },

  InventoryItem: {
    ...sharedFields,
    productId: (p) => toStr(p.productId),
    currentStock: (p) => p.currentStock ?? null,
    averageCost: (p) => p.averageCost ?? null,
  },

  InventoryMovement: {
    ...sharedFields,
    itemId: (p) => toStr(p.itemId),
    activityId: (p) => toStr(p.activityId),
    expenseId: (p) => toStr(p.expenseId),
    cashSessionId: (p) => toStr(p.cashSessionId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
  },

  DailySummaryReport: {
    breakdown: (p) => p.breakdown || null,
    cashBoxBreakdown: (p) => p.cashBoxBreakdown || [],
    bankSummary: (p) => p.bankSummary || [],
    donations: (p) =>
      p.donations || { monetary: 0, inKindEstimated: 0, count: 0 },
    assetPurchases: (p) => p.assetPurchases || [],
    inventoryConsumption: (p) => p.inventoryConsumption || [],
    inKindDonations: (p) => p.inKindDonations || [],
  },

  CashBoxSessionSummary: {
    cashBoxId: (p) => toStr(p.cashBoxId),
    sessionByMethod: (p) => p.sessionByMethod || [],
  },

  BankAccountSummary: {
    accountId: (p) => toStr(p.accountId),
  },

  ActivitySummary: {
    activityId: (p) => toStr(p.activityId),
    inventoryCostConsumed: (p) => p.inventoryCostConsumed ?? 0,
    totalDonations: (p) => p.totalDonations ?? 0,
  },

  CategoryExpenseSummary: {
    categoryId: (p) => (p.categoryId ? toStr(p.categoryId) : null),
  },

  ProductSalesSummary: {
    productId: (p) => (p.productId ? toStr(p.productId) : null),
  },

  InventoryStockEntry: {
    item: (p) => p.item,
  },
};
