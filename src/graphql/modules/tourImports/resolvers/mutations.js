/**
 * tourImports/resolvers/mutations.js
 */
const tourImportsService = require("../services/tourImports.service");

module.exports = {
  previewTourParticipantImport: async (_, { input }, ctx) => {
    try {
      return await tourImportsService.previewTourParticipantImport(input, ctx);
    } catch (error) {
      console.error("[mutation:previewTourParticipantImport]", error.message);
      throw new Error(error.message || "No se pudo procesar el archivo");
    }
  },

  confirmTourParticipantImport: async (_, { input }, ctx) => {
    try {
      return await tourImportsService.confirmTourParticipantImportWithFile(
        input.batchId,
        input.fileBase64,
        input.sheetName,
        ctx
      );
    } catch (error) {
      console.error("[mutation:confirmTourParticipantImport]", error.message);
      throw new Error(error.message || "No se pudo confirmar la importación");
    }
  },

  cancelTourImportBatch: async (_, { batchId }, ctx) => {
    try {
      return await tourImportsService.cancelTourImportBatch(batchId, ctx);
    } catch (error) {
      console.error("[mutation:cancelTourImportBatch]", error.message);
      throw new Error(error.message || "No se pudo cancelar el batch");
    }
  },
};
