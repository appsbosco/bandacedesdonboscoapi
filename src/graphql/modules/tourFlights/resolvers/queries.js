/**
 * tourFlights/resolvers/queries.js
 */
const tourFlightsService = require("../services/tourFlights.service");

module.exports = {
  getTourFlights: async (_, { tourId }, ctx) => {
    try {
      return await tourFlightsService.getTourFlights(tourId, ctx);
    } catch (error) {
      console.error("[query:getTourFlights]", error.message);
      throw new Error(error.message || "No se pudo obtener los vuelos");
    }
  },

  getTourFlight: async (_, { id }, ctx) => {
    try {
      return await tourFlightsService.getTourFlight(id, ctx);
    } catch (error) {
      console.error("[query:getTourFlight]", error.message);
      throw new Error(error.message || "No se pudo obtener el vuelo");
    }
  },
};
