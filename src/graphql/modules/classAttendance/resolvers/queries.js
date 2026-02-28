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

  getStudentsWithoutInstructor: async (_, __, ctx) => {
    try {
      return await classAttendanceService.getStudentsWithoutInstructor(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener alumnos sin instructor",
      );
    }
  },

  getStudentAttendanceSummary: async (_, { studentId }, ctx) => {
    try {
      return await classAttendanceService.getStudentAttendanceSummary(
        studentId,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener el resumen de asistencia",
      );
    }
  },
};
