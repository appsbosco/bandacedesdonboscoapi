const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");

module.exports = {
  AbsencePermission: {
    id: (parent) => parent._id || parent.id,

    absenceDate: (parent) =>
      parent.absenceDate ? parent.absenceDate.toISOString() : null,

    createdAt: (parent) =>
      parent.createdAt ? parent.createdAt.toISOString() : null,

    updatedAt: (parent) =>
      parent.updatedAt ? parent.updatedAt.toISOString() : null,

    reviewedAt: (parent) =>
      parent.reviewedAt ? parent.reviewedAt.toISOString() : null,

    attachments: (parent) => parent.attachments || [],

    statusHistory: (parent) => parent.statusHistory || [],

    // Ensure populated or lazy-load
    student: async (parent) => {
      if (parent.student && parent.student._id) return parent.student;
      return await User.findById(parent.student).select(
        "name firstSurName secondSurName instrument state grade carnet email",
      );
    },

    requestedByParent: async (parent) => {
      if (!parent.requestedByParent) return null;
      if (parent.requestedByParent._id) return parent.requestedByParent;
      return await Parent.findById(parent.requestedByParent).select(
        "name firstSurName secondSurName email phone",
      );
    },

    requestedByUser: async (parent) => {
      if (!parent.requestedByUser) return null;
      if (parent.requestedByUser._id) return parent.requestedByUser;
      return await User.findById(parent.requestedByUser).select(
        "name firstSurName secondSurName email",
      );
    },

    reviewedBy: async (parent) => {
      if (!parent.reviewedBy) return null;
      if (parent.reviewedBy._id) return parent.reviewedBy;
      return await User.findById(parent.reviewedBy).select(
        "name firstSurName secondSurName role",
      );
    },
  },

  AbsenceStatusHistoryEntry: {
    changedAt: (entry) =>
      entry.changedAt ? entry.changedAt.toISOString() : null,

    changedBy: async (entry) => {
      if (!entry.changedBy) return null;
      if (entry.changedBy._id) return entry.changedBy;
      return await User.findById(entry.changedBy).select(
        "name firstSurName secondSurName role",
      );
    },
  },

  AbsencePermissionSummary: {
    id: (entry) => String(entry.id || entry._id),
    studentId: (entry) => String(entry.studentId),
  },
};
