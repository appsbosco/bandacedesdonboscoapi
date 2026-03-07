const svc = require("../services/ensembles.service");

const toISO = (v) => (!v ? null : v instanceof Date ? v.toISOString() : String(v));

module.exports = {
  Ensemble: {
    id:         (p) => p._id?.toString() ?? p.id,
    createdAt:  (p) => toISO(p.createdAt),
    updatedAt:  (p) => toISO(p.updatedAt),
    memberCount: async (parent) => svc.getMemberCount(parent.name),
  },
};
