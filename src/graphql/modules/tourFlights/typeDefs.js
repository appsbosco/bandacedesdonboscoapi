/**
 * tourFlights/typeDefs.js
 */
const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum FlightDirection {
    OUTBOUND
    INBOUND
    CONNECTING
  }

  # ─── Types ──────────────────────────────────────────────────────────────────

  type TourFlightPassenger {
    participant: TourParticipant!
    seatNumber: String
    confirmedAt: DateTime
  }

  type TourFlight {
    id: ID!
    tour: Tour!
    airline: String!
    flightNumber: String!
    origin: String!
    destination: String!
    departureAt: DateTime!
    arrivalAt: DateTime!
    direction: FlightDirection!
    itineraryId: ID
    itinerary: TourItinerary
    notes: String
    passengers: [TourFlightPassenger!]!
    passengerCount: Int!
    createdBy: User
    updatedBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Inputs ─────────────────────────────────────────────────────────────────

  input TourFlightInput {
    tourId: ID
    airline: String
    flightNumber: String
    origin: String
    destination: String
    departureAt: DateTime
    arrivalAt: DateTime
    direction: FlightDirection
    itineraryId: ID
    notes: String
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    getTourFlights(tourId: ID!): [TourFlight!]!
    getTourFlight(id: ID!): TourFlight
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    createTourFlight(input: TourFlightInput!): TourFlight!
    updateTourFlight(id: ID!, input: TourFlightInput!): TourFlight!
    deleteTourFlight(id: ID!): String!

    assignPassenger(flightId: ID!, participantId: ID!): TourFlight!
    assignPassengers(flightId: ID!, participantIds: [ID!]!): TourFlightBulkResult!
    removePassenger(flightId: ID!, participantId: ID!): TourFlight!
  }

  # ─── Bulk result ─────────────────────────────────────────────────────────────

  type TourFlightBulkResult {
    flight: TourFlight!
    assigned: Int!
    skipped: Int!
    conflicts: [TourFlightConflict!]!
  }

  type TourFlightConflict {
    participantId: ID!
    participantName: String!
    conflictingFlight: String!
    conflictingRoute: String!
  }
`;
