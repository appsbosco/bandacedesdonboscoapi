/**
 * presentations - Queries
 * Resolvers delgados: delegan al service
 */
const presentationsService = require("../services/presentations.service");

module.exports = {
  getPerformanceAttendanceByEvent: async (_, { event }, ctx) => {
    try {
      return await presentationsService.getPerformanceAttendanceByEvent(
        event,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener la asistencia por evento",
      );
    }
  },

  getHotel: async (_, { id }, ctx) => {
    try {
      return await presentationsService.getHotel(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener el hotel");
    }
  },

  getHotels: async (_, __, ctx) => {
    try {
      return await presentationsService.getHotels(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar hoteles");
    }
  },
};
