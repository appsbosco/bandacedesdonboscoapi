/**
 * events - Queries
 * Resolvers delgados: delegan al service
 */
const eventService = require("../services/event.service");

module.exports = {
  getEvent: async (_, { id }, ctx) => {
    try {
      return await eventService.getEvent(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener el evento");
    }
  },

  getEvents: async (_, __, ctx) => {
    try {
      return await eventService.getEvents(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar eventos");
    }
  },
};
