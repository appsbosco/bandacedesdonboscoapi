/**
 * payments - Queries
 * Resolvers delgados: delegan al service
 */
const paymentService = require("../services/payment.service");

module.exports = {
  getPaymentEvents: async (_, __, ctx) => {
    try {
      return await paymentService.getPaymentEvents(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Failed to fetch payment events");
    }
  },

  getPaymentsByEvent: async (_, { paymentEvent }, ctx) => {
    try {
      return await paymentService.getPaymentsByEvent(paymentEvent, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Failed to fetch payments");
    }
  },
};
