/**
 * medicalRecords - Queries
 * Resolvers delgados: delegan al service
 */
const medicalRecordService = require("../services/medicalRecord.service");

module.exports = {
  getMedicalRecord: async (_, { id }, ctx) => {
    try {
      return await medicalRecordService.getMedicalRecord(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo obtener la ficha médica");
    }
  },

  getMedicalRecords: async (_, __, ctx) => {
    try {
      return await medicalRecordService.getMedicalRecords(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar fichas médicas");
    }
  },

  getMedicalRecordByUser: async (_, __, ctx) => {
    try {
      return await medicalRecordService.getMedicalRecordByUser(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "No se pudo obtener la ficha médica del usuario",
      );
    }
  },
};
