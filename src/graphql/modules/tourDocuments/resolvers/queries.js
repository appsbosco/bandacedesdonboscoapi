/**
 * tourDocuments/resolvers/queries.js
 */
const tourDocumentsService = require("../services/tourDocuments.service");

module.exports = {
  getTourDocumentStatus: async (_, { tourId }, ctx) => {
    try {
      return await tourDocumentsService.getTourDocumentStatus(tourId, ctx);
    } catch (error) {
      console.error("[query:getTourDocumentStatus]", error.message);
      throw new Error(error.message || "No se pudo obtener el estado documental");
    }
  },

  getTourDocumentAlerts: async (_, { tourId, daysAhead }, ctx) => {
    try {
      return await tourDocumentsService.getTourDocumentAlerts(tourId, daysAhead, ctx);
    } catch (error) {
      console.error("[query:getTourDocumentAlerts]", error.message);
      throw new Error(error.message || "No se pudo obtener las alertas documentales");
    }
  },
};
