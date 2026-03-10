const svc = require("../services/formations.service");

module.exports = {
  formations: async (_, { filter }, ctx) => {
    try { return await svc.getFormations(filter, ctx); }
    catch (e) { throw new Error(e.message || "No se pudieron obtener las formaciones"); }
  },

  formation: async (_, { id }, ctx) => {
    try { return await svc.getFormation(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo obtener la formación"); }
  },

  formationTemplates: async (_, __, ctx) => {
    try { return await svc.getFormationTemplates(ctx); }
    catch (e) { throw new Error(e.message || "No se pudieron obtener las plantillas"); }
  },

  formationTemplate: async (_, { id }, ctx) => {
    try { return await svc.getFormationTemplate(id, ctx); }
    catch (e) { throw new Error(e.message || "No se pudo obtener la plantilla"); }
  },

  formationUsersBySection: async (_, { excludedIds, instrumentMappings }, ctx) => {
    try { return await svc.getUsersBySection(excludedIds, instrumentMappings, ctx); }
    catch (e) { throw new Error(e.message || "No se pudieron cargar los músicos"); }
  },
};
