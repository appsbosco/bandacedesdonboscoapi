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
    routeGroup: String
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
    routeGroup: String
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

    # Asignar un pasajero a un vuelo (verifica conflicto de routeGroup)
    assignPassenger(flightId: ID!, participantId: ID!): TourFlight!

    # Asignar múltiples pasajeros a un vuelo de una vez
    assignPassengers(
      flightId: ID!
      participantIds: [ID!]!
    ): TourFlightBulkResult!

    # Remover un pasajero de un vuelo
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
