/**
 * travelForms - Queries
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

const travelFormsService = require("../services/travelForms.service");

module.exports = {
  getGuatemala: async () => {
    return await travelFormsService.getGuatemala();
  },
};
