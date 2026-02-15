/**
 * attendance - Mutations
 * Resolvers delgados: delegan al service
 */
const attendanceService = require("../services/attendance.service");

module.exports = {
  // Attendance
  newAttendance: async (_, { input }, ctx) => {
    try {
      return await attendanceService.createAttendance(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear la asistencia");
    }
  },

  updateAttendance: async (_, { id, input }, ctx) => {
    try {
      return await attendanceService.updateAttendance(id, input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar la asistencia");
    }
  },

  deleteAttendance: async (_, { id }, ctx) => {
    try {
      return await attendanceService.deleteAttendance(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar la asistencia");
    }
  },
};
