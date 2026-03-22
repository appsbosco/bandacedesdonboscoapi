/**
 * events/typeDefs.js
 * GraphQL schema actualizado con categorías, notificationMode y campos enriquecidos
 */
const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────
  enum EventCategory {
    presentation
    rehearsal
    meeting
    activity
    logistics
    other
  }

  enum NotificationMode {
    NONE
    DRY_RUN
    LIVE
  }

  enum EventPriority {
    low
    normal
    high
  }

  # ─── Types ──────────────────────────────────────────────────────────────────
  type NotificationLog {
    mode: NotificationMode!
    dispatchedAt: String
    audience: [String]
    tokenCount: Int
    successCount: Int
    failureCount: Int
    dryRunPayload: String
    error: String
  }

  type BusCapacity {
    busNumber: Int!
    capacity: Int!
  }

  type Event {
    id: ID!
    title: String!
    description: String
    category: EventCategory!
    type: String
    date: String!
    time: String
    departure: String
    arrival: String
    place: String
    notificationMode: NotificationMode!
    audience: [String]
    notificationLog: NotificationLog
    busCapacities: [BusCapacity!]!
    transportPaymentEnabled: Boolean!
    priority: EventPriority
    visibility: String
    createdAt: String
    updatedAt: String
  }

  # ─── Inputs ─────────────────────────────────────────────────────────────────
  input BusCapacityInput {
    busNumber: Int!
    capacity: Int!
  }

  input EventInput {
    id: ID
    title: String!
    description: String
    category: EventCategory!
    type: String
    date: String!
    time: String
    departure: String
    arrival: String
    place: String
    notificationMode: NotificationMode
    audience: [String]
    busCapacities: [BusCapacityInput!]
    transportPaymentEnabled: Boolean
    priority: EventPriority
    visibility: String
  }

  input EventFilterInput {
    category: EventCategory
    type: String
    dateFrom: String
    dateTo: String
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────
  extend type Query {
    getEvent(id: ID!): Event
    getEvents(filter: EventFilterInput): [Event]
    getEventsByDateRange(from: String!, to: String!): [Event]
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────
  extend type Mutation {
    newEvent(input: EventInput!): Event
    updateEvent(id: ID!, input: EventInput!): Event
    deleteEvent(id: ID!): String
  }
`;
