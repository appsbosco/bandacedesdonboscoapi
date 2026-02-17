const parentService = require("../services/parent.service");
const dashboardService = require("../services/parentDashboard.service");

module.exports = {
  getParentDashboard: async (_, { dateRange, childId }, ctx) => {
    try {
      return await dashboardService.getParentDashboard(ctx, dateRange, childId);
    } catch (error) {
      console.error("[getParentDashboard] Error:", error);
      throw new Error(error.message || "Error fetching parent dashboard");
    }
  },

  getParent: async (_, __, ctx) => {
    try {
      return await parentService.getParent(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "Error fetching parent and children information",
      );
    }
  },

  getParents: async (_, __, ctx) => {
    try {
      return await parentService.getParents(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "Error fetching parents");
    }
  },
};
