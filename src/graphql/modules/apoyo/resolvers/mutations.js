/**
 * apoyo - Mutations
 */
const service = require("../services/travelForms.service");

module.exports = {
  addApoyo: async (_, { input }, ctx) => {
    try {
      return await service.addApoyo(input, ctx);
    } catch (error) {
      console.error("addApoyo error:", error);
      throw new Error(`addApoyo: ${error.message || "Unexpected error"}`);
    }
  },
};
