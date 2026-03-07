/**
 * tourRoutes/resolvers/types.js
 *
 * TourRoute field resolvers:
 *   - tourId: extracted from tour ObjectId
 *   - flights: all TourFlights with routeId = this route
 *   - passengerCount: count of TourRouteAssignments for this route
 */
const TourFlight = require("../../../../../models/TourFlight");
const TourRouteAssignment = require("../../../../../models/TourRouteAssignment");
const TourParticipant = require("../../../../../models/TourParticipant");

const toISO = (val) => {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
};

module.exports = {
  TourRoute: {
    id: (parent) => parent._id?.toString() ?? parent.id,
    tourId: (parent) => parent.tour?.toString() ?? parent.tourId,
    createdAt: (parent) => toISO(parent.createdAt),
    updatedAt: (parent) => toISO(parent.updatedAt),

    flights: async (parent) => {
      return TourFlight.find({ routeId: parent._id ?? parent.id })
        .populate("passengers.participant")
        .populate("createdBy", "name firstSurName")
        .populate("updatedBy", "name firstSurName")
        .sort({ departureAt: 1 });
    },

    participants: async (parent) => {
      const routeId = parent._id ?? parent.id;
      const assignments = await TourRouteAssignment.find({ route: routeId })
        .select("participant")
        .lean();
      const ids = assignments.map((a) => a.participant);
      if (ids.length === 0) return [];
      return TourParticipant.find({ _id: { $in: ids } }).sort({ firstSurname: 1, firstName: 1 });
    },

    passengerCount: async (parent) => {
      return TourRouteAssignment.countDocuments({ route: parent._id ?? parent.id });
    },
  },
};
