/**
 * tours/resolvers/mutations.js
 */
const tourService = require("../services/tour.service");

module.exports = {
  createTour: async (_, { input }, ctx) => {
    try {
      return await tourService.createTour(input, ctx);
    } catch (error) {
      console.error("[mutation:createTour]", error.message);
      throw new Error(error.message || "No se pudo crear la gira");
    }
  },

  updateTour: async (_, { id, input }, ctx) => {
    try {
      return await tourService.updateTour(id, input, ctx);
    } catch (error) {
      console.error("[mutation:updateTour]", error.message);
      throw new Error(error.message || "No se pudo actualizar la gira");
    }
  },

  deleteTour: async (_, { id }, ctx) => {
    try {
      return await tourService.deleteTour(id, ctx);
    } catch (error) {
      console.error("[mutation:deleteTour]", error.message);
      throw new Error(error.message || "No se pudo eliminar la gira");
    }
  },

  createTourParticipant: async (_, { tourId, input }, ctx) => {
    try {
      return await tourService.createTourParticipant(tourId, input, ctx);
    } catch (error) {
      console.error("[mutation:createTourParticipant]", error.message);
      throw new Error(error.message || "No se pudo crear el participante");
    }
  },

  createTourParticipantsBatch: async (_, { tourId, participants }, ctx) => {
    try {
      return await tourService.createTourParticipantsBatch(tourId, participants, ctx);
    } catch (error) {
      console.error("[mutation:createTourParticipantsBatch]", error.message);
      throw new Error(error.message || "No se pudo importar participantes");
    }
  },

  updateTourParticipant: async (_, { id, input }, ctx) => {
    try {
      return await tourService.updateTourParticipant(id, input, ctx);
    } catch (error) {
      console.error("[mutation:updateTourParticipant]", error.message);
      throw new Error(error.message || "No se pudo actualizar el participante");
    }
  },

  updateTourParticipantSex: async (_, { participantId, sex }, ctx) => {
    try {
      return await tourService.updateTourParticipantSex(participantId, sex, ctx);
    } catch (error) {
      console.error("[mutation:updateTourParticipantSex]", error.message);
      throw new Error(error.message || "No se pudo actualizar el sexo del participante");
    }
  },

  removeTourParticipant: async (_, { id }, ctx) => {
    try {
      return await tourService.removeTourParticipant(id, ctx);
    } catch (error) {
      console.error("[mutation:removeTourParticipant]", error.message);
      throw new Error(error.message || "No se pudo remover el participante");
    }
  },

  deleteTourParticipant: async (_, { id }, ctx) => {
    try {
      return await tourService.deleteTourParticipant(id, ctx);
    } catch (error) {
      console.error("[mutation:deleteTourParticipant]", error.message);
      throw new Error(error.message || "No se pudo eliminar el participante");
    }
  },
};
