/**
 * tours/resolvers/types.js
 * Serializa campos Mongoose → GraphQL.
 */

const toISO = (val) => {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
};

module.exports = {
  Tour: {
    id: (parent) => parent._id?.toString() ?? parent.id,
    startDate: (parent) => toISO(parent.startDate),
    endDate:   (parent) => toISO(parent.endDate),
    createdAt: (parent) => toISO(parent.createdAt),
    updatedAt: (parent) => toISO(parent.updatedAt),
  },

  TourParticipant: {
    id:             (parent) => parent._id?.toString() ?? parent.id,
    birthDate:      (parent) => toISO(parent.birthDate),
    passportExpiry: (parent) => toISO(parent.passportExpiry),
    visaExpiry:     (parent) => toISO(parent.visaExpiry),
    visaDecisionDate: (parent) => toISO(parent.visaDecisionDate),
    visaLastDeniedAt: (parent) => toISO(parent.visaLastDeniedAt),
    visaBlockedAt: (parent) => toISO(parent.visaBlockedAt),
    removedAt:      (parent) => toISO(parent.removedAt),
    createdAt:      (parent) => toISO(parent.createdAt),
    updatedAt:      (parent) => toISO(parent.updatedAt),
  },

  TourParticipantVisaHistoryEntry: {
    id: (parent) => parent._id?.toString() ?? parent.id,
    decidedAt: (parent) => toISO(parent.decidedAt),
  },
};
