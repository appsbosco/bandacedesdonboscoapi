/**
 * tourRoutes/typeDefs.js
 * Routes are the primary entity for passenger assignment.
 * A route groups all flight legs of one itinerary direction.
 */
const { gql } = require("apollo-server");

module.exports = gql`
  enum RouteDirection {
    OUTBOUND
    INBOUND
  }

  type TourRoute {
    id: ID!
    tourId: ID!
    name: String!
    direction: RouteDirection!
    origin: String
    destination: String
    notes: String
    flights: [TourFlight!]!
    participants: [TourParticipant!]!
    passengerCount: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input TourRouteInput {
    name: String!
    direction: RouteDirection!
    origin: String
    destination: String
    notes: String
  }

  type RouteAssignResult {
    route: TourRoute!
    assigned: Int!
    removed: Int!
    skipped: Int!
    conflicts: [RouteAssignConflict!]!
    passengerCount: Int!
  }

  type RouteAssignConflict {
    participantId: ID!
    participantName: String!
    conflictingRoute: String!
  }

  extend type Query {
    getTourRoutes(tourId: ID!): [TourRoute!]!
    getTourRoute(id: ID!): TourRoute
    getUnassignedTourFlights(tourId: ID!): [TourFlight!]!
  }

  extend type Mutation {
    createTourRoute(tourId: ID!, input: TourRouteInput!): TourRoute!
    updateTourRoute(id: ID!, input: TourRouteInput!): TourRoute!
    deleteTourRoute(id: ID!): Boolean!
    assignFlightsToRoute(routeId: ID!, flightIds: [ID!]!): TourRoute!
    unassignFlightsFromRoute(routeId: ID!, flightIds: [ID!]!): TourRoute!
    assignPassengersToRoute(routeId: ID!, participantIds: [ID!]!): RouteAssignResult!
    removePassengersFromRoute(routeId: ID!, participantIds: [ID!]!): RouteAssignResult!
  }
`;
