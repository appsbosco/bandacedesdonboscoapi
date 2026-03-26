/**
 * documents - Mutations
 * Resolvers delgados — args match typeDefs (no input: wrappers)
 */
const documentService = require("../services/document.service");

module.exports = {
  // createDocument(type: DocumentType!, notes: String): Document!
  createDocument: async (_, { type, notes }, ctx) => {
    try {
      return await documentService.createDocument({ type, notes }, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear el documento");
    }
  },

  // getSignedUpload(documentId: ID!, kind: ImageKind, mimeType: String): SignedUploadResult!
  getSignedUpload: async (_, { documentId, kind, mimeType }, ctx) => {
    try {
      return await documentService.getSignedUpload({ documentId, kind, mimeType }, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo generar la firma de upload");
    }
  },

  // addDocumentImage(documentId: ID!, image: AddDocumentImageInput!): Document!
  addDocumentImage: async (_, { documentId, image }, ctx) => {
    try {
      return await documentService.addDocumentImage({ documentId, image }, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo agregar la imagen al documento");
    }
  },

  // upsertDocumentExtractedData(documentId: ID!, data: UpsertDocumentExtractedDataInput!): Document!
  // Service expects { documentId, extracted } — map 'data' → 'extracted'
  upsertDocumentExtractedData: async (_, { documentId, data }, ctx) => {
    try {
      return await documentService.upsertDocumentExtractedData(
        { documentId, extracted: data },
        ctx
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar datos extraídos del documento");
    }
  },

  // setDocumentStatus(documentId: ID!, status: DocumentStatus!): Document!
  setDocumentStatus: async (_, { documentId, status }, ctx) => {
    try {
      return await documentService.setDocumentStatus(documentId, status, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar el estado del documento");
    }
  },

  // deleteDocument(documentId: ID!): Boolean!
  deleteDocument: async (_, { documentId }, ctx) => {
    try {
      const result = await documentService.deleteDocument(documentId, ctx);
      return result?.success === true;
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar el documento");
    }
  },

  // enqueueDocumentOcr(documentId: ID!): EnqueueOcrResult!
  enqueueDocumentOcr: async (_, { documentId }, ctx) => {
    try {
      const result = await documentService.enqueueDocumentOcr({ documentId }, ctx);
      return { ok: result?.success === true, jobId: result?.jobId || null, message: null };
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo encolar el OCR del documento");
    }
  },

  // processDocumentOcr(documentId: ID!): Document!
  processDocumentOcr: async (_, { documentId }, ctx) => {
    try {
      return await documentService.processDocumentOcrSync({ documentId }, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo procesar el OCR del documento");
    }
  },

  updateDocumentVisibilitySettings: async (_, { restrictSensitiveUploadsToAdmins }, ctx) => {
    try {
      return await documentService.updateDocumentVisibilitySettings(
        { restrictSensitiveUploadsToAdmins },
        ctx
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo actualizar la configuración de visibilidad"
      );
    }
  },
};
