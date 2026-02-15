// tickets/resolvers/queries.js
const ticketsService = require("../services/tickets.service");

function wrapError(err, fallbackMessage) {
  return new Error(err?.message || fallbackMessage);
}

module.exports = {
  getTickets: async (_, { eventId }, ctx) => {
    try {
      return await ticketsService.getTickets({ eventId }, ctx);
    } catch (err) {
      throw wrapError(err, "Failed to fetch tickets");
    }
  },

  getTicketsNumbers: async (_, { eventId }, ctx) => {
    try {
      return await ticketsService.getTicketsNumbers({ eventId }, ctx);
    } catch (err) {
      throw wrapError(err, "Failed to fetch tickets");
    }
  },

  getEventsT: async (_, args, ctx) => {
    try {
      return await ticketsService.getEventsT(args, ctx);
    } catch (err) {
      throw wrapError(err, "Failed to fetch events");
    }
  },
};
