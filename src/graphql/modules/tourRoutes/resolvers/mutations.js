/**
 * tourRoutes/resolvers/mutations.js
 */
const svc = require("../services/tourRoutes.service");

module.exports = {
  createTourRoute: async (_, { tourId, input }, ctx) => {
    try {
      return await svc.createTourRoute(tourId, input, ctx);
    } catch (e) {
      console.error("[mutation:createTourRoute]", e.message);
      throw new Error(e.message || "No se pudo crear la ruta");
    }
  },

  updateTourRoute: async (_, { id, input }, ctx) => {
    try {
      return await svc.updateTourRoute(id, input, ctx);
    } catch (e) {
      console.error("[mutation:updateTourRoute]", e.message);
      throw new Error(e.message || "No se pudo actualizar la ruta");
    }
  },

  deleteTourRoute: async (_, { id }, ctx) => {
    try {
      return await svc.deleteTourRoute(id, ctx);
    } catch (e) {
      console.error("[mutation:deleteTourRoute]", e.message);
      throw new Error(e.message || "No se pudo eliminar la ruta");
    }
  },

  assignFlightsToRoute: async (_, { routeId, flightIds }, ctx) => {
    try {
      return await svc.assignFlightsToRoute(routeId, flightIds, ctx);
    } catch (e) {
      console.error("[mutation:assignFlightsToRoute]", e.message);
      throw new Error(e.message || "No se pudieron asignar los vuelos");
    }
  },

  unassignFlightsFromRoute: async (_, { routeId, flightIds }, ctx) => {
    try {
      return await svc.unassignFlightsFromRoute(routeId, flightIds, ctx);
    } catch (e) {
      console.error("[mutation:unassignFlightsFromRoute]", e.message);
      throw new Error(e.message || "No se pudieron desasignar los vuelos");
    }
  },

  assignPassengersToRoute: async (_, { routeId, participantIds }, ctx) => {
    try {
      return await svc.assignPassengersToRoute(routeId, participantIds, ctx);
    } catch (e) {
      console.error("[mutation:assignPassengersToRoute]", e.message);
      throw new Error(e.message || "No se pudieron asignar los pasajeros");
    }
  },

  removePassengersFromRoute: async (_, { routeId, participantIds }, ctx) => {
    try {
      return await svc.removePassengersFromRoute(routeId, participantIds, ctx);
    } catch (e) {
      console.error("[mutation:removePassengersFromRoute]", e.message);
      throw new Error(e.message || "No se pudieron remover los pasajeros");
    }
  },
};
