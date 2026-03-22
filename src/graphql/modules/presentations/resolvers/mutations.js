/**
 * presentations - Mutations
 * Resolvers delgados: delegan al service
 */
const presentationsService = require("../services/presentations.service");

module.exports = {
  newPerformanceAttendance: async (_, { input }, ctx) => {
    try {
      return await presentationsService.createPerformanceAttendance(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear la asistencia");
    }
  },

  updatePerformanceAttendance: async (_, { id, input }, ctx) => {
    try {
      return await presentationsService.updatePerformanceAttendance(
        id,
        input,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar la asistencia");
    }
  },

  deletePerformanceAttendance: async (_, { id }, ctx) => {
    try {
      return await presentationsService.deletePerformanceAttendance(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar la asistencia");
    }
  },

  newHotel: async (_, { input }, ctx) => {
    try {
      return await presentationsService.createHotel(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear el hotel");
    }
  },

  updateHotel: async (_, { id, input }, ctx) => {
    try {
      return await presentationsService.updateHotel(id, input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar el hotel");
    }
  },

  deleteHotel: async (_, { id }, ctx) => {
    try {
      return await presentationsService.deleteHotel(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar el hotel");
    }
  },
  initializeEventRoster: async (_, { eventId }, ctx) => {
    try {
      return await presentationsService.initializeEventRoster(eventId, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  assignBusToGroup: async (
    _,
    { eventId, assignmentGroup, busNumber, options },
    ctx,
  ) => {
    try {
      return await presentationsService.assignBusToGroup(
        eventId,
        assignmentGroup,
        busNumber,
        ctx,
        options || {},
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  moveUsersToBus: async (_, { eventId, userIds, busNumber }, ctx) => {
    try {
      return await presentationsService.moveUsersToBus(
        eventId,
        userIds,
        busNumber,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  setExclusion: async (_, { eventId, userId, exclusion }, ctx) => {
    try {
      return await presentationsService.setExclusion(
        eventId,
        userId,
        exclusion,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  markAttendance: async (_, { eventId, userId, attendanceStatus }, ctx) => {
    try {
      return await presentationsService.markAttendance(
        eventId,
        userId,
        attendanceStatus,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  bulkMarkAttendance: async (_, { eventId, entries }, ctx) => {
    try {
      return await presentationsService.bulkMarkAttendance(
        eventId,
        entries,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  setTransportPayment: async (_, { eventId, userId, paid }, ctx) => {
    try {
      return await presentationsService.setTransportPayment(
        eventId,
        userId,
        paid,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },
};
