const bookingRequestsService = require("../services/bookingRequests.service");

module.exports = {
  getBookingRequests: async (_, { filter }, ctx) => {
    try {
      return await bookingRequestsService.getBookingRequests(filter || {}, ctx);
    } catch (error) {
      throw new Error(error.message || "No se pudieron obtener las solicitudes");
    }
  },

  getBookingRequest: async (_, { id }, ctx) => {
    try {
      return await bookingRequestsService.getBookingRequest(id, ctx);
    } catch (error) {
      throw new Error(error.message || "No se pudo obtener la solicitud");
    }
  },
};
