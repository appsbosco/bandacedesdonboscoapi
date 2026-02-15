/**
 * presentations - Mutations
 * Resolvers delgados: delegan al service
 */
const presentationsService = require("../services/presentations.service");

module.exports = {
  newPerformanceAttendance: async (_, { input }, ctx) => {
    try {
      return await presentationsService.createPerformanceAttendance(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear la asistencia");
    }
  },

  updatePerformanceAttendance: async (_, { id, input }, ctx) => {
    try {
      return await presentationsService.updatePerformanceAttendance(
        id,
        input,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar la asistencia");
    }
  },

  deletePerformanceAttendance: async (_, { id }, ctx) => {
    try {
      return await presentationsService.deletePerformanceAttendance(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar la asistencia");
    }
  },

  newHotel: async (_, { input }, ctx) => {
    try {
      return await presentationsService.createHotel(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear el hotel");
    }
  },

  updateHotel: async (_, { id, input }, ctx) => {
    try {
      return await presentationsService.updateHotel(id, input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar el hotel");
    }
  },

  deleteHotel: async (_, { id }, ctx) => {
    try {
      return await presentationsService.deleteHotel(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar el hotel");
    }
  },
};
