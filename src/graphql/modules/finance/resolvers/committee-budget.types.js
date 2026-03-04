/**
 * finance/resolvers/committee-budget.types.js
 *
 * Field-level resolvers para los nuevos tipos GraphQL del módulo de comités.
 * Sigue el mismo patrón que types.js existente: _id → id, fechas a String.
 */

"use strict";

const toId = (p) => String(p._id || p.id || "");
const toStr = (v) => (v ? String(v) : null);

const sharedFields = {
  id: toId,
  createdAt: (p) => toStr(p.createdAt),
  //   updatedAt: (p) => toStr(p.updatedAt),
};

module.exports = {
  Committee: {
    ...sharedFields,
    distributionPercentage: (p) => p.distributionPercentage ?? 0,
    displayOrder: (p) => p.displayOrder ?? 0,
  },

  CommitteeLedgerEntry: {
    ...sharedFields,
    committeeId: (p) => toStr(p.committeeId),
    budgetInitializationId: (p) => toStr(p.budgetInitializationId),
    activitySettlementId: (p) => toStr(p.activitySettlementId),
    activityId: (p) => toStr(p.activityId),
    expenseId: (p) => toStr(p.expenseId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
    creditAmount: (p) => p.creditAmount ?? 0,
    debitAmount: (p) => p.debitAmount ?? 0,
    runningBalance: (p) => p.runningBalance ?? 0,
  },

  DistributionSnapshot: {
    committeeId: (p) => toStr(p.committeeId),
    ledgerEntryId: (p) => toStr(p.ledgerEntryId),
    amount: (p) => p.amount ?? 0,
    percentage: (p) => p.percentage ?? 0,
  },

  BudgetInitialization: {
    ...sharedFields,
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
    distributionSnapshot: (p) => p.distributionSnapshot || [],
  },

  ActivitySettlement: {
    ...sharedFields,
    activityId: (p) => toStr(p.activityId),
    voidedAt: (p) => toStr(p.voidedAt),
    createdBy: (p) => toStr(p.createdBy),
    distributionSnapshot: (p) => p.distributionSnapshot || [],
    inventoryCostConsumed: (p) => p.inventoryCostConsumed ?? 0,
    totalDistributed: (p) => p.totalDistributed ?? 0,
    calculatedFromDate: (p) => toStr(p.calculatedFromDate),
    calculatedToDate: (p) => toStr(p.calculatedToDate),
  },

  ActivityProfitCalculation: {
    activityId: (p) => toStr(p.activityId),
    settlementId: (p) => toStr(p.settlementId),
    settlementDate: (p) => toStr(p.settlementDate),
    inventoryCostConsumed: (p) => p.inventoryCostConsumed ?? 0,
    netProfit: (p) => p.netProfit ?? 0,
    dateFrom: (p) => toStr(p.dateFrom),
    dateTo: (p) => toStr(p.dateTo),
  },

  CommitteeBudgetSummary: {
    initialAllocation: (p) => p.initialAllocation ?? 0,
    utilityDistributions: (p) => p.utilityDistributions ?? 0,
    manualCredits: (p) => p.manualCredits ?? 0,
    totalCredits: (p) => p.totalCredits ?? 0,
    expenseDebits: (p) => p.expenseDebits ?? 0,
    manualDebits: (p) => p.manualDebits ?? 0,
    totalDebits: (p) => p.totalDebits ?? 0,
    currentBalance: (p) => p.currentBalance ?? 0,
    entryCount: (p) => p.entryCount ?? 0,
  },

  CommitteeLedger: {
    entries: (p) => p.entries || [],
    currentBalance: (p) => p.currentBalance ?? 0,
    totalCredits: (p) => p.totalCredits ?? 0,
    totalDebits: (p) => p.totalDebits ?? 0,
    entryCount: (p) => p.entryCount ?? 0,
  },

  CommitteeDistributionConfig: {
    totalPercentage: (p) => p.totalPercentage ?? 0,
    isValid: (p) => p.isValid ?? false,
    committees: (p) => p.committees || [],
  },

  AllCommitteeBudgetsSummary: {
    committees: (p) => p.committees || [],
    totalBudget: (p) => p.totalBudget ?? 0,
    totalExpended: (p) => p.totalExpended ?? 0,
    totalAvailable: (p) => p.totalAvailable ?? 0,
    isInitialized: (p) => p.isInitialized ?? false,
    initialization: (p) => p.initialization || null,
  },
};
