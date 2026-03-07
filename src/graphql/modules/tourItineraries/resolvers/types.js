const TourFlight = require("../../../../../models/TourFlight");
const TourItineraryAssignment = require("../../../../../models/TourItineraryAssignment");
const TourParticipant = require("../../../../../models/TourParticipant");

const toISO = (v) => (!v ? null : v instanceof Date ? v.toISOString() : String(v));

module.exports = {
  TourItinerary: {
    id:      (p) => p._id?.toString() ?? p.id,
    tourId:  (p) => p.tour?.toString() ?? p.tourId,
    createdAt: (p) => toISO(p.createdAt),
    updatedAt: (p) => toISO(p.updatedAt),

    maxPassengers: (p) => p.maxPassengers ?? 60,

    seatsRemaining: async (parent) => {
      const max = parent.maxPassengers ?? 60;
      const count = await TourItineraryAssignment.countDocuments({
        itinerary: parent._id ?? parent.id,
      });
      return Math.max(0, max - count);
    },

    flights: async (parent) => {
      const id = parent._id ?? parent.id;
      return TourFlight.find({ itineraryId: id })
        .populate("passengers.participant")
        .populate("createdBy", "name firstSurName")
        .populate("updatedBy", "name firstSurName")
        .sort({ departureAt: 1 });
    },

    flightCount: async (parent) => {
      return TourFlight.countDocuments({ itineraryId: parent._id ?? parent.id });
    },

    participants: async (parent) => {
      const id = parent._id ?? parent.id;
      const assignments = await TourItineraryAssignment.find({ itinerary: id })
        .select("participant")
        .lean();
      const ids = assignments.map((a) => a.participant);
      if (!ids.length) return [];
      return TourParticipant.find({ _id: { $in: ids } }).sort({ firstSurname: 1, firstName: 1 });
    },

    passengerCount: async (parent) => {
      return TourItineraryAssignment.countDocuments({ itinerary: parent._id ?? parent.id });
    },

    leaders: async (parent) => {
      const ids = parent.leaderIds || [];
      if (!ids.length) return [];
      return TourParticipant.find({ _id: { $in: ids } }).sort({ firstSurname: 1, firstName: 1 });
    },

    leaderCount: (parent) => (parent.leaderIds || []).length,
  },
};
