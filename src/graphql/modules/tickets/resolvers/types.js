/**
 * tickets - Types
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

module.exports = {
  Ticket: {
    userId: (ticket) => {
      // Si el campo userId ya está populado, simplemente devuélvelo
      return ticket.userId;
    },
  },
};
