const svc = require("../services/tourItineraries.service");

module.exports = {
  createTourItinerary: async (_, { tourId, input }, ctx) => {
    try { return await svc.createTourItinerary(tourId, input, ctx); }
    catch (e) { console.error("[mutation:createTourItinerary]", e.message); throw new Error(e.message); }
  },

  updateTourItinerary: async (_, { id, input }, ctx) => {
    try { return await svc.updateTourItinerary(id, input, ctx); }
    catch (e) { console.error("[mutation:updateTourItinerary]", e.message); throw new Error(e.message); }
  },

  deleteTourItinerary: async (_, { id }, ctx) => {
    try { return await svc.deleteTourItinerary(id, ctx); }
    catch (e) { console.error("[mutation:deleteTourItinerary]", e.message); throw new Error(e.message); }
  },

  assignFlightsToItinerary: async (_, { itineraryId, flightIds }, ctx) => {
    try { return await svc.assignFlightsToItinerary(itineraryId, flightIds, ctx); }
    catch (e) { console.error("[mutation:assignFlightsToItinerary]", e.message); throw new Error(e.message); }
  },

  unassignFlightsFromItinerary: async (_, { itineraryId, flightIds }, ctx) => {
    try { return await svc.unassignFlightsFromItinerary(itineraryId, flightIds, ctx); }
    catch (e) { console.error("[mutation:unassignFlightsFromItinerary]", e.message); throw new Error(e.message); }
  },

  assignPassengersToItinerary: async (_, { itineraryId, participantIds }, ctx) => {
    try { return await svc.assignPassengersToItinerary(itineraryId, participantIds, ctx); }
    catch (e) { console.error("[mutation:assignPassengersToItinerary]", e.message); throw new Error(e.message); }
  },

  removePassengersFromItinerary: async (_, { itineraryId, participantIds }, ctx) => {
    try { return await svc.removePassengersFromItinerary(itineraryId, participantIds, ctx); }
    catch (e) { console.error("[mutation:removePassengersFromItinerary]", e.message); throw new Error(e.message); }
  },

  setItineraryLeaders: async (_, { itineraryId, leaderIds }, ctx) => {
    try { return await svc.setItineraryLeaders(itineraryId, leaderIds, ctx); }
    catch (e) { console.error("[mutation:setItineraryLeaders]", e.message); throw new Error(e.message); }
  },

  addItineraryLeader: async (_, { itineraryId, leaderId }, ctx) => {
    try { return await svc.addItineraryLeader(itineraryId, leaderId, ctx); }
    catch (e) { console.error("[mutation:addItineraryLeader]", e.message); throw new Error(e.message); }
  },

  removeItineraryLeader: async (_, { itineraryId, leaderId }, ctx) => {
    try { return await svc.removeItineraryLeader(itineraryId, leaderId, ctx); }
    catch (e) { console.error("[mutation:removeItineraryLeader]", e.message); throw new Error(e.message); }
  },
};
