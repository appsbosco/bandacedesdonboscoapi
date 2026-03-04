/**
 * events/resolvers/queries.js
 */
const eventService = require("../services/event.service");

module.exports = {
  getEvent: async (_, { id }, ctx) => {
    try {
      return await eventService.getEvent(id, ctx);
    } catch (error) {
      console.error("[query:getEvent]", error.message);
      throw new Error(error.message || "No se pudo obtener el evento");
    }
  },

  getEvents: async (_, { filter }, ctx) => {
    try {
      return await eventService.getEvents(filter, ctx);
    } catch (error) {
      console.error("[query:getEvents]", error.message);
      throw new Error(error.message || "No se pudo listar eventos");
    }
  },

  getEventsByDateRange: async (_, { from, to }, ctx) => {
    try {
      return await eventService.getEventsByDateRange(from, to, ctx);
    } catch (error) {
      console.error("[query:getEventsByDateRange]", error.message);
      throw new Error(
        error.message || "No se pudo consultar el rango de fechas",
      );
    }
  },
};
