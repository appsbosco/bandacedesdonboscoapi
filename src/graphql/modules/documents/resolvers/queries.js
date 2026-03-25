/**
 * documents - Queries
 * Resolvers delgados
 */
const documentService = require("../services/document.service");

const DOCUMENT_ADMIN_ROLES = new Set(["Admin", "CEDES Financiero"]);

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

  allDocuments: async (_, { filters, pagination }, ctx) => {
    try {
      // Verificar rol admin en el resolver (no en el service, para mantener separación)
      const user = ctx?.user || ctx?.me || ctx?.currentUser;
      const isAdmin =
        DOCUMENT_ADMIN_ROLES.has(user?.role) ||
        user?.roles?.some((role) => DOCUMENT_ADMIN_ROLES.has(role));
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
