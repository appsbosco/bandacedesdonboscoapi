/**
 * finance/resolvers/committee-budget.mutations.js
 *
 * Resolvers de mutaciones para el módulo de presupuestos por comités.
 * Patrón: delegados delgados que solo llaman al service. Igual que mutations.js existente.
 */

"use strict";

const committeeBudgetService = require("../services/committee-budget.service");

function wrap(fn, fallback) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error("[committee-budget.mutation]", err.message);
      throw new Error(err.message || fallback);
    }
  };
}

module.exports = {
  // ── Configuración de comités ────────────────────────────────────────────────

  seedCommittees: wrap(
    (_, __, ctx) => committeeBudgetService.seedCommittees(ctx),
    "No se pudieron inicializar los comités por defecto",
  ),

  createCommittee: wrap(
    (_, { input }, ctx) => committeeBudgetService.createCommittee(input, ctx),
    "No se pudo crear el comité",
  ),

  updateCommitteeDistributionConfig: wrap(
    (_, { updates }, ctx) =>
      committeeBudgetService.updateCommitteeDistributionConfig(updates, ctx),
    "No se pudo actualizar la configuración de distribución",
  ),

  // ── Saldo inicial ───────────────────────────────────────────────────────────

  initializeCommitteeBudgets: wrap(
    (_, { input }, ctx) =>
      committeeBudgetService.initializeCommitteeBudgets(input, ctx),
    "No se pudo inicializar el presupuesto de comités",
  ),

  // ── Utilidad de actividades ─────────────────────────────────────────────────

  distributeActivityProfit: wrap(
    (_, { input }, ctx) =>
      committeeBudgetService.distributeActivityProfit(input, ctx),
    "No se pudo distribuir la utilidad de la actividad",
  ),

  // ── Gastos por comité ───────────────────────────────────────────────────────

  recordCommitteeExpense: wrap(
    (_, { input }, ctx) =>
      committeeBudgetService.recordCommitteeExpense(input, ctx),
    "No se pudo registrar el gasto al comité",
  ),
};
