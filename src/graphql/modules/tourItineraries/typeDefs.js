/**
 * tourItineraries/typeDefs.js
 *
 * An itinerary is a roundtrip travel package (e.g. "United Cotización 1").
 * It holds ALL legs — outbound, connecting and inbound — of one trip offer.
 * Direction is a property of each TourFlight, not of the itinerary.
 * Assigning a passenger to an itinerary enrolls them in every flight leg.
 *
 * Capacity: maxPassengers is a hard limit; seatsRemaining is computed.
 * Leaders:  a subset of assigned passengers designated as group leaders.
 */
const { gql } = require("apollo-server");

module.exports = gql`
  type TourItinerary {
    id: ID!
    tourId: ID!
    name: String!
    notes: String
    maxPassengers: Int!
    seatsRemaining: Int!
    flightCount: Int!
    passengerCount: Int!
    leaderCount: Int!
    flights: [TourFlight!]!
    participants: [TourParticipant!]!
    leaders: [TourParticipant!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input TourItineraryInput {
    name: String!
    notes: String
    maxPassengers: Int
  }

  type ItineraryAssignResult {
    itinerary: TourItinerary!
    assigned: Int!
    removed: Int!
    skipped: Int!
    conflicts: [ItineraryAssignConflict!]!
    passengerCount: Int!
    maxPassengers: Int!
    seatsRemaining: Int!
  }

  type ItineraryAssignConflict {
    participantId: ID!
    participantName: String!
    """
    ALREADY_ASSIGNED — participant is in a different itinerary in this tour.
    CAPACITY_EXCEEDED — no seats left in this itinerary.
    """
    reason: String!
    conflictingItinerary: String
  }

  extend type Query {
    getTourItineraries(tourId: ID!): [TourItinerary!]!
    getTourItinerary(id: ID!): TourItinerary
    getUnassignedTourFlights(tourId: ID!): [TourFlight!]!
    getItineraryPassengers(itineraryId: ID!): [TourParticipant!]!
  }

  extend type Mutation {
    createTourItinerary(tourId: ID!, input: TourItineraryInput!): TourItinerary!
    updateTourItinerary(id: ID!, input: TourItineraryInput!): TourItinerary!
    deleteTourItinerary(id: ID!): Boolean!

    assignFlightsToItinerary(itineraryId: ID!, flightIds: [ID!]!): TourItinerary!
    unassignFlightsFromItinerary(itineraryId: ID!, flightIds: [ID!]!): TourItinerary!

    assignPassengersToItinerary(itineraryId: ID!, participantIds: [ID!]!): ItineraryAssignResult!
    removePassengersFromItinerary(itineraryId: ID!, participantIds: [ID!]!): ItineraryAssignResult!

    """ Replace all leaders for an itinerary. leaderIds must be a subset of assigned passengers. """
    setItineraryLeaders(itineraryId: ID!, leaderIds: [ID!]!): TourItinerary!
    addItineraryLeader(itineraryId: ID!, leaderId: ID!): TourItinerary!
    removeItineraryLeader(itineraryId: ID!, leaderId: ID!): TourItinerary!
  }
`;
