/**
 * events/resolvers/mutations.js
 */
const eventService = require("../services/event.service");

module.exports = {
  newEvent: async (_, { input }, ctx) => {
    try {
      return await eventService.createEvent(input, ctx);
    } catch (error) {
      console.error("[mutation:newEvent]", error.message);
      throw new Error(error.message || "No se pudo crear el evento");
    }
  },

  updateEvent: async (_, { id, input }, ctx) => {
    try {
      return await eventService.updateEvent(id, input, ctx);
    } catch (error) {
      console.error("[mutation:updateEvent]", error.message);
      throw new Error(error.message || "No se pudo actualizar el evento");
    }
  },

  deleteEvent: async (_, { id }, ctx) => {
    try {
      return await eventService.deleteEvent(id, ctx);
    } catch (error) {
      console.error("[mutation:deleteEvent]", error.message);
      throw new Error(error.message || "No se pudo eliminar el evento");
    }
  },
};
