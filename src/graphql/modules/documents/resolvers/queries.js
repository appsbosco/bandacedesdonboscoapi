/**
 * documents - Queries
 * Resolvers delgados
 */
const documentService = require("../services/document.service");

module.exports = {
  myDocuments: async (_, { filters, pagination }, ctx) => {
    try {
      return await documentService.getMyDocuments(
        filters || {},
        pagination || {},
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener tus documentos");
    }
  },

  documentById: async (_, { id }, ctx) => {
    try {
      return await documentService.getDocumentById(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener el documento");
    }
  },

  documentsExpiringSummary: async (_, { referenceDate }, ctx) => {
    try {
      return await documentService.getDocumentsExpiringSummary(
        referenceDate,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener el resumen de vencimientos",
      );
    }
  },

  documentVisibilitySettings: async (_, __, ctx) => {
    try {
      return await documentService.getDocumentVisibilitySettings(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener la configuración de visibilidad de documentos"
      );
    }
  },

  allDocuments: async (_, { filters, pagination }, ctx) => {
    try {
      const user = ctx?.user || ctx?.me || ctx?.currentUser;
      const isAdmin = documentService.isDocumentAdmin(user);
      if (!isAdmin) throw new Error("No autorizado");

      return await documentService.getAllDocuments(
        filters || {},
        pagination || {},
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener los documentos");
    }
  },
};
