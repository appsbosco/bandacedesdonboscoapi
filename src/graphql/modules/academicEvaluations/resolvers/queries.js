"use strict";

const svc = require("../services/academicEvaluations.service");

module.exports = {
  academicSubjects: async (_, { grade, isActive }, ctx) => {
    try {
      return await svc.getAcademicSubjects({ grade, isActive }, ctx);
    } catch (e) {
      console.error("[query:academicSubjects]", e.message);
      throw new Error(e.message || "Error al obtener materias");
    }
  },

  academicPeriods: async (_, { year, isActive }, ctx) => {
    try {
      return await svc.getAcademicPeriods({ year, isActive }, ctx);
    } catch (e) {
      console.error("[query:academicPeriods]", e.message);
      throw new Error(e.message || "Error al obtener períodos");
    }
  },

  myAcademicEvaluations: async (_, { filter }, ctx) => {
    try {
      return await svc.getMyEvaluations(filter || {}, ctx);
    } catch (e) {
      console.error("[query:myAcademicEvaluations]", e.message);
      throw new Error(e.message || "Error al obtener tus evaluaciones");
    }
  },

  myAcademicPerformance: async (_, { periodId, year }, ctx) => {
    try {
      return await svc.getMyPerformance(periodId, year, ctx);
    } catch (e) {
      console.error("[query:myAcademicPerformance]", e.message);
      throw new Error(e.message || "Error al calcular rendimiento");
    }
  },

  studentAcademicEvaluations: async (_, { studentId, filter }, ctx) => {
    try {
      return await svc.getStudentEvaluations(studentId, filter || {}, ctx);
    } catch (e) {
      console.error("[query:studentAcademicEvaluations]", e.message);
      throw new Error(e.message || "Error al obtener evaluaciones del estudiante");
    }
  },

  studentAcademicPerformance: async (_, { studentId, periodId, year }, ctx) => {
    try {
      return await svc.getStudentPerformance(studentId, periodId, year, ctx);
    } catch (e) {
      console.error("[query:studentAcademicPerformance]", e.message);
      throw new Error(e.message || "Error al obtener rendimiento del estudiante");
    }
  },

  adminAcademicDashboard: async (_, { filter }, ctx) => {
    try {
      return await svc.getAdminDashboard(filter || {}, ctx);
    } catch (e) {
      console.error("[query:adminAcademicDashboard]", e.message);
      throw new Error(e.message || "Error al cargar dashboard académico");
    }
  },

  adminPendingEvaluations: async (_, { filter }, ctx) => {
    try {
      return await svc.getAdminPendingEvaluations(filter || {}, ctx);
    } catch (e) {
      console.error("[query:adminPendingEvaluations]", e.message);
      throw new Error(e.message || "Error al obtener evaluaciones pendientes");
    }
  },

  adminAcademicRiskRanking: async (_, { filter, limit }, ctx) => {
    try {
      return await svc.getAdminRiskRanking(filter || {}, limit || 20, ctx);
    } catch (e) {
      console.error("[query:adminAcademicRiskRanking]", e.message);
      throw new Error(e.message || "Error al obtener ranking de riesgo");
    }
  },

  parentChildrenAcademicOverview: async (_, { periodId, year }, ctx) => {
    try {
      return await svc.getParentChildrenOverview(periodId, year, ctx);
    } catch (e) {
      console.error("[query:parentChildrenAcademicOverview]", e.message);
      throw new Error(e.message || "Error al obtener resumen académico de hijos");
    }
  },
};
