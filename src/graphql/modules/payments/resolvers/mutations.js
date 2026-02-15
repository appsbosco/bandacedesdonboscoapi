/**
 * payments - Mutations
 * Resolvers delgados: delegan al service
 */
const paymentService = require("../services/payment.service");

module.exports = {
  createPaymentEvent: async (_, { input }, ctx) => {
    try {
      return await paymentService.createPaymentEvent(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Failed to create payment event");
    }
  },

  createPayment: async (_, { input }, ctx) => {
    try {
      return await paymentService.createPayment(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Failed to create payment");
    }
  },

  updatePayment: async (_, { paymentId, input }, ctx) => {
    try {
      return await paymentService.updatePayment(paymentId, input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Failed to update payment");
    }
  },

  deletePayment: async (_, { paymentId }, ctx) => {
    try {
      return await paymentService.deletePayment(paymentId, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Failed to delete payment");
    }
  },
};
