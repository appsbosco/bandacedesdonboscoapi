/**
 * inventory - Queries
 * Resolvers delgados: delegan al service
 */
const inventoryService = require("../services/inventory.service");

module.exports = {
  getInventory: async (_, { id }, ctx) => {
    try {
      return await inventoryService.getInventory(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener el inventario");
    }
  },

  getInventories: async (_, __, ctx) => {
    try {
      return await inventoryService.getInventories(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar inventarios");
    }
  },

  getInventoryByUser: async (_, __, ctx) => {
    try {
      return await inventoryService.getInventoryByUser(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener el inventario del usuario",
      );
    }
  },
};
