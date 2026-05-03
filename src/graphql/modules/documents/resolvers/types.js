/**
 * attendance - Types
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */
const { daysUntilExpiration } = require("../../../../../utils/expiration");

function formatDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/);
    return dateOnly ? dateOnly[0] : value;
  }

  return value;
}

module.exports = {
  DocumentExtractedData: {
    dateOfBirth: (parent) => formatDateOnly(parent.dateOfBirth),
    expirationDate: (parent) => formatDateOnly(parent.expirationDate),
    issueDate: (parent) => formatDateOnly(parent.issueDate),
  },
  Document: {
    createdAt: (parent) =>
      parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : parent.createdAt || null,
    updatedAt: (parent) =>
      parent.updatedAt instanceof Date
        ? parent.updatedAt.toISOString()
        : parent.updatedAt || null,
    owner: async (parent, _, context) => {
      // Si ya está poblado, retornar
      if (parent.owner && typeof parent.owner === "object") {
        return parent.owner;
      }

      // Si no, buscar el User
      const User = require("../models/User");
      return await User.findById(parent.owner);
    },

    createdBy: async (parent) => {
      if (parent.createdBy && typeof parent.createdBy === "object") {
        return parent.createdBy;
      }

      const User = require("../models/User");
      return await User.findById(parent.createdBy);
    },

    updatedBy: async (parent) => {
      if (!parent.updatedBy) return null;

      if (parent.updatedBy && typeof parent.updatedBy === "object") {
        return parent.updatedBy;
      }

      const User = require("../models/User");
      return await User.findById(parent.updatedBy);
    },

    isExpired: (parent) => {
      if (!parent.extracted?.expirationDate) return null;

      return new Date(parent.extracted.expirationDate) < new Date();
    },

    daysUntilExpiration: (parent) => {
      if (!parent.extracted?.expirationDate) return null;

      return daysUntilExpiration(parent.extracted.expirationDate);
    },
  },
};
