const { gql } = require("apollo-server");

module.exports = gql`
  # ============================================
  # ENUMS
  # ============================================

  enum AttendanceStatus {
    PRESENT
    ABSENT_UNJUSTIFIED
    ABSENT_JUSTIFIED
    LATE
    UNJUSTIFIED_WITHDRAWAL
    JUSTIFIED_WITHDRAWAL
  }

  enum SessionStatus {
    SCHEDULED
    IN_PROGRESS
    CLOSED
  }

  enum Section {
    NO_APLICA
    FLAUTAS
    CLARINETES
    SAXOFONES
    TROMPETAS
    TROMBONES
    TUBAS
    EUFONIOS
    CORNOS
    MALLETS
    PERCUSION
    COLOR_GUARD
    DANZA
  }

  # ============================================
  # TYPES
  # ============================================

  type RehearsalSession {
    id: ID!
    date: String!
    dateNormalized: String!
    section: Section!
    status: SessionStatus!
    takenBy: User
    takenAt: String
    closedAt: String
    attendanceCount: Int!
    attendances: [Attendance!]!
    createdAt: String!
    updatedAt: String!
  }

  type Attendance {
    id: ID!
    session: RehearsalSession
    user: User!
    status: AttendanceStatus!
    notes: String
    recordedBy: User
    createdAt: String!
    updatedAt: String!
    legacyDate: String
    legacyAttended: String
  }

  type AttendanceStats {
    userId: ID!
    user: User!
    totalSessions: Int!
    present: Int!
    absentUnjustified: Int!
    absentJustified: Int!
    late: Int!
    excusedBefore: Int!
    excusedAfter: Int!
    # Métrica calculada: 2 justificadas = 1 injustificada
    equivalentAbsences: Float!
    # Porcentaje de asistencia
    attendancePercentage: Float!
    # Alerta si supera el límite
    exceedsLimit: Boolean!
  }

  type PaginatedSessions {
    sessions: [RehearsalSession!]!
    totalCount: Int!
    hasMore: Boolean!
  }

  type SectionComplianceReport {
    section: Section!
    missedDates: [String!]!
    compliant: Boolean!
  }

  type MissingSectionsReport {
    date: String!
    missingSections: [Section!]!
    recordedSections: [Section!]!
  }

  # ============================================
  # INPUTS
  # ============================================

  input CreateSessionInput {
    date: String!
    section: Section!
  }

  input BulkAttendanceInput {
    userId: ID!
    status: AttendanceStatus!
    notes: String
  }

  input AttendanceFilterInput {
    startDate: String
    endDate: String
    section: Section
    status: AttendanceStatus
    userId: ID
  }

  # ============================================
  # QUERIES
  # ============================================

  extend type Query {
    # Sesiones
    getSession(id: ID!): RehearsalSession

    getSessions(
      limit: Int = 20
      offset: Int = 0
      filter: AttendanceFilterInput
    ): PaginatedSessions!

    # Obtener sesión activa para una sección/fecha
    getActiveSession(date: String!, section: Section!): RehearsalSession

    # Reporte de secciones que no pasaron lista
    getSectionComplianceReport(
      startDate: String!
      endDate: String!
    ): [SectionComplianceReport!]!

    # Asistencias individuales
    getAttendance(id: ID!): Attendance

    getAttendancesByUser(
      userId: ID!
      limit: Int = 50
      offset: Int = 0
    ): [Attendance!]!

    # Estadísticas de asistencia de un usuario
    getUserAttendanceStats(
      userId: ID!
      startDate: String
      endDate: String
    ): AttendanceStats!

    # Listar todas las asistencias (con filtros)
    getAllAttendancesRehearsal(
      limit: Int = 50
      offset: Int = 0
      filter: AttendanceFilterInput
    ): [Attendance!]!

    # Reporte de secciones faltantes para una fecha dada
    getMissingSectionsForDate(date: String!): MissingSectionsReport!
  }

  # ============================================
  # MUTATIONS
  # ============================================

  extend type Mutation {
    # Crear sesión de ensayo (solo admin o encargados)
    createSession(input: CreateSessionInput!): RehearsalSession!

    # IDEMPOTENTE: Pasar lista (batch)
    # Si la sesión no existe, la crea. Si existe, hace upsert de asistencias.
    takeAttendance(
      date: String!
      section: Section!
      attendances: [BulkAttendanceInput!]!
    ): RehearsalSession!

    # Actualizar asistencia individual (solo admin)
    updateAttendance(
      id: ID!
      status: AttendanceStatus!
      notes: String
    ): Attendance!

    # Cerrar sesión (marca como CLOSED, evita más ediciones)
    closeSession(id: ID!): RehearsalSession!

    # Eliminar asistencia (solo admin)
    deleteAttendance(id: ID!): String!

    # Eliminar sesión completa (solo admin)
    deleteSession(id: ID!): String!
  }
`;
