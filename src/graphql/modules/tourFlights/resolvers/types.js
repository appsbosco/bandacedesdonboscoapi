/**
 * tourFlights/resolvers/types.js
 */

const toISO = (val) => {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
};

module.exports = {
  TourFlight: {
    id: (parent) => parent._id?.toString() ?? parent.id,
    departureAt: (parent) => toISO(parent.departureAt),
    arrivalAt: (parent) => toISO(parent.arrivalAt),
    passengerCount: (parent) => (parent.passengers || []).length,
    createdAt: (parent) => toISO(parent.createdAt),
    updatedAt: (parent) => toISO(parent.updatedAt),
  },

  TourFlightPassenger: {
    confirmedAt: (parent) => toISO(parent.confirmedAt),
  },
};
