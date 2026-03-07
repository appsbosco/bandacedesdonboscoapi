const svc = require("../services/ensembles.service");

module.exports = {
  setUserEnsembles: async (_, { userId, ensembleKeys }, ctx) => {
    try { return await svc.setUserEnsembles(userId, ensembleKeys, ctx); }
    catch (e) { console.error("[mutation:setUserEnsembles]", e.message); throw new Error(e.message); }
  },

  addUserToEnsembles: async (_, { userIds, ensembleKeys }, ctx) => {
    try { return await svc.addUserToEnsembles(userIds, ensembleKeys, ctx); }
    catch (e) { console.error("[mutation:addUserToEnsembles]", e.message); throw new Error(e.message); }
  },

  removeUserFromEnsembles: async (_, { userIds, ensembleKeys }, ctx) => {
    try { return await svc.removeUserFromEnsembles(userIds, ensembleKeys, ctx); }
    catch (e) { console.error("[mutation:removeUserFromEnsembles]", e.message); throw new Error(e.message); }
  },
};
