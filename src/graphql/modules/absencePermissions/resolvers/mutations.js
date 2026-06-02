const service = require("../services/absencePermission.service");

module.exports = {
  createAbsencePermissionRequest: async (_, { input }, ctx) => {
    try {
      return await service.createAbsencePermissionRequest(input, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  reviewAbsencePermissionRequest: async (_, { id, input }, ctx) => {
    try {
      return await service.reviewAbsencePermissionRequest(id, input, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  cancelAbsencePermissionRequest: async (_, { id }, ctx) => {
    try {
      return await service.cancelAbsencePermissionRequest(id, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },

  reopenAbsencePermissionRequest: async (_, { id }, ctx) => {
    try {
      return await service.reopenAbsencePermissionRequest(id, ctx);
    } catch (error) {
      throw new Error(error.message);
    }
  },
};
