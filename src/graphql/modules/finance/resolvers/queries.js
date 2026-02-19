/**
 * finance/resolvers/queries.js
 * Resolvers delgados — solo delegan a finance.service
 */
const financeService = require("../services/finance.service");

function wrap(fn, fallback) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error("[finance.query]", err.message);
      throw new Error(err.message || fallback);
    }
  };
}

module.exports = {
  // ── Catálogos ─────────────────────────────────────────────────────────────
  categories: wrap(
    (_, { onlyActive }, ctx) =>
      financeService.getCategories({ onlyActive }, ctx),
    "No se pudo listar categorías",
  ),

  activities: wrap(
    (_, { onlyActive }, ctx) =>
      financeService.getActivities({ onlyActive }, ctx),
    "No se pudo listar actividades",
  ),

  // ── Sesiones ──────────────────────────────────────────────────────────────
  cashSessionDetail: wrap(
    (_, { businessDate, cashSessionId }, ctx) =>
      financeService.getCashSessionDetail({ businessDate, cashSessionId }, ctx),
    "No se pudo obtener la sesión de caja",
  ),

  cashSessions: wrap(
    (_, { dateFrom, dateTo }, ctx) =>
      financeService.getCashSessions({ dateFrom, dateTo }, ctx),
    "No se pudo listar sesiones de caja",
  ),

  // ── Ventas / Egresos del día ───────────────────────────────────────────────
  salesByDate: wrap(
    (_, { businessDate }, ctx) =>
      financeService.getSalesByDate(businessDate, ctx),
    "No se pudo obtener ventas del día",
  ),

  expensesByDate: wrap(
    (_, { businessDate }, ctx) =>
      financeService.getExpensesByDate(businessDate, ctx),
    "No se pudo obtener egresos del día",
  ),

  // ── Reportes ──────────────────────────────────────────────────────────────
  dailySummary: wrap(
    (_, { businessDate }, ctx) =>
      financeService.getDailySummary(businessDate, ctx),
    "No se pudo generar el resumen diario",
  ),

  rangeSummary: wrap(
    (_, { dateFrom, dateTo }, ctx) =>
      financeService.getRangeSummary({ dateFrom, dateTo }, ctx),
    "No se pudo generar el resumen por rango",
  ),

  productSalesReport: wrap(
    (_, { dateFrom, dateTo }, ctx) =>
      financeService.getProductSalesReport({ dateFrom, dateTo }, ctx),
    "No se pudo generar el reporte de productos",
  ),

  expenseReport: wrap(
    (_, { dateFrom, dateTo }, ctx) =>
      financeService.getExpenseReport({ dateFrom, dateTo }, ctx),
    "No se pudo generar el reporte de egresos",
  ),

  monthlyReportDataset: wrap(
    (_, { month, year }, ctx) =>
      financeService.buildMonthlyReportDataset(month, year, ctx),
    "No se pudo generar el dataset mensual",
  ),
};
