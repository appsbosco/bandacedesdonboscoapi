/**
 * finance/resolvers/committee-budget.queries.js
 *
 * Resolvers de queries para el módulo de presupuestos por comités.
 * Patrón: delegados delgados. Igual que queries.js existente.
 */

"use strict";

const committeeBudgetService = require("../services/committee-budget.service");

function wrap(fn, fallback) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error("[committee-budget.query]", err.message);
      throw new Error(err.message || fallback);
    }
  };
}

module.exports = {
  // ── Comités ──────────────────────────────────────────────────────────────────

  committees: wrap(
    (_, { onlyActive }, ctx) =>
      committeeBudgetService.getCommittees(
        { onlyActive: onlyActive !== false },
        ctx,
      ),
    "No se pudo listar los comités",
  ),

  committeeDistributionConfig: wrap(
    (_, __, ctx) => committeeBudgetService.getCommitteeDistributionConfig(ctx),
    "No se pudo obtener la configuración de distribución",
  ),

  // ── Presupuesto global ────────────────────────────────────────────────────────

  allCommitteeBudgets: wrap(
    (_, __, ctx) => committeeBudgetService.getAllCommitteeBudgets(ctx),
    "No se pudo obtener el resumen de presupuestos",
  ),

  committeeBudgetSummary: wrap(
    (_, { committeeId }, ctx) =>
      committeeBudgetService.getCommitteeBudgetSummary({ committeeId }, ctx),
    "No se pudo obtener el resumen del comité",
  ),

  committeeLedger: wrap(
    (_, { committeeId, dateFrom, dateTo, entryType }, ctx) =>
      committeeBudgetService.getCommitteeLedger(
        { committeeId, dateFrom, dateTo, entryType },
        ctx,
      ),
    "No se pudo obtener el ledger del comité",
  ),

  // ── Saldo inicial ─────────────────────────────────────────────────────────────

  budgetInitialization: wrap(
    (_, __, ctx) => committeeBudgetService.getBudgetInitialization(ctx),
    "No se pudo obtener el saldo inicial",
  ),

  // ── Actividades ───────────────────────────────────────────────────────────────

  activityProfitCalculation: wrap(
    (_, { activityId, dateFrom, dateTo }, ctx) =>
      committeeBudgetService.calculateActivityProfit(
        { activityId, dateFrom, dateTo },
        ctx,
      ),
    "No se pudo calcular la utilidad de la actividad",
  ),

  activitiesPendingSettlement: wrap(
    (_, { dateFrom, dateTo }, ctx) =>
      committeeBudgetService.getActivitiesPendingSettlement(
        { dateFrom, dateTo },
        ctx,
      ),
    "No se pudo obtener las actividades pendientes de liquidación",
  ),

  activitySettlement: wrap(
    (_, { activityId }, ctx) =>
      committeeBudgetService.getActivitySettlement({ activityId }, ctx),
    "No se pudo obtener el settlement de la actividad",
  ),

  allActivitySettlements: wrap(
    (_, { dateFrom, dateTo }, ctx) =>
      committeeBudgetService.getAllActivitySettlements(
        { dateFrom, dateTo },
        ctx,
      ),
    "No se pudo listar los settlements",
  ),
};
