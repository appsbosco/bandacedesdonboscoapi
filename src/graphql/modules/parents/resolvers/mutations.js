const parentService = require("../services/parent.service");

module.exports = {
  newParent: async (_, { input }, ctx) => {
    try {
      return await parentService.createParent(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "An error occurred while creating the parent",
      );
    }
  },

  addChildToParent: async (_, { input }, ctx) => {
    try {
      return await parentService.addChildToParent(input.childId, ctx);
    } catch (error) {
      console.error("[addChildToParent] Error:", error);
      throw new Error(error.message || "Error adding child to parent");
    }
  },

  removeChildFromParent: async (_, { input }, ctx) => {
    try {
      return await parentService.removeChildFromParent(input.childId, ctx);
    } catch (error) {
      console.error("[removeChildFromParent] Error:", error);
      throw new Error(error.message || "Error removing child from parent");
    }
  },
};
