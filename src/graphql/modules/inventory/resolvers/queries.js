/**
 * inventory - Queries
 * Resolvers delgados: delegan al service
 */
const svc = require("../services/inventory.service");

module.exports = {
  getInventory: async (_, { id }, ctx) => {
    try { return await svc.getInventory(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo obtener el inventario"); }
  },

  getInventories: async (_, __, ctx) => {
    try { return await svc.getInventories(ctx); }
    catch (e) { throw new Error(e.message || "No se pudo listar inventarios"); }
  },

  getInventoryByUser: async (_, __, ctx) => {
    try { return await svc.getInventoryByUser(ctx); }
    catch (e) { throw new Error(e.message || "No se pudo obtener el inventario del usuario"); }
  },

  inventoriesPaginated: async (_, { filter, pagination }, ctx) => {
    try { return await svc.inventoriesPaginated(filter || {}, pagination || {}, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo listar inventarios"); }
  },

  inventoryStats: async (_, __, ctx) => {
    try { return await svc.inventoryStats(ctx); }
    catch (e) { throw new Error(e.message || "No se pudo obtener estadísticas"); }
  },

  inventoryMaintenanceHistory: async (_, { inventoryId }, ctx) => {
    try { return await svc.getMaintenanceHistory(inventoryId, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo obtener historial de mantenimiento"); }
  },
};
