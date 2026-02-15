/**
 * camps - Queries
 * Resolvers delgados: delegan al service
 */
const campService = require("../services/camp.service");

module.exports = {
  getColorGuardCampRegistrations: async (_, __, ctx) => {
    try {
      return await campService.getColorGuardCampRegistrations(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener los registros del campamento",
      );
    }
  },
};
