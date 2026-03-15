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

  # Configuración de acceso self-service por módulo (gestionada por Admin)
  type TourSelfServiceAccess {
    enabled:   Boolean!
    documents: Boolean!
    payments:  Boolean!
    rooms:     Boolean!
    itinerary: Boolean!
    flights:   Boolean!
  }

  type Tour {
    id: ID!
    name: String!
    destination: String!
    country: String!
    startDate: DateTime!
    endDate: DateTime!
    status: TourStatus!
    description: String
    selfServiceAccess: TourSelfServiceAccess!
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

  type DeleteTourParticipantCascade {
    itineraryAssignments: Int!
    routeAssignments: Int!
    roomsModified: Int!
    itinerariesModified: Int!
    payments: Int!
    installments: Int!
    financialAccounts: Int!
  }

  type DeleteTourParticipantResult {
    success: Boolean!
    deletedId: ID!
    cascadeResults: DeleteTourParticipantCascade!
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

  input TourSelfServiceAccessInput {
    enabled:   Boolean
    documents: Boolean
    payments:  Boolean
    rooms:     Boolean
    itinerary: Boolean
    flights:   Boolean
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    getTour(id: ID!): Tour
    getTours(filter: TourFilterInput): [Tour!]!
    # Admin-only: lista completa de participantes
    getTourParticipants(tourId: ID!, filter: TourParticipantFilterInput): [TourParticipant!]!
    getTourParticipant(id: ID!): TourParticipant

    # Self-service: devuelve el participante vinculado al usuario autenticado
    myTourParticipant(tourId: ID!): TourParticipant

    # Parent self-service: participantes de los hijos del padre autenticado en una gira
    myChildrenTourAccess(tourId: ID!): [TourParticipant!]!
    # Parent self-service: participante de un hijo específico
    myChildTourParticipant(tourId: ID!, childUserId: ID!): TourParticipant
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    createTour(input: TourInput!): Tour!
    updateTour(id: ID!, input: TourInput!): Tour!
    deleteTour(id: ID!): String!

    # Admin-only: configura el acceso self-service por gira
    updateTourSelfServiceAccess(tourId: ID!, input: TourSelfServiceAccessInput!): Tour!

    createTourParticipant(tourId: ID!, input: CreateTourParticipantInput!): TourParticipant!
    createTourParticipantsBatch(tourId: ID!, participants: [CreateTourParticipantInput!]!): TourParticipantBatchResult!
    updateTourParticipant(id: ID!, input: UpdateTourParticipantInput!): TourParticipant!
    updateTourParticipantSex(participantId: ID!, sex: Sex!): TourParticipant!
    removeTourParticipant(id: ID!): String!
    deleteTourParticipant(id: ID!): DeleteTourParticipantResult!
  }
`;
