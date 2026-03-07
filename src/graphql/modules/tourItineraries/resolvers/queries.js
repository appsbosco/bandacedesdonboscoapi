const svc = require("../services/tourItineraries.service");

module.exports = {
  getTourItineraries: async (_, { tourId }, ctx) => {
    try { return await svc.getTourItineraries(tourId, ctx); }
    catch (e) { console.error("[query:getTourItineraries]", e.message); throw new Error(e.message); }
  },

  getTourItinerary: async (_, { id }, ctx) => {
    try { return await svc.getTourItinerary(id, ctx); }
    catch (e) { console.error("[query:getTourItinerary]", e.message); throw new Error(e.message); }
  },

  getUnassignedTourFlights: async (_, { tourId }, ctx) => {
    try { return await svc.getUnassignedTourFlights(tourId, ctx); }
    catch (e) { console.error("[query:getUnassignedTourFlights]", e.message); throw new Error(e.message); }
  },

  getItineraryPassengers: async (_, { itineraryId }, ctx) => {
    try { return await svc.getItineraryPassengers(itineraryId, ctx); }
    catch (e) { console.error("[query:getItineraryPassengers]", e.message); throw new Error(e.message); }
  },
};
