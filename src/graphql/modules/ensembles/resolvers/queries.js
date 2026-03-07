const svc = require("../services/ensembles.service");

module.exports = {
  ensembles: async (_, { activeOnly = true }) => {
    try { return await svc.getEnsembles(activeOnly); }
    catch (e) { console.error("[query:ensembles]", e.message); throw new Error(e.message); }
  },

  usersPaginated: async (_, { filter, pagination }, ctx) => {
    try { return await svc.usersPaginated(filter || {}, pagination || {}, ctx); }
    catch (e) { console.error("[query:usersPaginated]", e.message); throw new Error(e.message); }
  },

  ensembleMembers: async (_, { ensembleKey, filter, pagination }, ctx) => {
    try { return await svc.ensembleMembers(ensembleKey, filter || {}, pagination || {}, ctx); }
    catch (e) { console.error("[query:ensembleMembers]", e.message); throw new Error(e.message); }
  },

  ensembleAvailable: async (_, { ensembleKey, filter, pagination }, ctx) => {
    try { return await svc.ensembleAvailable(ensembleKey, filter || {}, pagination || {}, ctx); }
    catch (e) { console.error("[query:ensembleAvailable]", e.message); throw new Error(e.message); }
  },

  ensembleCounts: async (_, { ensembleKey }, ctx) => {
    try { return await svc.ensembleCounts(ensembleKey, ctx); }
    catch (e) { console.error("[query:ensembleCounts]", e.message); throw new Error(e.message); }
  },

  ensembleInstrumentStats: async (_, { ensembleKey }, ctx) => {
    try { return await svc.ensembleInstrumentStats(ensembleKey, ctx); }
    catch (e) { console.error("[query:ensembleInstrumentStats]", e.message); throw new Error(e.message); }
  },
};
