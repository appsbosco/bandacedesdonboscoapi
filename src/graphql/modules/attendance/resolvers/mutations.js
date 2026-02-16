const attendanceService = require("../services/attendance.service");

module.exports = {
  createSession: async (_, { input }, ctx) => {
    try {
      return await attendanceService.createSession(input, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  takeAttendance: async (_, { date, section, attendances }, ctx) => {
    try {
      return await attendanceService.takeAttendance(
        date,
        section,
        attendances,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  updateAttendance: async (_, { id, status, notes }, ctx) => {
    try {
      return await attendanceService.updateAttendance(id, status, notes, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  closeSession: async (_, { id }, ctx) => {
    try {
      return await attendanceService.closeSession(id, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  deleteAttendance: async (_, { id }, ctx) => {
    try {
      return await attendanceService.deleteAttendance(id, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  deleteSession: async (_, { id }, ctx) => {
    try {
      return await attendanceService.deleteSession(id, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },
};
