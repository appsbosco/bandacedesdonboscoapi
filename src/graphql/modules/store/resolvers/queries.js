/**
 * store - Queries
 * Resolvers delgados: delegan al service
 */
const storeService = require("../services/store.service");

module.exports = {
  products: async (_, __, ctx) => {
    try {
      return await storeService.getProducts(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar productos");
    }
  },

  orders: async (_, __, ctx) => {
    try {
      return await storeService.getOrders(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar órdenes");
    }
  },

  orderByUserId: async (_, { userId }, ctx) => {
    try {
      return await storeService.getOrdersByUserId(userId, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener órdenes del usuario",
      );
    }
  },

  orderById: async (_, { id }, ctx) => {
    try {
      return await storeService.getOrderById(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener la orden");
    }
  },
};
