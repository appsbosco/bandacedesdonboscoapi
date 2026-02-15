/**
 * camps - Mutations
 * Resolvers delgados: delegan al service
 */
const campService = require("../services/camp.service");

module.exports = {
  createColorGuardCampRegistration: async (_, { input }, ctx) => {
    try {
      return await campService.createColorGuardCampRegistration(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo crear el registro del campamento",
      );
    }
  },
};
