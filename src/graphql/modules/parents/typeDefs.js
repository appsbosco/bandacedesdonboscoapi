const { gql } = require("apollo-server");

module.exports = gql`
  type Parent {
    id: ID
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    phone: String
    role: String
    avatar: String
    children: [User]
    notificationTokens: [String]
  }

  input ParentInput {
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    phone: String
    role: String
    avatar: String
    children: [ID]
  }

  type ParentDashboard {
    parent: ParentInfo!
    children: [ChildDashboard!]!
    dateRange: DateRange!
    generatedAt: String!
  }

  type ParentInfo {
    id: ID!
    name: String!
    firstSurName: String!
    secondSurName: String!
    email: String!
    phone: String
    avatar: String
    totalChildren: Int!
  }

  type ChildDashboard {
    child: ChildInfo!
    attendanceMetrics: AttendanceMetrics!
    classMetrics: ClassMetrics!
    recentRehearsalAttendance: [RehearsalAttendanceRecord!]!
    recentClassAttendance: [ClassAttendanceRecord!]!
    pendingPayments: [PendingPayment!]!
  }

  type ChildInfo {
    id: ID!
    name: String!
    firstSurName: String!
    secondSurName: String!
    email: String
    phone: String
    avatar: String
    instrument: String
    grade: String
    state: String
  }

  type AttendanceMetrics {
    totalSessions: Int!
    present: Int!
    absentJustified: Int!
    absentUnjustified: Int!
    late: Int!
    withdrawalJustified: Int!
    withdrawalUnjustified: Int!
    attendanceRate: Float!
    lastRecordDate: String
  }

  type ClassMetrics {
    totalClasses: Int!
    present: Int!
    absentJustified: Int!
    absentUnjustified: Int!
    attendanceRate: Float!
    paymentSummary: PaymentSummary!
    lastClassDate: String
  }

  type PaymentSummary {
    totalPending: Int!
    totalPaid: Int!
    totalScholarship: Int!
    pendingAmount: Int!
  }

  type RehearsalAttendanceRecord {
    id: ID!
    date: String!
    status: String!
    notes: String
    sessionId: ID
    recordedBy: String
  }

  type ClassAttendanceRecord {
    id: ID!
    date: String!
    attendanceStatus: String!
    paymentStatus: String!
    justification: String
    instructorName: String
  }

  type PendingPayment {
    id: ID!
    date: String!
    instructorName: String
    daysOverdue: Int!
  }

  type DateRange {
    from: String!
    to: String!
    presetName: String
  }

  input DateRangeInput {
    from: String
    to: String
    preset: DateRangePreset
  }

  enum DateRangePreset {
    LAST_30_DAYS
    LAST_90_DAYS
    LAST_180_DAYS
    CURRENT_YEAR
    ALL_TIME
  }

  input AddChildInput {
    childId: ID!
  }

  input RemoveChildInput {
    childId: ID!
  }

  extend type Query {
    getParent: Parent
    getParents: [Parent]
    getParentDashboard(dateRange: DateRangeInput, childId: ID): ParentDashboard!
  }

  extend type Mutation {
    newParent(input: ParentInput): Parent
    addChildToParent(input: AddChildInput!): Parent!
    removeChildFromParent(input: RemoveChildInput!): Parent!
  }
`;
