"use strict";

const typeDefs = require("./typeDefs");
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const AcademicSubject = require("../../../../models/academic/AcademicSubject");
const AcademicPeriod = require("../../../../models/academic/AcademicPeriod");
const User = require("../../../../models/User");

// Serializa _id → id para los tipos de este módulo
const isoDate = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

async function resolveBasicStudent(value) {
  if (!value) return null;
  if (typeof value === "object" && (value.name || value.firstSurName || value.email || value.grade || value.instrument || value.avatar)) {
    return {
      id: String(value._id || value.id),
      name: value.name || "",
      firstSurName: value.firstSurName || "",
      email: value.email || null,
      grade: value.grade || null,
      instrument: value.instrument || null,
      avatar: value.avatar || null,
    };
  }

  const studentId = String(value._id || value.id || value);
  if (!studentId || studentId === "undefined") return null;

  const student = await User.findById(studentId)
    .select("name firstSurName email grade instrument avatar _id")
    .lean();

  if (!student) return null;

  return {
    id: String(student._id),
    name: student.name || "",
    firstSurName: student.firstSurName || "",
    email: student.email || null,
    grade: student.grade || null,
    instrument: student.instrument || null,
    avatar: student.avatar || null,
  };
}

async function resolveBasicSubject(value) {
  if (!value) return null;
  if (typeof value === "object" && (value.name || value.code || value.subjectType || value.scienceGroup)) {
    return value;
  }
  const subjectId = String(value._id || value.id || value);
  if (!subjectId || subjectId === "undefined") return null;
  return AcademicSubject.findById(subjectId)
    .select("name code isActive bands grades subjectType scienceGroup order _id")
    .lean();
}

async function resolveBasicPeriod(value) {
  if (!value) return null;
  if (typeof value === "object" && (value.name || value.year || value.semester)) {
    return value;
  }
  const periodId = String(value._id || value.id || value);
  if (!periodId || periodId === "undefined") return null;
  return AcademicPeriod.findById(periodId)
    .select("name year academicYear semester order isActive _id")
    .lean();
}

function resolveNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const typeResolvers = {
  AcademicSubject: {
    id: (p) => String(p._id || p.id),
    isActive: (p) => p.isActive ?? true,
    subjectType: (p) => p.subjectType || "EXAM_BASED",
    bands: (p) => p.bands || [],
    grades: (p) => p.grades || [],
    scienceGroup: (p) => p.scienceGroup || null,
    order: (p) => p.order || 0,
    createdAt: (p) => isoDate(p.createdAt),
    updatedAt: (p) => isoDate(p.updatedAt),
  },

  AcademicPeriod: {
    id: (p) => String(p._id || p.id),
    academicYear: (p) => p.academicYear || p.year || null,
    semester: (p) => p.semester || null,
    isActive: (p) => p.isActive ?? true,
    createdAt: (p) => isoDate(p.createdAt),
    updatedAt: (p) => isoDate(p.updatedAt),
  },

  AcademicAssessmentSlot: {
    id: (p) => String(p._id || p.id),
    academicYear: (p) => p.academicYear ?? null,
    semester: (p) => p.semester ?? null,
    slotKey: (p) => p.slotKey || null,
    label: (p) => p.label || null,
    evaluationType: (p) => p.evaluationType || null,
    subjectType: (p) => p.subjectType || null,
    appliesToGrades: (p) => p.appliesToGrades || [],
    excludedGrades: (p) => p.excludedGrades || [],
    order: (p) => p.order || 0,
    isActive: (p) => p.isActive ?? true,
    requiresEvidence: (p) => p.requiresEvidence ?? true,
    createdAt: (p) => isoDate(p.createdAt),
    updatedAt: (p) => isoDate(p.updatedAt),
  },

  AdminAcademicStudent: {
    id: (p) => String(p._id || p.id),
  },

  AcademicEvaluation: {
    id: (p) => String(p._id || p.id),
    student: async (p) => resolveBasicStudent(p.student),
    subject: async (p) => resolveBasicSubject(p.subject),
    period: async (p) => resolveBasicPeriod(p.period),
    assessmentSlot: (p) => p.assessmentSlot || null,
    academicYear: (p) => p.academicYear ?? null,
    semester: (p) => p.semester ?? null,
    evaluationType: (p) => p.evaluationType || null,
    migrationStatus: (p) => p.migrationStatus || null,
    scoreRaw: (p) => resolveNumber(p.scoreRaw, 0),
    scaleMin: (p) => resolveNumber(p.scaleMin, 0),
    scaleMax: (p) => resolveNumber(p.scaleMax, 100),
    scoreNormalized100: (p) => resolveNumber(p.scoreNormalized100, 0),
    evidencePublicId: (p) => p.evidencePublicId || null,
    evidenceResourceType: (p) => p.evidenceResourceType || null,
    evidenceOriginalName: (p) => p.evidenceOriginalName || null,
    evidenceThumbnailUrl: (p) => p.evidenceThumbnailUrl || null,
    status: (p) => p.status || "pending",
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
        avatar: a.avatar || null,
      };
    },
    submittedByStudentAt: (p) => isoDate(p.submittedByStudentAt),
    reviewedAt: (p) => isoDate(p.reviewedAt),
    parentAcknowledgedAt: (p) => isoDate(p.parentAcknowledgedAt),
    createdAt: (p) => isoDate(p.createdAt),
    updatedAt: (p) => isoDate(p.updatedAt),
  },

  // Tipo detalle — mismos resolvers que AcademicEvaluation pero incluye evidenceUrl/evidencePreviewUrl
  AcademicEvaluationDetail: {
    id: (p) => String(p._id || p.id),
    student: async (p) => resolveBasicStudent(p.student),
    subject: async (p) => resolveBasicSubject(p.subject),
    period: async (p) => resolveBasicPeriod(p.period),
    assessmentSlot: (p) => p.assessmentSlot || null,
    academicYear: (p) => p.academicYear ?? null,
    semester: (p) => p.semester ?? null,
    evaluationType: (p) => p.evaluationType || null,
    migrationStatus: (p) => p.migrationStatus || null,
    scoreRaw: (p) => resolveNumber(p.scoreRaw, 0),
    scaleMin: (p) => resolveNumber(p.scaleMin, 0),
    scaleMax: (p) => resolveNumber(p.scaleMax, 100),
    scoreNormalized100: (p) => resolveNumber(p.scoreNormalized100, 0),
    evidenceUrl: (p) => p.evidenceUrl || null,
    evidencePublicId: (p) => p.evidencePublicId || null,
    evidenceResourceType: (p) => p.evidenceResourceType || null,
    evidenceOriginalName: (p) => p.evidenceOriginalName || null,
    evidenceThumbnailUrl: (p) => p.evidenceThumbnailUrl || null,
    evidencePreviewUrl: (p) => p.evidencePreviewUrl || null,
    status: (p) => p.status || "pending",
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
        avatar: a.avatar || null,
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
