/**
 * apoyo - Queries
 */
const service = require("../services/travelForms.service");

module.exports = {
  getApoyo: async (_, __, ctx) => {
    try {
      return await service.getApoyo(ctx);
    } catch (error) {
      console.error("getApoyo error:", error);
      throw new Error(`getApoyo: ${error.message || "Unexpected error"}`);
    }
  },
};
