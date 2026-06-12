const { gql } = require("apollo-server");

module.exports = gql`
  # ============================================
  # ENUMS
  # ============================================

  enum AbsenceRequestStatus {
    PENDING
    APPROVED
    REJECTED
    CANCELLED
  }

  enum AbsenceJustificationStatus {
    PENDING_REVIEW
    JUSTIFIED
    NOT_JUSTIFIED
  }

  enum AbsenceTargetType {
    REHEARSAL
    PERFORMANCE
  }

  enum AbsencePermissionType {
    ABSENCE
    LATE_ARRIVAL
    EARLY_WITHDRAWAL
  }

  enum AbsenceRequesterType {
    PARENT
    USER
  }

  # ============================================
  # TYPES
  # ============================================

  type AbsencePermission {
    id: ID!
    student: User!
    requesterType: AbsenceRequesterType!
    requestedByParent: Parent
    requestedByUser: User
    permissionType: AbsencePermissionType!
    targetType: AbsenceTargetType!
    rehearsalSession: RehearsalSession
    event: Event
    absenceDate: String!
    reason: String!
    arrivalTime: String
    withdrawalTime: String
    attachments: [String!]!
    requestStatus: AbsenceRequestStatus!
    justificationStatus: AbsenceJustificationStatus!
    reviewedBy: User
    reviewedAt: String
    adminNotes: String
    statusHistory: [AbsenceStatusHistoryEntry!]!
    createdAt: String!
    updatedAt: String!
  }

  type AbsenceStatusHistoryEntry {
    requestStatus: AbsenceRequestStatus
    justificationStatus: AbsenceJustificationStatus
    changedBy: User
    notes: String
    changedAt: String!
  }

  # Lightweight type for the attendance-taking view.
  # Tells the list-taker whether a permission exists and its state
  # before or during recording attendance.
  type AbsencePermissionSummary {
    id: ID!
    studentId: ID!
    permissionType: AbsencePermissionType!
    requestStatus: AbsenceRequestStatus!
    justificationStatus: AbsenceJustificationStatus!
    reason: String!
    requesterType: AbsenceRequesterType!
    # Suggested attendance status based on approval + justification
    suggestedAttendanceStatus: AttendanceStatus
  }

  type PaginatedAbsencePermissions {
    items: [AbsencePermission!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  # ============================================
  # INPUTS
  # ============================================

  input CreateAbsencePermissionInput {
    studentId: ID!
    permissionType: AbsencePermissionType = ABSENCE
    targetType: AbsenceTargetType!
    rehearsalSessionId: ID
    eventId: ID
    reason: String!
    arrivalTime: String
    withdrawalTime: String
    attachments: [String!]
  }

  input UpdateAbsencePermissionInput {
    permissionType: AbsencePermissionType
    reason: String
    arrivalTime: String
    withdrawalTime: String
    attachments: [String!]
  }

  input ReviewAbsencePermissionInput {
    requestStatus: AbsenceRequestStatus!
    justificationStatus: AbsenceJustificationStatus!
    adminNotes: String
  }

  input AbsencePermissionFilterInput {
    requestStatus: AbsenceRequestStatus
    justificationStatus: AbsenceJustificationStatus
    permissionType: AbsencePermissionType
    targetType: AbsenceTargetType
    eventId: ID
    studentId: ID
    startDate: String
    endDate: String
    section: Section
  }

  # ============================================
  # QUERIES
  # ============================================

  extend type Query {
    # Parent: view requests they made for their children
    getMyAbsencePermissions(
      limit: Int
      offset: Int
    ): PaginatedAbsencePermissions!

    # Parent: view requests for a specific child
    getAbsencePermissionsForChild(
      childId: ID!
      limit: Int
      offset: Int
    ): PaginatedAbsencePermissions!

    # Exalumno / User: view own requests
    getMyUserAbsencePermissions(
      limit: Int
      offset: Int
    ): PaginatedAbsencePermissions!

    # Admin: full list with filters
    getAbsencePermissionsAdmin(
      filter: AbsencePermissionFilterInput
      limit: Int
      offset: Int
    ): PaginatedAbsencePermissions!

    # Section principal: requests relevant to their section
    getAbsencePermissionsForSection(
      section: Section!
      startDate: String
      endDate: String
      limit: Int
      offset: Int
    ): PaginatedAbsencePermissions!

    # Attendance integration: get all active permissions for a session
    # (PENDING or APPROVED) to inform list-taking
    getPermissionsForSession(
      sessionId: ID!
    ): [AbsencePermissionSummary!]!

    # Rehearsal list-taking starts before a section session necessarily exists.
    getPermissionsForRehearsalDate(
      date: String!
    ): [AbsencePermissionSummary!]!

    # Presentations integration: permissions linked to an event
    getPermissionsForEvent(
      eventId: ID!
    ): [AbsencePermissionSummary!]!

    # Single permission detail
    getAbsencePermission(id: ID!): AbsencePermission!
  }

  # ============================================
  # MUTATIONS
  # ============================================

  extend type Mutation {
    # Called by a parent (for a child) or an exalumno (for themselves)
    createAbsencePermissionRequest(
      input: CreateAbsencePermissionInput!
    ): AbsencePermission!

    # Requester can edit their own request while it is not approved/cancelled
    updateAbsencePermissionRequest(
      id: ID!
      input: UpdateAbsencePermissionInput!
    ): AbsencePermission!

    # Admin / authorized role: approve, reject, and set justification
    reviewAbsencePermissionRequest(
      id: ID!
      input: ReviewAbsencePermissionInput!
    ): AbsencePermission!

    # Requester cancels their own pending request
    cancelAbsencePermissionRequest(id: ID!): AbsencePermission!

    # Admin only: reopen a reviewed request to PENDING for re-evaluation
    reopenAbsencePermissionRequest(id: ID!): AbsencePermission!
  }
`;
