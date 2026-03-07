/**
 * tourRooms/resolvers/mutations.js
 */
const tourRoomsService = require("../services/tourRooms.service");

module.exports = {
  createTourRoom: async (_, { input }, ctx) => {
    try {
      return await tourRoomsService.createTourRoom(input, ctx);
    } catch (error) {
      console.error("[mutation:createTourRoom]", error.message);
      throw new Error(error.message || "No se pudo crear la habitación");
    }
  },

  updateTourRoom: async (_, { id, input }, ctx) => {
    try {
      return await tourRoomsService.updateTourRoom(id, input, ctx);
    } catch (error) {
      console.error("[mutation:updateTourRoom]", error.message);
      throw new Error(error.message || "No se pudo actualizar la habitación");
    }
  },

  deleteTourRoom: async (_, { id }, ctx) => {
    try {
      return await tourRoomsService.deleteTourRoom(id, ctx);
    } catch (error) {
      console.error("[mutation:deleteTourRoom]", error.message);
      throw new Error(error.message || "No se pudo eliminar la habitación");
    }
  },

  assignOccupant: async (_, { roomId, participantId }, ctx) => {
    try {
      return await tourRoomsService.assignOccupant(roomId, participantId, ctx);
    } catch (error) {
      console.error("[mutation:assignOccupant]", error.message);
      throw new Error(error.message || "No se pudo asignar el ocupante");
    }
  },

  removeOccupant: async (_, { roomId, participantId }, ctx) => {
    try {
      return await tourRoomsService.removeOccupant(roomId, participantId, ctx);
    } catch (error) {
      console.error("[mutation:removeOccupant]", error.message);
      throw new Error(error.message || "No se pudo remover el ocupante");
    }
  },
};
