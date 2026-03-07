/**
 * inventory - Mutations
 * Resolvers delgados: delegan al service
 */
const svc = require("../services/inventory.service");

module.exports = {
  newInventory: async (_, { input }, ctx) => {
    try { return await svc.createInventory(input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo crear el inventario"); }
  },

  updateInventory: async (_, { id, input }, ctx) => {
    try { return await svc.updateInventory(id, input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo actualizar el inventario"); }
  },

  deleteInventory: async (_, { id }, ctx) => {
    try { return await svc.deleteInventory(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo eliminar el inventario"); }
  },

  addMaintenanceRecord: async (_, { inventoryId, input }, ctx) => {
    try { return await svc.addMaintenanceRecord(inventoryId, input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo registrar el mantenimiento"); }
  },

  deleteMaintenanceRecord: async (_, { id }, ctx) => {
    try { return await svc.deleteMaintenanceRecord(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo eliminar el registro de mantenimiento"); }
  },
};
