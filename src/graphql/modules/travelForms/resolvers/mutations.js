/**
 * travelForms - Mutations
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

const travelFormsService = require("../services/travelForms.service");

module.exports = {
  addGuatemala: async (_, { input }) => {
    return await travelFormsService.addGuatemala(input);
  },
};
