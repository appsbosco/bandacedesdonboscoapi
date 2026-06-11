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

  getAcademicAssessmentSlots: async (_, { academicYear, semester, isActive }, ctx) => {
    try {
      return await svc.getAcademicAssessmentSlots({ academicYear, semester, isActive }, ctx);
    } catch (e) {
      console.error("[query:getAcademicAssessmentSlots]", e.message);
      throw new Error(e.message || "Error al obtener slots académicos");
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

  myAcademicEvaluationCoverage: async (_, { year }, ctx) => {
    try {
      return await svc.getMyEvaluationCoverage(year, ctx);
    } catch (e) {
      console.error("[query:myAcademicEvaluationCoverage]", e.message);
      throw new Error(e.message || "Error al calcular evaluaciones faltantes");
    }
  },

  getMyAcademicRequirements: async (_, { academicYear, semester }, ctx) => {
    try {
      return await svc.getMyAcademicRequirements(academicYear, semester, ctx);
    } catch (e) {
      console.error("[query:getMyAcademicRequirements]", e.message);
      throw new Error(e.message || "Error al calcular requisitos académicos");
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

  getStudentAcademicRequirements: async (_, { studentId, academicYear, semester }, ctx) => {
    try {
      return await svc.getStudentAcademicRequirements(studentId, academicYear, semester, ctx);
    } catch (e) {
      console.error("[query:getStudentAcademicRequirements]", e.message);
      throw new Error(e.message || "Error al calcular requisitos académicos del estudiante");
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

  evaluationDetail: async (_, { id }, ctx) => {
    try {
      return await svc.getEvaluationDetail(id, ctx);
    } catch (e) {
      console.error("[query:evaluationDetail]", e.message);
      throw new Error(e.message || "Error al obtener detalle de evaluación");
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

  adminPendingEvaluationsPaginated: async (_, { filter, pagination }, ctx) => {
    try {
      return await svc.getAdminPendingEvaluationsPaginated(filter || {}, pagination || {}, ctx);
    } catch (e) {
      console.error("[query:adminPendingEvaluationsPaginated]", e.message);
      throw new Error(e.message || "Error al obtener evaluaciones pendientes paginadas");
    }
  },

  adminAcademicStudents: async (_, { filter }, ctx) => {
    try {
      return await svc.getAdminAcademicStudents(filter || {}, ctx);
    } catch (e) {
      console.error("[query:adminAcademicStudents]", e.message);
      throw new Error(e.message || "Error al obtener estudiantes académicos");
    }
  },

  getAdminAcademicCoverage: async (_, { filter }, ctx) => {
    try {
      return await svc.getAdminAcademicCoverage(filter || {}, ctx);
    } catch (e) {
      console.error("[query:getAdminAcademicCoverage]", e.message);
      throw new Error(e.message || "Error al obtener cobertura académica");
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

  parentChildEvaluations: async (_, { childId, filter }, ctx) => {
    try {
      return await svc.getParentChildEvaluations(childId, filter || {}, ctx);
    } catch (e) {
      console.error("[query:parentChildEvaluations]", e.message);
      throw new Error(e.message || "Error al obtener evaluaciones del hijo");
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

  sectionInstrumentAcademicOverview: async (_, { periodId, year }, ctx) => {
    try {
      return await svc.getSectionInstrumentOverview(periodId, year, ctx);
    } catch (e) {
      console.error("[query:sectionInstrumentAcademicOverview]", e.message);
      throw new Error(e.message || "Error al obtener resumen académico de la sección");
    }
  },

  sectionPendingEvaluations: async (_, { filter }, ctx) => {
    try {
      return await svc.getSectionPendingEvaluations(filter || {}, ctx);
    } catch (e) {
      console.error("[query:sectionPendingEvaluations]", e.message);
      throw new Error(e.message || "Error al obtener evaluaciones pendientes de la sección");
    }
  },
};
