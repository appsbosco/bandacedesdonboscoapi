/**
 * documents - Mutations
 * Resolvers delgados
 */
const documentService = require("../services/document.service");

module.exports = {
  validateTicket: async (_, { qrCode }, ctx) => {
    try {
      return await documentService.validateTicket(qrCode, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo validar el ticket");
    }
  },

  createDocument: async (_, { input }, ctx) => {
    try {
      return await documentService.createDocument(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear el documento");
    }
  },

  addDocumentImage: async (_, { input }, ctx) => {
    try {
      return await documentService.addDocumentImage(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo agregar la imagen al documento",
      );
    }
  },

  upsertDocumentExtractedData: async (_, { input }, ctx) => {
    try {
      return await documentService.upsertDocumentExtractedData(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo actualizar datos extraídos del documento",
      );
    }
  },

  setDocumentStatus: async (_, { documentId, status }, ctx) => {
    try {
      return await documentService.setDocumentStatus(documentId, status, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo actualizar el estado del documento",
      );
    }
  },

  deleteDocument: async (_, { documentId }, ctx) => {
    try {
      return await documentService.deleteDocument(documentId, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar el documento");
    }
  },
};
