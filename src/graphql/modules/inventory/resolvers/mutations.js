/**
 * inventory - Mutations
 * Resolvers delgados: delegan al service
 */
const inventoryService = require("../services/inventory.service");

module.exports = {
  newInventory: async (_, { input }, ctx) => {
    try {
      return await inventoryService.createInventory(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear el inventario");
    }
  },

  updateInventory: async (_, { id, input }, ctx) => {
    try {
      return await inventoryService.updateInventory(id, input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar el inventario");
    }
  },

  deleteInventory: async (_, { id }, ctx) => {
    try {
      return await inventoryService.deleteInventory(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar el inventario");
    }
  },
};
