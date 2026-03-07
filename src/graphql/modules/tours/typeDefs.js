/**
 * tours/typeDefs.js
 */
const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum TourStatus {
    DRAFT
    ACTIVE
    CLOSED
    CANCELLED
  }

  enum TourParticipantStatus {
    PENDING
    CONFIRMED
    CANCELLED
  }

  enum TourParticipantRole {
    MUSICIAN
    STAFF
    DIRECTOR
    GUEST
  }

  enum Sex {
    M
    F
    OTHER
    UNKNOWN
  }

  # ─── Types ──────────────────────────────────────────────────────────────────

  type Tour {
    id: ID!
    name: String!
    destination: String!
    country: String!
    startDate: DateTime!
    endDate: DateTime!
    status: TourStatus!
    description: String
    createdBy: User
    updatedBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TourParticipant {
    id: ID!
    tour: Tour!
    # Identidad propia — fuente: Excel o entrada manual
    firstName: String!
    firstSurname: String!
    secondSurname: String
    identification: String!
    email: String
    phone: String
    birthDate: DateTime
    sex: Sex!
    instrument: String
    grade: String
    # Datos migratorios
    passportNumber: String
    passportExpiry: DateTime
    hasVisa: Boolean!
    visaExpiry: DateTime
    hasExitPermit: Boolean!
    # Estado
    status: TourParticipantStatus!
    role: TourParticipantRole!
    notes: String
    # Enlace opcional al sistema de usuarios
    linkedUser: User
    # Auditoría
    addedBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TourParticipantBatchResult {
    inserted: Int!
    duplicates: Int!
    errors: Int!
    participants: [TourParticipant!]!
  }

  # ─── Inputs ─────────────────────────────────────────────────────────────────

  input TourInput {
    name: String
    destination: String
    country: String
    startDate: DateTime
    endDate: DateTime
    status: TourStatus
    description: String
  }

  input CreateTourParticipantInput {
    firstName: String!
    firstSurname: String!
    secondSurname: String
    identification: String!
    email: String
    phone: String
    birthDate: DateTime
    sex: Sex
    instrument: String
    grade: String
    passportNumber: String
    passportExpiry: DateTime
    hasVisa: Boolean
    visaExpiry: DateTime
    hasExitPermit: Boolean
    role: TourParticipantRole
    notes: String
    linkedUserId: ID
  }

  input UpdateTourParticipantInput {
    firstName: String
    firstSurname: String
    secondSurname: String
    identification: String
    email: String
    phone: String
    birthDate: DateTime
    sex: Sex
    instrument: String
    grade: String
    passportNumber: String
    passportExpiry: DateTime
    hasVisa: Boolean
    visaExpiry: DateTime
    hasExitPermit: Boolean
    status: TourParticipantStatus
    role: TourParticipantRole
    notes: String
    linkedUserId: ID
  }

  input TourFilterInput {
    status: TourStatus
  }

  input TourParticipantFilterInput {
    status: TourParticipantStatus
    role: TourParticipantRole
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    getTour(id: ID!): Tour
    getTours(filter: TourFilterInput): [Tour!]!
    getTourParticipants(tourId: ID!, filter: TourParticipantFilterInput): [TourParticipant!]!
    getTourParticipant(id: ID!): TourParticipant
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    createTour(input: TourInput!): Tour!
    updateTour(id: ID!, input: TourInput!): Tour!
    deleteTour(id: ID!): String!

    createTourParticipant(tourId: ID!, input: CreateTourParticipantInput!): TourParticipant!
    createTourParticipantsBatch(tourId: ID!, participants: [CreateTourParticipantInput!]!): TourParticipantBatchResult!
    updateTourParticipant(id: ID!, input: UpdateTourParticipantInput!): TourParticipant!
    updateTourParticipantSex(participantId: ID!, sex: Sex!): TourParticipant!
    removeTourParticipant(id: ID!): String!
  }
`;
