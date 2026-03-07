/**
 * tourImports/resolvers/queries.js
 */
const tourImportsService = require("../services/tourImports.service");

module.exports = {
  getTourImportBatch: async (_, { id }, ctx) => {
    try {
      return await tourImportsService.getTourImportBatch(id, ctx);
    } catch (error) {
      console.error("[query:getTourImportBatch]", error.message);
      throw new Error(error.message || "No se pudo obtener el batch");
    }
  },

  getTourImportBatches: async (_, { tourId }, ctx) => {
    try {
      return await tourImportsService.getTourImportBatches(tourId, ctx);
    } catch (error) {
      console.error("[query:getTourImportBatches]", error.message);
      throw new Error(error.message || "No se pudo listar los batches");
    }
  },
};
