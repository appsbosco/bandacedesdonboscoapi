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

  assignStudentToInstructor: async (_, { studentId }, ctx) => {
    try {
      return await classAttendanceService.assignStudentToInstructor(
        studentId,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo asignar el alumno");
    }
  },

  removeStudentFromInstructor: async (_, { studentId }, ctx) => {
    try {
      return await classAttendanceService.removeStudentFromInstructor(
        studentId,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo desasignar el alumno");
    }
  },

  deleteStudent: async (_, { studentId }, ctx) => {
    try {
      return await classAttendanceService.deleteStudent(studentId, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar el alumno");
    }
  },
};
