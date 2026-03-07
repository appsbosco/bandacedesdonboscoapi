/**
 * inventory - Mutations
 * Resolvers delgados: delegan al service
 */
const svc = require("../services/inventory.service");

module.exports = {
  newInventory: async (_, { input }, ctx) => {
    try { return await svc.createInventory(input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo crear el instrumento"); }
  },

  updateInventory: async (_, { id, input }, ctx) => {
    try { return await svc.updateInventory(id, input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo actualizar el instrumento"); }
  },

  deleteInventory: async (_, { id }, ctx) => {
    try { return await svc.deleteInventory(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo eliminar el instrumento"); }
  },

  assignInventoryToUser: async (_, { inventoryId, userId }, ctx) => {
    try { return await svc.assignInventoryToUser(inventoryId, userId, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo asignar el instrumento"); }
  },

  unassignInventory: async (_, { inventoryId }, ctx) => {
    try { return await svc.unassignInventory(inventoryId, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo desasignar el instrumento"); }
  },

  adminCleanupInventories: async (_, { dryRun }, ctx) => {
    try { return await svc.adminCleanupInventories(dryRun ?? true, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo ejecutar la limpieza"); }
  },

  addMaintenanceRecord: async (_, { inventoryId, input }, ctx) => {
    try { return await svc.addMaintenanceRecord(inventoryId, input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo registrar el mantenimiento"); }
  },

  deleteMaintenanceRecord: async (_, { id }, ctx) => {
    try { return await svc.deleteMaintenanceRecord(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo eliminar el registro"); }
  },
};
