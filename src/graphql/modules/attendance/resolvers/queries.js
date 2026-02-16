const attendanceService = require("../services/attendance.service");
const RehearsalSession = require("../../../../../models/RehearsalSession");
const { normalizeDateToStartOfDayCR } = require("../../../../../utils/dates");

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

  getMissingSectionsForDate: async (_, { date }, ctx) => {
    attendanceService.requireAuth(ctx);

    const dateNormalized = normalizeDateToStartOfDayCR(date);

    const allSections = [
      "NO_APLICA",
      "FLAUTAS",
      "CLARINETES",
      "SAXOFONES",
      "TROMPETAS",
      "TROMBONES",
      "TUBAS",
      "EUFONIOS",
      "CORNOS",
      "MALLETS",
      "PERCUSION",
      "COLOR_GUARD",
      "DANZA",
    ];

    const sessions = await RehearsalSession.find({ dateNormalized }).select(
      "section",
    );

    const recordedSections = sessions.map((s) => s.section);
    const recordedSet = new Set(recordedSections);

    const missingSections = allSections.filter((sec) => !recordedSet.has(sec));

    return {
      date: dateNormalized.toISOString().split("T")[0],
      missingSections,
      recordedSections,
    };
  },
};
