const attendanceService = require("../services/attendance.service");

module.exports = {
  // Sessions
  getSession: async (_, { id }, ctx) => {
    try {
      const session = await require("../../../../../models/RehearsalSession")
        .findById(id)
        .populate("takenBy");
      if (!session) throw new Error("Sesión no encontrada");
      return session;
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getSessions: async (_, { limit, offset, filter }, ctx) => {
    try {
      return await attendanceService.getSessions(limit, offset, filter, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getActiveSession: async (_, { date, section }, ctx) => {
    try {
      return await attendanceService.getActiveSession(date, section, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getSectionComplianceReport: async (_, { startDate, endDate }, ctx) => {
    try {
      return await attendanceService.getSectionComplianceReport(
        startDate,
        endDate,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  // Attendances
  getAttendance: async (_, { id }, ctx) => {
    try {
      return await attendanceService.getAttendance(id, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getAttendancesByUser: async (_, { userId, limit, offset }, ctx) => {
    try {
      return await attendanceService.getAttendancesByUser(
        userId,
        limit,
        offset,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getAllAttendancesRehearsal: async (_, { limit, offset, filter }, ctx) => {
    try {
      return await attendanceService.getAllAttendancesRehearsal(
        limit,
        offset,
        filter,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getUserAttendanceStats: async (_, { userId, startDate, endDate }, ctx) => {
    try {
      return await attendanceService.getUserAttendanceStats(
        userId,
        startDate,
        endDate,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },
};
