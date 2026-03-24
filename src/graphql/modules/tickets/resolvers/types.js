/**
 * tickets - Types
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

module.exports = {
  Ticket: {
    id: (ticket) => {
      if (ticket?.id) return String(ticket.id);
      if (ticket?._id) return String(ticket._id);
      return null;
    },
    userId: (ticket) => {
      // Si el campo userId ya está populado, simplemente devuélvelo
      return ticket.userId;
    },
  },
};
