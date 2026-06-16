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

  deleteAcademicSubject: async (_, { id }, ctx) => {
    try {
      return await svc.deleteAcademicSubject(id, ctx);
    } catch (e) {
      console.error("[mutation:deleteAcademicSubject]", e.message);
      throw new Error(e.message || "Error al eliminar materia");
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

  createAcademicAssessmentSlot: async (_, { input }, ctx) => {
    try {
      return await svc.createAcademicAssessmentSlot(input, ctx);
    } catch (e) {
      console.error("[mutation:createAcademicAssessmentSlot]", e.message);
      throw new Error(e.message || "Error al crear slot académico");
    }
  },

  updateAcademicAssessmentSlot: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateAcademicAssessmentSlot(id, input, ctx);
    } catch (e) {
      console.error("[mutation:updateAcademicAssessmentSlot]", e.message);
      throw new Error(e.message || "Error al actualizar slot académico");
    }
  },

  deleteOrDeactivateAcademicAssessmentSlot: async (_, { id }, ctx) => {
    try {
      return await svc.deleteOrDeactivateAcademicAssessmentSlot(id, ctx);
    } catch (e) {
      console.error("[mutation:deleteOrDeactivateAcademicAssessmentSlot]", e.message);
      throw new Error(e.message || "Error al eliminar o desactivar slot académico");
    }
  },

  seedAcademicRulesForYear: async (_, { year }, ctx) => {
    try {
      return await svc.seedAcademicRulesForYear(year, ctx);
    } catch (e) {
      console.error("[mutation:seedAcademicRulesForYear]", e.message);
      throw new Error(e.message || "Error al inicializar reglas académicas");
    }
  },

  activateAcademicSemester: async (_, { year, semester }, ctx) => {
    try {
      return await svc.activateAcademicSemester(year, semester, ctx);
    } catch (e) {
      console.error("[mutation:activateAcademicSemester]", e.message);
      throw new Error(e.message || "Error al habilitar semestre");
    }
  },

  deactivateAcademicSemester: async (_, { year, semester }, ctx) => {
    try {
      return await svc.deactivateAcademicSemester(year, semester, ctx);
    } catch (e) {
      console.error("[mutation:deactivateAcademicSemester]", e.message);
      throw new Error(e.message || "Error al deshabilitar semestre");
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

  updateAcademicEvaluationAsAdmin: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateAcademicEvaluationAsAdmin(id, input, ctx);
    } catch (e) {
      console.error("[mutation:updateAcademicEvaluationAsAdmin]", e.message);
      throw new Error(e.message || "Error al actualizar evaluación");
    }
  },

  deleteAcademicEvaluationAsAdmin: async (_, { id }, ctx) => {
    try {
      return await svc.deleteAcademicEvaluationAsAdmin(id, ctx);
    } catch (e) {
      console.error("[mutation:deleteAcademicEvaluationAsAdmin]", e.message);
      throw new Error(e.message || "Error al eliminar evaluación");
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
