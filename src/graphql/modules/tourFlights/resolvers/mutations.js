/**
 * tourFlights/resolvers/mutations.js
 */
const tourFlightsService = require("../services/tourFlights.service");

module.exports = {
  createTourFlight: async (_, { input }, ctx) => {
    try {
      return await tourFlightsService.createTourFlight(input, ctx);
    } catch (error) {
      console.error("[mutation:createTourFlight]", error.message);
      throw new Error(error.message || "No se pudo crear el vuelo");
    }
  },

  updateTourFlight: async (_, { id, input }, ctx) => {
    try {
      return await tourFlightsService.updateTourFlight(id, input, ctx);
    } catch (error) {
      console.error("[mutation:updateTourFlight]", error.message);
      throw new Error(error.message || "No se pudo actualizar el vuelo");
    }
  },

  deleteTourFlight: async (_, { id }, ctx) => {
    try {
      return await tourFlightsService.deleteTourFlight(id, ctx);
    } catch (error) {
      console.error("[mutation:deleteTourFlight]", error.message);
      throw new Error(error.message || "No se pudo eliminar el vuelo");
    }
  },

  assignPassenger: async (_, { flightId, participantId }, ctx) => {
    try {
      return await tourFlightsService.assignPassenger(
        flightId,
        participantId,
        ctx,
      );
    } catch (error) {
      console.error("[mutation:assignPassenger]", error.message);
      throw new Error(error.message || "No se pudo asignar el pasajero");
    }
  },

  assignPassengers: async (_, { flightId, participantIds }, ctx) => {
    try {
      return await tourFlightsService.assignPassengers(
        flightId,
        participantIds,
        ctx,
      );
    } catch (error) {
      console.error("[mutation:assignPassengers]", error.message);
      throw new Error(
        error.message || "No se pudo procesar la asignación masiva",
      );
    }
  },

  removePassenger: async (_, { flightId, participantId }, ctx) => {
    try {
      return await tourFlightsService.removePassenger(
        flightId,
        participantId,
        ctx,
      );
    } catch (error) {
      console.error("[mutation:removePassenger]", error.message);
      throw new Error(error.message || "No se pudo remover el pasajero");
    }
  },
};
