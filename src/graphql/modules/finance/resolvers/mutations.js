/**
 * finance/resolvers/mutations.js
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
    (_, { businessDate, openingCash, notes }, ctx) =>
      financeService.openCashSession({ businessDate, openingCash, notes }, ctx),
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
};
