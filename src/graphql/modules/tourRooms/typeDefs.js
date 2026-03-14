/**
 * tourRooms/typeDefs.js
 */
const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum TourRoomType {
    SINGLE
    DOUBLE
    TRIPLE
    QUAD
    SUITE
  }

  # ─── Types ──────────────────────────────────────────────────────────────────

  type TourRoomOccupant {
    participant: TourParticipant!
    confirmedAt: DateTime
  }

  type TourRoom {
    id: ID!
    tour: Tour!
    hotelName: String!
    roomNumber: String!
    roomType: TourRoomType!
    capacity: Int!
    floor: String
    notes: String
    occupants: [TourRoomOccupant!]!
    occupantCount: Int!
    isFull: Boolean!
    responsible: TourParticipant
    createdBy: User
    updatedBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Inputs ─────────────────────────────────────────────────────────────────

  input TourRoomInput {
    tourId: ID
    hotelName: String
    roomNumber: String
    roomType: TourRoomType
    capacity: Int
    floor: String
    notes: String
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    getTourRooms(tourId: ID!): [TourRoom!]!
    getTourRoom(id: ID!): TourRoom
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    createTourRoom(input: TourRoomInput!): TourRoom!
    updateTourRoom(id: ID!, input: TourRoomInput!): TourRoom!
    deleteTourRoom(id: ID!): String!
    assignOccupant(roomId: ID!, participantId: ID!): TourRoom!
    removeOccupant(roomId: ID!, participantId: ID!): TourRoom!
    setRoomResponsible(roomId: ID!, participantId: ID): TourRoom!
  }
`;
