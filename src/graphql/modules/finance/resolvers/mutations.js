/**
 * finance/resolvers/mutations.js — v2
 * Resolvers delgados — solo delegan a finance.service
 */
const financeService = require("../services/finance.service");

function wrap(fn, fallback) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error("[finance.mutation]", err.message);
      throw new Error(err.message || fallback);
    }
  };
}

module.exports = {
  // ── Caja ──────────────────────────────────────────────────────────────────
  openCashSession: wrap(
    (_, { businessDate, cashBoxId, openingCash, notes }, ctx) =>
      financeService.openCashSession(
        { businessDate, cashBoxId, openingCash, notes },
        ctx,
      ),
    "No se pudo abrir la sesión de caja",
  ),

  closeCashSession: wrap(
    (_, { input }, ctx) => financeService.closeCashSession(input, ctx),
    "No se pudo cerrar la sesión de caja",
  ),

  // ── Ventas ────────────────────────────────────────────────────────────────
  recordSale: wrap(
    (_, { input }, ctx) => financeService.recordSale(input, ctx),
    "No se pudo registrar la venta",
  ),

  voidSale: wrap(
    (_, { saleId, reason }, ctx) =>
      financeService.voidSale(saleId, reason, ctx),
    "No se pudo anular la venta",
  ),

  refundSale: wrap(
    (_, { saleId, reason }, ctx) =>
      financeService.refundSale(saleId, reason, ctx),
    "No se pudo procesar el reembolso",
  ),

  // ── Egresos ───────────────────────────────────────────────────────────────
  recordExpense: wrap(
    (_, { input }, ctx) => financeService.recordExpense(input, ctx),
    "No se pudo registrar el egreso",
  ),

  voidExpense: wrap(
    (_, { expenseId, reason }, ctx) =>
      financeService.voidExpense(expenseId, reason, ctx),
    "No se pudo anular el egreso",
  ),

  // ── Catálogos ─────────────────────────────────────────────────────────────
  createCategory: wrap(
    (_, { input }, ctx) => financeService.createCategory(input, ctx),
    "No se pudo crear la categoría",
  ),

  createActivity: wrap(
    (_, { input }, ctx) => financeService.createActivity(input, ctx),
    "No se pudo crear la actividad",
  ),

  toggleCategoryActive: wrap(
    (_, { id }, ctx) => financeService.toggleCategoryActive(id, ctx),
    "No se pudo modificar la categoría",
  ),

  toggleActivityActive: wrap(
    (_, { id }, ctx) => financeService.toggleActivityActive(id, ctx),
    "No se pudo modificar la actividad",
  ),

  // ── CashBox ───────────────────────────────────────────────────────────────
  createCashBox: wrap(
    (_, { input }, ctx) => financeService.createCashBox(input, ctx),
    "No se pudo crear la caja",
  ),

  toggleCashBoxActive: wrap(
    (_, { id }, ctx) => financeService.toggleCashBoxActive(id, ctx),
    "No se pudo modificar la caja",
  ),

  // ── FinanceAccount ────────────────────────────────────────────────────────
  createFinanceAccount: wrap(
    (_, { input }, ctx) => financeService.createFinanceAccount(input, ctx),
    "No se pudo crear la cuenta financiera",
  ),

  toggleFinanceAccountActive: wrap(
    (_, { id }, ctx) => financeService.toggleFinanceAccountActive(id, ctx),
    "No se pudo modificar la cuenta financiera",
  ),

  // ── Banco ─────────────────────────────────────────────────────────────────
  recordBankEntry: wrap(
    (_, { input }, ctx) => financeService.recordBankEntry(input, ctx),
    "No se pudo registrar el movimiento bancario",
  ),

  voidBankEntry: wrap(
    (_, { entryId, reason }, ctx) =>
      financeService.voidBankEntry(entryId, reason, ctx),
    "No se pudo anular el movimiento bancario",
  ),

  transferCashToBank: wrap(
    (_, { cashSessionId, accountId, amount, concept, businessDate }, ctx) =>
      financeService.transferCashToBank(
        { cashSessionId, accountId, amount, concept, businessDate },
        ctx,
      ),
    "No se pudo procesar la transferencia caja→banco",
  ),

  transferBankToCash: wrap(
    (_, { accountId, cashSessionId, amount, concept, businessDate }, ctx) =>
      financeService.transferBankToCash(
        { accountId, cashSessionId, amount, concept, businessDate },
        ctx,
      ),
    "No se pudo procesar la transferencia banco→caja",
  ),

  // ── Inventario ────────────────────────────────────────────────────────────
  createInventoryItem: wrap(
    (_, { input }, ctx) => financeService.createInventoryItem(input, ctx),
    "No se pudo crear el ítem de inventario",
  ),

  toggleInventoryItemActive: wrap(
    (_, { id }, ctx) => financeService.toggleInventoryItemActive(id, ctx),
    "No se pudo modificar el ítem de inventario",
  ),

  recordInventoryConsumption: wrap(
    (_, { input }, ctx) =>
      financeService.recordInventoryConsumption(input, ctx),
    "No se pudo registrar el consumo de inventario",
  ),

  recordDonationInKind: wrap(
    (_, { input }, ctx) => financeService.recordDonationInKind(input, ctx),
    "No se pudo registrar la donación en especie",
  ),

  recordInventoryShrinkage: wrap(
    (_, { itemId, quantity, businessDate, concept, detail }, ctx) =>
      financeService.recordInventoryShrinkage(
        { itemId, quantity, businessDate, concept, detail },
        ctx,
      ),
    "No se pudo registrar la merma",
  ),

  voidInventoryMovement: wrap(
    (_, { movementId, reason }, ctx) =>
      financeService.voidInventoryMovement(movementId, reason, ctx),
    "No se pudo anular el movimiento de inventario",
  ),
};
