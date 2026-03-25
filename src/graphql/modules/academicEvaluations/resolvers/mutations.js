"use strict";

const svc = require("../services/academicEvaluations.service");

module.exports = {
  createAcademicSubject: async (_, { input }, ctx) => {
    try {
      return await svc.createAcademicSubject(input, ctx);
    } catch (e) {
      console.error("[mutation:createAcademicSubject]", e.message);
      throw new Error(e.message || "Error al crear materia");
    }
  },

  updateAcademicSubject: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateAcademicSubject(id, input, ctx);
    } catch (e) {
      console.error("[mutation:updateAcademicSubject]", e.message);
      throw new Error(e.message || "Error al actualizar materia");
    }
  },

  createAcademicPeriod: async (_, { input }, ctx) => {
    try {
      return await svc.createAcademicPeriod(input, ctx);
    } catch (e) {
      console.error("[mutation:createAcademicPeriod]", e.message);
      throw new Error(e.message || "Error al crear período");
    }
  },

  updateAcademicPeriod: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateAcademicPeriod(id, input, ctx);
    } catch (e) {
      console.error("[mutation:updateAcademicPeriod]", e.message);
      throw new Error(e.message || "Error al actualizar período");
    }
  },

  submitAcademicEvaluation: async (_, { input }, ctx) => {
    try {
      return await svc.submitAcademicEvaluation(input, ctx);
    } catch (e) {
      console.error("[mutation:submitAcademicEvaluation]", e.message);
      throw new Error(e.message || "Error al registrar evaluación");
    }
  },

  updateOwnPendingAcademicEvaluation: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateOwnPendingEvaluation(id, input, ctx);
    } catch (e) {
      console.error("[mutation:updateOwnPendingAcademicEvaluation]", e.message);
      throw new Error(e.message || "Error al actualizar evaluación");
    }
  },

  deleteOwnPendingAcademicEvaluation: async (_, { id }, ctx) => {
    try {
      return await svc.deleteOwnPendingEvaluation(id, ctx);
    } catch (e) {
      console.error("[mutation:deleteOwnPendingAcademicEvaluation]", e.message);
      throw new Error(e.message || "Error al eliminar evaluación");
    }
  },

  reviewAcademicEvaluation: async (_, { id, status, reviewComment }, ctx) => {
    try {
      return await svc.reviewAcademicEvaluation(id, status, reviewComment, ctx);
    } catch (e) {
      console.error("[mutation:reviewAcademicEvaluation]", e.message);
      throw new Error(e.message || "Error al revisar evaluación");
    }
  },

  acknowledgeChildAcademicPerformance: async (_, { childId, periodId, comment }, ctx) => {
    try {
      return await svc.acknowledgeChildPerformance(childId, periodId, comment, ctx);
    } catch (e) {
      console.error("[mutation:acknowledgeChildAcademicPerformance]", e.message);
      throw new Error(e.message || "Error al registrar acuse");
    }
  },
};
