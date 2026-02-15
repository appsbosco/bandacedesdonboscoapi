/**
 * parents - Queries
 * Resolvers delgados: delegan al service
 */
const parentService = require("../services/parent.service");

module.exports = {
  getParent: async (_, __, ctx) => {
    try {
      return await parentService.getParent(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "Error fetching parent and children information",
      );
    }
  },

  getParents: async (_, __, ctx) => {
    try {
      return await parentService.getParents(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Error fetching parents");
    }
  },
};
