const bookingRequestsService = require("../services/bookingRequests.service");

module.exports = {
  createBookingRequest: async (_, { input }, ctx) => {
    try {
      return await bookingRequestsService.createBookingRequest(input, ctx);
    } catch (error) {
      throw new Error(error.message || "No se pudo registrar la solicitud");
    }
  },

  updateBookingRequestStatus: async (_, { id, input }, ctx) => {
    try {
      return await bookingRequestsService.updateBookingRequestStatus(id, input, ctx);
    } catch (error) {
      throw new Error(error.message || "No se pudo actualizar el estado de la solicitud");
    }
  },
};
