/**
 * attendance - Queries
 * Resolvers delgados: delegan al service
 */
const attendanceService = require("../services/attendance.service");

module.exports = {
  getAttendance: async (_, { id }, ctx) => {
    try {
      return await attendanceService.getAttendance(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener la asistencia");
    }
  },

  getAttendanceByUser: async (_, { userId }, ctx) => {
    try {
      return await attendanceService.getAttendanceByUser(userId, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener la asistencia del usuario",
      );
    }
  },

  getAllAttendance: async (_, __, ctx) => {
    try {
      return await attendanceService.getAllAttendance(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar la asistencia");
    }
  },
};
