/**
 * tours/resolvers/queries.js
 */
const tourService = require("../services/tour.service");

module.exports = {
  getTour: async (_, { id }, ctx) => {
    try {
      return await tourService.getTour(id, ctx);
    } catch (error) {
      console.error("[query:getTour]", error.message);
      throw new Error(error.message || "No se pudo obtener la gira");
    }
  },

  getTours: async (_, { filter }, ctx) => {
    try {
      return await tourService.getTours(filter, ctx);
    } catch (error) {
      console.error("[query:getTours]", error.message);
      throw new Error(error.message || "No se pudo listar las giras");
    }
  },

  getTourParticipants: async (_, { tourId, filter }, ctx) => {
    try {
      return await tourService.getTourParticipants(tourId, filter, ctx);
    } catch (error) {
      console.error("[query:getTourParticipants]", error.message);
      throw new Error(error.message || "No se pudo obtener los participantes");
    }
  },

  getTourParticipant: async (_, { id }, ctx) => {
    try {
      return await tourService.getTourParticipant(id, ctx);
    } catch (error) {
      console.error("[query:getTourParticipant]", error.message);
      throw new Error(error.message || "No se pudo obtener el participante");
    }
  },

  // Self-service: participante vinculado al usuario autenticado
  myTourParticipant: async (_, { tourId }, ctx) => {
    try {
      return await tourService.getMyTourParticipant(tourId, ctx);
    } catch (error) {
      console.error("[query:myTourParticipant]", error.message);
      throw new Error(error.message || "No se pudo obtener tu participante vinculado");
    }
  },

  // Parent self-service
  myChildrenTourAccess: async (_, { tourId }, ctx) => {
    try {
      return await tourService.getMyChildrenTourAccess(tourId, ctx);
    } catch (error) {
      console.error("[query:myChildrenTourAccess]", error.message);
      throw new Error(error.message || "No se pudo obtener el acceso de tus hijos a esta gira");
    }
  },

  myChildTourParticipant: async (_, { tourId, childUserId }, ctx) => {
    try {
      return await tourService.getMyChildTourParticipant(tourId, childUserId, ctx);
    } catch (error) {
      console.error("[query:myChildTourParticipant]", error.message);
      throw new Error(error.message || "No se pudo obtener el participante de tu hijo");
    }
  },
};
