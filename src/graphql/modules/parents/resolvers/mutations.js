/**
 * parents - Mutations
 * Resolvers delgados: delegan al service
 */
const parentService = require("../services/parent.service");

module.exports = {
  newParent: async (_, { input }, ctx) => {
    try {
      return await parentService.createParent(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "An error occurred while creating the parent",
      );
    }
  },
};
