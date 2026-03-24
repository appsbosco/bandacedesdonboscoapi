// tickets/resolvers/mutations.js
const ticketsService = require("../services/tickets.service");
const { sendMail } = require("../../../shared/mailer");

function wrapError(err, fallbackMessage) {
  return new Error(err?.message || fallbackMessage);
}

module.exports = {
  sendEmail: async (_, { input }, ctx) => {
    try {
      const sender =
        ctx?.sendEmail || ctx?.services?.email?.sendEmail || sendMail;
      await sender(input);
      return true;
    } catch (err) {
      throw wrapError(err, "Failed to send email");
    }
  },

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

  importTicketsFromExcel: async (_, { input }, ctx) => {
    try {
      return await ticketsService.importTicketsFromExcel({ input }, ctx);
    } catch (err) {
      throw wrapError(err, "Failed to import tickets from Excel");
    }
  },

  addImportedTicketRecipient: async (_, { input }, ctx) => {
    try {
      return await ticketsService.addImportedTicketRecipient({ input }, ctx);
    } catch (err) {
      throw wrapError(err, "Failed to add imported ticket recipient");
    }
  },

  resendImportedTicketEmail: async (_, { ticketId }, ctx) => {
    try {
      return await ticketsService.resendImportedTicketEmail({ ticketId }, ctx);
    } catch (err) {
      throw wrapError(err, "Failed to resend imported ticket email");
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

  validateTicket: async (_, { qrPayload, scannedBy, location, forceEntry }, ctx) => {
    try {
      return await ticketsService.validateTicket(
        { qrPayload, scannedBy, location, forceEntry },
        ctx,
      );
    } catch (err) {
      throw wrapError(err, "Failed to validate ticket");
    }
  },

  cancelTicket: async (_, { ticketId, reason, cancelledBy }, ctx) => {
    try {
      return await ticketsService.cancelTicket(
        { ticketId, reason, cancelledBy },
        ctx,
      );
    } catch (err) {
      throw wrapError(err, "Failed to cancel ticket");
    }
  },
};
