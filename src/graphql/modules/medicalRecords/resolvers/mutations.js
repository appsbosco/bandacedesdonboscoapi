/**
 * medicalRecords - Mutations
 * Resolvers delgados: delegan al service
 */
const medicalRecordService = require("../services/medicalRecord.service");

module.exports = {
  newMedicalRecord: async (_, { input }, ctx) => {
    try {
      return await medicalRecordService.createMedicalRecord(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear la ficha médica");
    }
  },

  updateMedicalRecord: async (_, { id, input }, ctx) => {
    try {
      return await medicalRecordService.updateMedicalRecord(id, input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar la ficha médica");
    }
  },

  deleteMedicalRecord: async (_, { id }, ctx) => {
    try {
      return await medicalRecordService.deleteMedicalRecord(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar la ficha médica");
    }
  },
};
