/**
 * tourImports/resolvers/types.js
 */

const toISO = (val) => {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
};

module.exports = {
  TourImportBatch: {
    id:          (parent) => parent._id?.toString() ?? parent.id,
    confirmedAt: (parent) => toISO(parent.confirmedAt),
    createdAt:   (parent) => toISO(parent.createdAt),
    updatedAt:   (parent) => toISO(parent.updatedAt),
  },
};
