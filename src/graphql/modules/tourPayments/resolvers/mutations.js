/**
 * src/graphql/modules/tourPayments/resolvers/mutations.js
 */
"use strict";

const svc = require("../services/tourPayments.service");

module.exports = {
  // ── Payment Plans ───────────────────────────────────────────────────────────
  createPaymentPlan: async (_, { input }, ctx) => {
    try {
      return await svc.createPaymentPlan(input, ctx);
    } catch (err) {
      console.error("[mutation:createPaymentPlan]", err.message);
      throw new Error(err.message || "No se pudo crear el plan de pagos");
    }
  },

  updatePaymentPlan: async (_, { id, input }, ctx) => {
    try {
      return await svc.updatePaymentPlan(id, input, ctx);
    } catch (err) {
      console.error("[mutation:updatePaymentPlan]", err.message);
      throw new Error(err.message || "No se pudo actualizar el plan de pagos");
    }
  },

  deletePaymentPlan: async (_, { id }, ctx) => {
    try {
      return await svc.deletePaymentPlan(id, ctx);
    } catch (err) {
      console.error("[mutation:deletePaymentPlan]", err.message);
      throw new Error(err.message || "No se pudo eliminar el plan de pagos");
    }
  },

  // ── Financial Accounts ──────────────────────────────────────────────────────
  createFinancialAccount: async (_, { input }, ctx) => {
    try {
      return await svc.createFinancialAccount(input, ctx);
    } catch (err) {
      console.error("[mutation:createFinancialAccount]", err.message);
      throw new Error(err.message || "No se pudo crear la cuenta financiera");
    }
  },

  updateFinancialAccount: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateFinancialAccount(id, input, ctx);
    } catch (err) {
      console.error("[mutation:updateFinancialAccount]", err.message);
      throw new Error(
        err.message || "No se pudo actualizar la cuenta financiera",
      );
    }
  },

  createFinancialAccountsForAll: async (
    _,
    { tourId, baseAmount, planId },
    ctx,
  ) => {
    try {
      return await svc.createFinancialAccountsForAll(
        tourId,
        baseAmount,
        planId,
        ctx,
      );
    } catch (err) {
      console.error("[mutation:createFinancialAccountsForAll]", err.message);
      throw new Error(err.message || "No se pudo ejecutar la operación masiva");
    }
  },

  // ── Installment Plan Assignment ─────────────────────────────────────────────
  assignPaymentPlan: async (_, { participantId, tourId, planId }, ctx) => {
    try {
      return await svc.assignPaymentPlan(participantId, tourId, planId, ctx);
    } catch (err) {
      console.error("[mutation:assignPaymentPlan]", err.message);
      throw new Error(err.message || "No se pudo asignar el plan de pagos");
    }
  },

  assignDefaultPlanToAll: async (_, { tourId }, ctx) => {
    try {
      return await svc.assignDefaultPlanToAll(tourId, ctx);
    } catch (err) {
      console.error("[mutation:assignDefaultPlanToAll]", err.message);
      throw new Error(err.message || "No se pudo asignar el plan por defecto");
    }
  },

  // ── Installment Edits ───────────────────────────────────────────────────────
  updateInstallment: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateInstallment(id, input, ctx);
    } catch (err) {
      console.error("[mutation:updateInstallment]", err.message);
      throw new Error(err.message || "No se pudo actualizar la cuota");
    }
  },

  // ── Payments ────────────────────────────────────────────────────────────────
  registerPayment: async (_, { input }, ctx) => {
    try {
      return await svc.registerPayment(input, ctx);
    } catch (err) {
      console.error("[mutation:registerPayment]", err.message);
      throw new Error(err.message || "No se pudo registrar el pago");
    }
  },

  deleteTourPayment: async (_, { id }, ctx) => {
    try {
      return await svc.deleteTourPayment(id, ctx);
    } catch (err) {
      console.error("[mutation:deleteTourPayment]", err.message);
      throw new Error(err.message || "No se pudo eliminar el pago");
    }
  },
};
