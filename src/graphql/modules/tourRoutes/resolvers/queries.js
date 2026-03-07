/**
 * tourRoutes/resolvers/queries.js
 */
const svc = require("../services/tourRoutes.service");

module.exports = {
  getTourRoutes: async (_, { tourId }, ctx) => {
    try {
      return await svc.getTourRoutes(tourId, ctx);
    } catch (e) {
      console.error("[query:getTourRoutes]", e.message);
      throw new Error(e.message || "No se pudieron obtener las rutas");
    }
  },

  getTourRoute: async (_, { id }, ctx) => {
    try {
      return await svc.getTourRoute(id, ctx);
    } catch (e) {
      console.error("[query:getTourRoute]", e.message);
      throw new Error(e.message || "No se pudo obtener la ruta");
    }
  },

  getUnassignedTourFlights: async (_, { tourId }, ctx) => {
    try {
      return await svc.getUnassignedTourFlights(tourId, ctx);
    } catch (e) {
      console.error("[query:getUnassignedTourFlights]", e.message);
      throw new Error(e.message || "No se pudieron obtener vuelos sin asignar");
    }
  },
};
