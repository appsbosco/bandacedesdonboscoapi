/**
 * finance/resolvers/queries.js — v2
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

  cashBoxes: wrap(
    (_, { onlyActive }, ctx) =>
      financeService.getCashBoxes({ onlyActive }, ctx),
    "No se pudo listar cajas",
  ),

  financeAccounts: wrap(
    (_, { onlyActive, type }, ctx) =>
      financeService.getFinanceAccounts({ onlyActive, type }, ctx),
    "No se pudo listar cuentas financieras",
  ),

  inventoryItems: wrap(
    (_, { onlyActive }, ctx) =>
      financeService.getInventoryItems({ onlyActive }, ctx),
    "No se pudo listar ítems de inventario",
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

  cashSessionsByDate: wrap(
    (_, { businessDate }, ctx) =>
      financeService.getCashSessionsByDate(businessDate, ctx),
    "No se pudo listar sesiones del día",
  ),

  // ── Ventas / Egresos ──────────────────────────────────────────────────────
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

  // ── Inventario ────────────────────────────────────────────────────────────
  inventoryMovements: wrap(
    (_, { itemId, dateFrom, dateTo, type }, ctx) =>
      financeService.getInventoryMovements(
        { itemId, dateFrom, dateTo, type },
        ctx,
      ),
    "No se pudo listar movimientos de inventario",
  ),

  inventoryStock: wrap(
    (_, __, ctx) => financeService.getInventoryStock(ctx),
    "No se pudo obtener el stock de inventario",
  ),

  // ── Banco ─────────────────────────────────────────────────────────────────
  bankEntries: wrap((_, { accountId, dateFrom, dateTo }, ctx) => {
    const { BankEntry } = require("../../../models/BankEntry");
    // Delegamos directo al service via bankReport o creamos helper
    return (
      financeService.requireAuth(ctx) &&
      require("../../../models/BankEntry")
        .find({
          accountId,
          businessDate: {
            $gte: require("../services/finance.service").normalizeBusinessDate
              ? dateFrom
              : dateFrom,
            $lte: dateTo,
          },
          status: "ACTIVE",
        })
        .sort({ businessDate: 1, createdAt: 1 })
    );
  }, "No se pudo listar movimientos bancarios"),

  bankReport: wrap(
    (_, { accountId, dateFrom, dateTo }, ctx) =>
      financeService.getBankReport({ accountId, dateFrom, dateTo }, ctx),
    "No se pudo generar el reporte bancario",
  ),

  // ── Reportes principales ──────────────────────────────────────────────────
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

  // ── Reportes nuevos v2 ────────────────────────────────────────────────────
  activityPnLReport: wrap(
    (_, { activityId, dateFrom, dateTo }, ctx) =>
      financeService.getActivityPnLReport(
        { activityId, dateFrom, dateTo },
        ctx,
      ),
    "No se pudo generar el P&L de actividad",
  ),

  cashSessionReport: wrap(
    (_, { cashSessionId }, ctx) =>
      financeService.getCashSessionReport(cashSessionId, ctx),
    "No se pudo generar el reporte de sesión de caja",
  ),

  inventoryRangeReport: wrap(
    (_, { dateFrom, dateTo }, ctx) =>
      financeService.getInventoryRangeReport({ dateFrom, dateTo }, ctx),
    "No se pudo generar el reporte de inventario",
  ),
};
