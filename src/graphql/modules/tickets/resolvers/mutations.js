// tickets/resolvers/mutations.js
const ticketsService = require("../services/tickets.service");

function wrapError(err, fallbackMessage) {
  return new Error(err?.message || fallbackMessage);
}

module.exports = {
  createEvent: async (
    _,
    { name, date, description, ticketLimit, raffleEnabled, price },
    ctx,
  ) => {
    try {
      return await ticketsService.createEvent(
        { name, date, description, ticketLimit, raffleEnabled, price },
        ctx,
      );
    } catch (err) {
      throw wrapError(err, "Failed to create event");
    }
  },

  assignTickets: async (_, { input }, ctx) => {
    try {
      return await ticketsService.assignTickets({ input }, ctx);
    } catch (err) {
      throw wrapError(err, "Error assigning tickets");
    }
  },

  purchaseTicket: async (
    _,
    { eventId, buyerName, buyerEmail, ticketQuantity },
    ctx,
  ) => {
    try {
      return await ticketsService.purchaseTicket(
        { eventId, buyerName, buyerEmail, ticketQuantity },
        ctx,
      );
    } catch (err) {
      throw wrapError(err, "Error purchasing ticket");
    }
  },

  sendCourtesyTicket: async (
    _,
    { eventId, buyerName, buyerEmail, ticketQuantity },
    ctx,
  ) => {
    try {
      return await ticketsService.sendCourtesyTicket(
        { eventId, buyerName, buyerEmail, ticketQuantity },
        ctx,
      );
    } catch (err) {
      throw wrapError(err, "Error sending courtesy ticket");
    }
  },

  updatePaymentStatus: async (_, { ticketId, amountPaid }, ctx) => {
    try {
      return await ticketsService.updatePaymentStatus(
        { ticketId, amountPaid },
        ctx,
      );
    } catch (err) {
      throw wrapError(err, "Failed to update payment status");
    }
  },
};
