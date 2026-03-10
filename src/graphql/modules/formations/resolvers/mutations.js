const svc = require("../services/formations.service");

module.exports = {
  createFormation: async (_, { input }, ctx) => {
    try { return await svc.createFormation(input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo crear la formación"); }
  },

  updateFormation: async (_, { id, input }, ctx) => {
    try { return await svc.updateFormation(id, input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo actualizar la formación"); }
  },

  deleteFormation: async (_, { id }, ctx) => {
    try { return await svc.deleteFormation(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo eliminar la formación"); }
  },

  createFormationTemplate: async (_, { input }, ctx) => {
    try { return await svc.createFormationTemplate(input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo crear la plantilla"); }
  },

  updateFormationTemplate: async (_, { id, input }, ctx) => {
    try { return await svc.updateFormationTemplate(id, input, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo actualizar la plantilla"); }
  },

  deleteFormationTemplate: async (_, { id }, ctx) => {
    try { return await svc.deleteFormationTemplate(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo eliminar la plantilla"); }
  },
};
