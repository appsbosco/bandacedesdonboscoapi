/**
 * attendance - Types
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

module.exports = {
  Document: {
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
