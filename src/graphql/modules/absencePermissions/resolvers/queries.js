const service = require("../services/absencePermission.service");

module.exports = {
  getMyAbsencePermissions: async (_, { limit = 20, offset = 0 }, ctx) => {
    try {
      return await service.getMyAbsencePermissions(limit, offset, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getAbsencePermissionsForChild: async (
    _,
    { childId, limit = 20, offset = 0 },
    ctx,
  ) => {
    try {
      return await service.getAbsencePermissionsForChild(
        childId,
        limit,
        offset,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getMyUserAbsencePermissions: async (
    _,
    { limit = 20, offset = 0 },
    ctx,
  ) => {
    try {
      return await service.getMyUserAbsencePermissions(limit, offset, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getAbsencePermissionsAdmin: async (
    _,
    { filter, limit = 30, offset = 0 },
    ctx,
  ) => {
    try {
      return await service.getAbsencePermissionsAdmin(
        filter,
        limit,
        offset,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getAbsencePermissionsForSection: async (
    _,
    { section, startDate, endDate, limit = 50, offset = 0 },
    ctx,
  ) => {
    try {
      return await service.getAbsencePermissionsForSection(
        section,
        startDate,
        endDate,
        limit,
        offset,
        ctx,
      );
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getPermissionsForSession: async (_, { sessionId }, ctx) => {
    try {
      return await service.getPermissionsForSession(sessionId, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getPermissionsForRehearsalDate: async (_, { date }, ctx) => {
    try {
      return await service.getPermissionsForRehearsalDate(date, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getPermissionsForEvent: async (_, { eventId }, ctx) => {
    try {
      return await service.getPermissionsForEvent(eventId, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  getAbsencePermission: async (_, { id }, ctx) => {
    try {
      return await service.getAbsencePermission(id, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },
};
