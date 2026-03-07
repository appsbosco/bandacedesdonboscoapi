/**
 * tourFlights/resolvers/types.js
 */
const TourItinerary = require("../../../../../models/TourItinerary");

const toISO = (val) => (!val ? null : val instanceof Date ? val.toISOString() : String(val));

module.exports = {
  TourFlight: {
    id:          (parent) => parent._id?.toString() ?? parent.id,
    itineraryId: (parent) => parent.itineraryId?.toString() ?? null,
    itinerary:   async (parent) => {
      if (!parent.itineraryId) return null;
      return TourItinerary.findById(parent.itineraryId);
    },
    departureAt:  (parent) => toISO(parent.departureAt),
    arrivalAt:    (parent) => toISO(parent.arrivalAt),
    passengerCount: (parent) => (parent.passengers || []).length,
    createdAt:    (parent) => toISO(parent.createdAt),
    updatedAt:    (parent) => toISO(parent.updatedAt),
  },

  TourFlightPassenger: {
    confirmedAt: (parent) => toISO(parent.confirmedAt),
  },
};
