const storeService = require("../services/store.service");

const wrap =
  (fn, msg) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || msg);
    }
  };

module.exports = {
  products: wrap(
    (_, __, ctx) => storeService.getProducts(ctx),
    "No se pudo listar productos",
  ),
  orders: wrap(
    (_, __, ctx) => storeService.getOrders(ctx),
    "No se pudo listar órdenes",
  ),
  orderByUserId: wrap(
    (_, { userId }, ctx) => storeService.getOrdersByUserId(userId, ctx),
    "No se pudo obtener órdenes del usuario",
  ),
  orderById: wrap(
    (_, { id }, ctx) => storeService.getOrderById(id, ctx),
    "No se pudo obtener la orden",
  ),

  reportDailySummary: wrap(
    (_, { startDate, endDate }, ctx) =>
      storeService.reportDailySummary(startDate, endDate, ctx),
    "Error en reporte diario",
  ),
  reportProductRange: wrap(
    (_, { startDate, endDate }, ctx) =>
      storeService.reportProductRange(startDate, endDate, ctx),
    "Error en reporte por producto",
  ),
  reportDayBreakdown: wrap(
    (_, { startDate, endDate }, ctx) =>
      storeService.reportDayBreakdown(startDate, endDate, ctx),
    "Error en reporte de desglose",
  ),
};
