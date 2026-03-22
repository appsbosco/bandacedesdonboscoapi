/**
 * src/graphql/modules/tourPayments/resolvers/types.js
 *
 * Field resolvers para los tipos del módulo financiero.
 * Maneja serialización de fechas y campos computados.
 */
"use strict";

const ParticipantInstallment = require("../../../../../models/ParticipantInstallment");

const toISO = (val) => {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
};

module.exports = {
  // ── TourPaymentPlan ─────────────────────────────────────────────────────────
  TourPaymentPlan: {
    id: (p) => p._id?.toString() ?? p.id,
    createdAt: (p) => toISO(p.createdAt),
    updatedAt: (p) => toISO(p.updatedAt),
    installments: (p) =>
      (p.installments || []).map((inst) => ({
        ...inst.toObject(),
        id: inst._id?.toString() ?? inst.id,
        dueDate: toISO(inst.dueDate),
      })),
  },

  // ── InstallmentTemplate ─────────────────────────────────────────────────────
  InstallmentTemplate: {
    id: (parent) => parent._id.toString(),
    dueDate: (t) => toISO(t.dueDate),
  },

  // ── ParticipantFinancialAccount ─────────────────────────────────────────────
  ParticipantFinancialAccount: {
    id: (a) => a._id?.toString() ?? a.id,
    createdAt: (a) => toISO(a.createdAt),
    updatedAt: (a) => toISO(a.updatedAt),
    installments: async (a) => {
      const participantId = a.participant?._id ?? a.participant;
      const tourId = a.tour?._id ?? a.tour;
      if (!participantId || !tourId) return [];

      return ParticipantInstallment.find({
        participant: participantId,
        tour: tourId,
      }).sort({ order: 1 });
    },
    adjustments: (a) =>
      (a.adjustments || []).map((adj) => ({
        ...adj,
        id: adj._id?.toString() ?? adj.id,
        appliedAt: toISO(adj.appliedAt),
      })),
  },

  // ── FinancialAdjustment ─────────────────────────────────────────────────────
  FinancialAdjustment: {
    id: (a) => a._id?.toString() ?? a.id,
    appliedAt: (a) => toISO(a.appliedAt),
  },

  // ── ParticipantInstallment ──────────────────────────────────────────────────
  ParticipantInstallment: {
    id: (i) => i._id?.toString() ?? i.id,
    dueDate: (i) => toISO(i.dueDate),
    paidAt: (i) => toISO(i.paidAt),
    createdAt: (i) => toISO(i.createdAt),
    updatedAt: (i) => toISO(i.updatedAt),
  },

  // ── TourPayment ─────────────────────────────────────────────────────────────
  TourPayment: {
    id: (p) => p._id?.toString() ?? p.id,
    paymentDate: (p) => toISO(p.paymentDate),
    createdAt: (p) => toISO(p.createdAt),
    updatedAt: (p) => toISO(p.updatedAt),
    appliedTo: (p) =>
      (p.appliedTo || []).map((entry) => ({
        installment: entry.installment,
        amountApplied: entry.amountApplied,
      })),
  },

  // ── PaymentDistribution ─────────────────────────────────────────────────────
  PaymentDistribution: {
    installment: (entry) => entry.installment,
  },

  // ── FinancialTableRow ───────────────────────────────────────────────────────
  FinancialTableRow: {
    installments: (row) =>
      (row.installments || []).map((cell) => ({
        ...cell,
        installmentId: cell.installmentId?.toString(),
        dueDate: toISO(cell.dueDate),
      })),
  },

  // ── FinancialTableColumn ────────────────────────────────────────────────────
  FinancialTableColumn: {
    dueDate: (col) => toISO(col.dueDate),
  },

  // ── FinancialTable ──────────────────────────────────────────────────────────
  FinancialTable: {
    columns: (table) =>
      (table.columns || []).map((col) => ({
        ...col,
        dueDate: toISO(col.dueDate),
      })),
  },
};
