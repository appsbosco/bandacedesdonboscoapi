/**
 * tourRooms/resolvers/queries.js
 */
const tourRoomsService = require("../services/tourRooms.service");

module.exports = {
  getTourRooms: async (_, { tourId }, ctx) => {
    try {
      return await tourRoomsService.getTourRooms(tourId, ctx);
    } catch (error) {
      console.error("[query:getTourRooms]", error.message);
      throw new Error(error.message || "No se pudo obtener las habitaciones");
    }
  },

  getTourRoom: async (_, { id }, ctx) => {
    try {
      return await tourRoomsService.getTourRoom(id, ctx);
    } catch (error) {
      console.error("[query:getTourRoom]", error.message);
      throw new Error(error.message || "No se pudo obtener la habitación");
    }
  },
};
