/**
 * exalumnos - Mutations
 * Resolvers delgados: delegan al service
 */
const exalumnoService = require("../services/exalumno.service");

module.exports = {
  addExAlumno: async (_, { input }, ctx) => {
    try {
      return await exalumnoService.addExAlumno(input, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo agregar exalumno");
    }
  },
};
