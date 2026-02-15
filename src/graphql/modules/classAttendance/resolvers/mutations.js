/**
 * classAttendance - Mutations
 * Resolvers delgados: delegan al service
 */
const classAttendanceService = require("../services/classAttendance.service");

module.exports = {
  markAttendanceAndPayment: async (_, { input }, ctx) => {
    try {
      return await classAttendanceService.markAttendanceAndPayment(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo marcar asistencia y pago");
    }
  },
};
