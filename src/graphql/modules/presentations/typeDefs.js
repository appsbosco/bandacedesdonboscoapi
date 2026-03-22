const { gql } = require("apollo-server");

module.exports = gql`
  # ─────────────────────────────────────────
  # LEGACY (mantener durante migración)
  # ─────────────────────────────────────────

  type PerformanceAttendance {
    id: ID
    user: User
    event: Event
    attended: String
    busNumber: Int
    hotel: Hotel
  }

  input PerformanceAttendanceInput {
    user: ID
    event: ID
    attended: String
    busNumber: Int
    hotel: ID
  }

  type Hotel {
    id: ID
    name: String
  }

  input HotelInput {
    name: String
  }

  # ─────────────────────────────────────────
  # NUEVO: EventRoster
  # ─────────────────────────────────────────

  enum RosterAttendanceStatus {
    PENDING
    PRESENT
    ABSENT
    LATE
  }

  type EventRosterEntry {
    id: ID!
    event: Event!
    user: User!
    assignmentGroup: String
    busNumber: Int
    plannedBusNumbers: [Int!]!
    transportPlan: TransportPlan
    hotel: Hotel
    excludedFromEvent: Boolean!
    excludedFromTransport: Boolean!
    exclusionReason: String
    attendanceStatus: RosterAttendanceStatus!
    attendanceMarkedBy: User
    attendanceMarkedAt: String
    transportPaid: Boolean!
    transportPaidBy: User
    transportPaidAt: String
    isStaff: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type BusGroupSummary {
    group: String!
    count: Int!
  }

  type TransportPlan {
    mode: String!
    primaryBus: Int
    secondaryBus: Int
    primaryCapacity: Int
  }

  type BusSlot {
    busNumber: Int!
    count: Int!
    plannedCount: Int!
    confirmedCount: Int!
    members: [EventRosterEntry!]!
    groupSummary: [BusGroupSummary!]!
  }

  type EventBusSummary {
    buses: [BusSlot!]!
    unassigned: [EventRosterEntry!]!
    unassignedCount: Int!
  }

  type EventAttendanceSummary {
    total: Int!
    convoked: Int!
    excluded: Int!
    present: Int!
    absent: Int!
    late: Int!
    pending: Int!
    attendanceRate: Float!
  }

  input RosterFilterInput {
    busNumber: Int
    assignmentGroup: String
    excludedFromEvent: Boolean
    attendanceStatus: RosterAttendanceStatus
  }

  input AssignBusOptions {
    maxCapacity: Int
    overflowBus: Int
  }

  input ExclusionInput {
    excludedFromEvent: Boolean
    excludedFromTransport: Boolean
    exclusionReason: String
  }

  input BulkAttendanceEntryInput {
    userId: ID!
    attendanceStatus: RosterAttendanceStatus!
    busNumber: Int
  }

  # ─────────────────────────────────────────
  # QUERIES
  # ─────────────────────────────────────────

  extend type Query {
    # Legacy
    getPerformanceAttendanceByEvent(event: ID!): [PerformanceAttendance]
    getHotel(id: ID!): Hotel
    getHotels: [Hotel]

    # Nuevo
    getEventRoster(
      eventId: ID!
      filter: RosterFilterInput
    ): [EventRosterEntry!]!
    getEventBusSummary(eventId: ID!): EventBusSummary!
    getEventAttendanceSummary(eventId: ID!): EventAttendanceSummary!
  }

  # ─────────────────────────────────────────
  # MUTATIONS
  # ─────────────────────────────────────────

  extend type Mutation {
    # Legacy
    newPerformanceAttendance(
      input: PerformanceAttendanceInput
    ): PerformanceAttendance
    updatePerformanceAttendance(
      id: ID!
      input: PerformanceAttendanceInput
    ): PerformanceAttendance
    deletePerformanceAttendance(id: ID!): String

    newHotel(input: HotelInput): Hotel
    updateHotel(id: ID!, input: HotelInput): Hotel
    deleteHotel(id: ID!): String

    # Nuevo
    initializeEventRoster(eventId: ID!): [EventRosterEntry!]!
    assignBusToGroup(
      eventId: ID!
      assignmentGroup: String!
      busNumber: Int!
      options: AssignBusOptions
    ): [EventRosterEntry!]!
    moveUsersToBus(
      eventId: ID!
      userIds: [ID!]!
      busNumber: Int!
    ): [EventRosterEntry!]!
    setExclusion(
      eventId: ID!
      userId: ID!
      exclusion: ExclusionInput!
    ): EventRosterEntry!
    markAttendance(
      eventId: ID!
      userId: ID!
      attendanceStatus: RosterAttendanceStatus!
    ): EventRosterEntry!
    bulkMarkAttendance(
      eventId: ID!
      entries: [BulkAttendanceEntryInput!]!
    ): [EventRosterEntry!]!
    setTransportPayment(
      eventId: ID!
      userId: ID!
      paid: Boolean!
    ): EventRosterEntry!
  }
`;
