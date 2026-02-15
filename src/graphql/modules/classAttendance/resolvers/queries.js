/**
 * classAttendance - Queries
 * Resolvers delgados: delegan al service
 */
const classAttendanceService = require("../services/classAttendance.service");

module.exports = {
  getInstructorStudentsAttendance: async (_, { date }, ctx) => {
    try {
      return await classAttendanceService.getInstructorStudentsAttendance(
        date,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener la asistencia del instructor",
      );
    }
  },

  getAllAttendances: async (_, __, ctx) => {
    try {
      return await classAttendanceService.getAllAttendances(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar asistencias");
    }
  },
};
