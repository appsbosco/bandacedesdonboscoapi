/**
 * src/graphql/modules/tourPayments/resolvers/queries.js
 */
"use strict";

const svc = require("../services/tourPayments.service");

module.exports = {
  // ── Payment Plans ───────────────────────────────────────────────────────────
  getPaymentPlan: async (_, { id }, ctx) => {
    try {
      return await svc.getPaymentPlan(id, ctx);
    } catch (err) {
      console.error("[query:getPaymentPlan]", err.message);
      throw new Error(err.message || "No se pudo obtener el plan de pagos");
    }
  },

  getPaymentPlansByTour: async (_, { tourId }, ctx) => {
    try {
      return await svc.getPaymentPlansByTour(tourId, ctx);
    } catch (err) {
      console.error("[query:getPaymentPlansByTour]", err.message);
      throw new Error(
        err.message || "No se pudieron obtener los planes de pagos",
      );
    }
  },

  // ── Financial Accounts ──────────────────────────────────────────────────────
  getFinancialAccount: async (_, { participantId, tourId }, ctx) => {
    try {
      return await svc.getFinancialAccount(participantId, tourId, ctx);
    } catch (err) {
      console.error("[query:getFinancialAccount]", err.message);
      throw new Error(err.message || "No se pudo obtener la cuenta financiera");
    }
  },

  getFinancialAccountsByTour: async (_, { tourId, filter }, ctx) => {
    try {
      return await svc.getFinancialAccountsByTour(tourId, ctx, filter || {});
    } catch (err) {
      console.error("[query:getFinancialAccountsByTour]", err.message);
      throw new Error(
        err.message || "No se pudieron obtener las cuentas financieras",
      );
    }
  },

  // ── Installments ────────────────────────────────────────────────────────────
  getInstallmentsByParticipant: async (_, { participantId, tourId }, ctx) => {
    try {
      return await svc.getInstallmentsByParticipant(participantId, tourId, ctx);
    } catch (err) {
      console.error("[query:getInstallmentsByParticipant]", err.message);
      throw new Error(err.message || "No se pudieron obtener las cuotas");
    }
  },

  // ── Payments ────────────────────────────────────────────────────────────────
  getTourPayments: async (_, { tourId }, ctx) => {
    try {
      return await svc.getTourPayments(tourId, ctx);
    } catch (err) {
      console.error("[query:getTourPayments]", err.message);
      throw new Error(err.message || "No se pudieron obtener los pagos");
    }
  },

  getPaymentsByParticipant: async (_, { participantId, tourId }, ctx) => {
    try {
      return await svc.getPaymentsByParticipant(participantId, tourId, ctx);
    } catch (err) {
      console.error("[query:getPaymentsByParticipant]", err.message);
      throw new Error(
        err.message || "No se pudieron obtener los pagos del participante",
      );
    }
  },

  // ── Reports ─────────────────────────────────────────────────────────────────
  getFinancialTable: async (_, { tourId }, ctx) => {
    try {
      return await svc.getFinancialTable(tourId, ctx);
    } catch (err) {
      console.error("[query:getFinancialTable]", err.message);
      throw new Error(err.message || "No se pudo generar la tabla financiera");
    }
  },

  getFinancialSummary: async (_, { tourId }, ctx) => {
    try {
      return await svc.getFinancialSummary(tourId, ctx);
    } catch (err) {
      console.error("[query:getFinancialSummary]", err.message);
      throw new Error(
        err.message || "No se pudo generar el resumen financiero",
      );
    }
  },

  getPaymentFlow: async (_, { tourId }, ctx) => {
    try {
      return await svc.getPaymentFlow(tourId, ctx);
    } catch (err) {
      console.error("[query:getPaymentFlow]", err.message);
      throw new Error(err.message || "No se pudo obtener el flujo de pagos");
    }
  },

  getParticipantsByFinancialStatus: async (_, { tourId, status }, ctx) => {
    try {
      return await svc.getParticipantsByFinancialStatus(tourId, status, ctx);
    } catch (err) {
      console.error("[query:getParticipantsByFinancialStatus]", err.message);
      throw new Error(
        err.message || "No se pudo obtener el listado de participantes",
      );
    }
  },
};
