/**
 * exalumnos - Queries
 * Resolvers delgados: delegan al service
 */
const exalumnoService = require("../services/exalumno.service");

module.exports = {
  getExAlumnos: async (_, __, ctx) => {
    try {
      return await exalumnoService.getExAlumnos(ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo listar exalumnos");
    }
  },
};
