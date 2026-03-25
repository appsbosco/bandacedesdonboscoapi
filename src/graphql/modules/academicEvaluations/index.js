"use strict";

const typeDefs = require("./typeDefs");
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");

// Serializa _id → id para los tipos de este módulo
const isoDate = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

const typeResolvers = {
  AcademicSubject: {
    id: (p) => String(p._id || p.id),
    isActive: (p) => p.isActive ?? true,
    bands: (p) => p.bands || [],
    grades: (p) => p.grades || [],
    createdAt: (p) => isoDate(p.createdAt),
    updatedAt: (p) => isoDate(p.updatedAt),
  },

  AcademicPeriod: {
    id: (p) => String(p._id || p.id),
    isActive: (p) => p.isActive ?? true,
    createdAt: (p) => isoDate(p.createdAt),
    updatedAt: (p) => isoDate(p.updatedAt),
  },

  AcademicEvaluation: {
    id: (p) => String(p._id || p.id),
    student: (p) => {
      const s = p.student;
      if (!s) return null;
      return {
        id: String(s._id || s.id || s),
        name: s.name || "",
        firstSurName: s.firstSurName || "",
        email: s.email || null,
        grade: s.grade || null,
        instrument: s.instrument || null,
      };
    },
    subject: (p) => p.subject,
    period: (p) => p.period,
    reviewedByAdmin: (p) => {
      const a = p.reviewedByAdmin;
      if (!a) return null;
      return {
        id: String(a._id || a.id || a),
        name: a.name || "",
        firstSurName: a.firstSurName || "",
        email: a.email || null,
        grade: null,
        instrument: null,
      };
    },
    submittedByStudentAt: (p) => isoDate(p.submittedByStudentAt),
    reviewedAt: (p) => isoDate(p.reviewedAt),
    parentAcknowledgedAt: (p) => isoDate(p.parentAcknowledgedAt),
    createdAt: (p) => isoDate(p.createdAt),
    updatedAt: (p) => isoDate(p.updatedAt),
  },

  EvalBasicUser: {
    id: (p) => String(p._id || p.id || p),
  },
};

module.exports = {
  name: "academicEvaluations",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...typeResolvers,
  },
};
