const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ───────────────────────────────────────────────────────────────────

  enum EvaluationStatus {
    pending
    approved
    rejected
  }

  enum TrendDirection {
    UP
    STABLE
    DOWN
  }

  enum RiskLevel {
    GREEN
    YELLOW
    RED
  }

  enum RiskReason {
    BELOW_THRESHOLD
    BELOW_GENERAL
    PERIOD_DROP
  }

  # ─── Types ───────────────────────────────────────────────────────────────────

  type AcademicSubject {
    id: ID!
    name: String!
    code: String
    isActive: Boolean!
    bands: [String!]!
    grades: [String!]!
    createdAt: String
    updatedAt: String
  }

  type AcademicPeriod {
    id: ID!
    name: String!
    year: Int!
    order: Int!
    isActive: Boolean!
    createdAt: String
    updatedAt: String
  }

  type EvalBasicUser {
    id: ID!
    name: String!
    firstSurName: String!
    email: String
    grade: String
    instrument: String
    avatar: String
  }

  type AdminAcademicStudent {
    id: ID!
    name: String!
    firstSurName: String!
    secondSurName: String
    email: String
    grade: String
    instrument: String
    avatar: String
    allEvaluationsSubmitted: Boolean!
    expectedEvaluationsCount: Int!
    submittedEvaluationsCount: Int!
    missingEvaluationsCount: Int!
    coverageByPeriod: [AcademicPeriodCoverage!]!
  }

  type MissingAcademicSubject {
    subjectId: ID!
    subjectName: String!
  }

  type AcademicPeriodCoverage {
    periodId: ID!
    periodName: String!
    year: Int!
    expectedEvaluationsCount: Int!
    submittedEvaluationsCount: Int!
    missingEvaluationsCount: Int!
    missingSubjects: [MissingAcademicSubject!]!
  }

  type StudentAcademicCoverage {
    allEvaluationsSubmitted: Boolean!
    expectedEvaluationsCount: Int!
    submittedEvaluationsCount: Int!
    missingEvaluationsCount: Int!
    coverageByPeriod: [AcademicPeriodCoverage!]!
  }

  # Tipo de lista — NO incluye evidenceUrl (imagen original pesada).
  # Para listas/tablas: usa evidenceThumbnailUrl (thumbnail 120×120).
  # Para ver la evidencia completa: usa query evaluationDetail (carga bajo demanda).
  type AcademicEvaluation {
    id: ID!
    student: EvalBasicUser!
    subject: AcademicSubject!
    period: AcademicPeriod!
    scoreRaw: Float!
    scaleMin: Float!
    scaleMax: Float!
    scoreNormalized100: Float!
    # evidenceUrl omitido intencionalmente en lista — usar evaluationDetail para el modal
    evidencePublicId: String!
    evidenceResourceType: String
    evidenceOriginalName: String
    evidenceThumbnailUrl: String # 120×120 para lista (puede ser null en datos legacy)
    status: EvaluationStatus!
    submittedByStudentAt: String
    reviewedByAdmin: EvalBasicUser
    reviewedAt: String
    reviewComment: String
    parentAcknowledged: Boolean
    parentAcknowledgedAt: String
    parentComment: String
    createdAt: String
    updatedAt: String
  }

  # Tipo de detalle — incluye evidenceUrl y evidencePreviewUrl.
  # Solo se consulta cuando el usuario abre el modal de detalle (lazy load).
  type AcademicEvaluationDetail {
    id: ID!
    student: EvalBasicUser!
    subject: AcademicSubject!
    period: AcademicPeriod!
    scoreRaw: Float!
    scaleMin: Float!
    scaleMax: Float!
    scoreNormalized100: Float!
    evidenceUrl: String!
    evidencePublicId: String!
    evidenceResourceType: String
    evidenceOriginalName: String
    evidenceThumbnailUrl: String
    evidencePreviewUrl: String # 800w para modal (auto format/quality)
    status: EvaluationStatus!
    submittedByStudentAt: String
    reviewedByAdmin: EvalBasicUser
    reviewedAt: String
    reviewComment: String
    parentAcknowledged: Boolean
    parentAcknowledgedAt: String
    parentComment: String
    createdAt: String
    updatedAt: String
  }

  # Resultado paginado para evaluaciones pendientes
  type PendingEvaluationsPage {
    items: [AcademicEvaluation!]!
    hasNextPage: Boolean!
    nextCursor: String
  }

  type SubjectAverage {
    subjectId: ID!
    subjectName: String!
    average: Float!
    evaluationCount: Int!
  }

  type AcademicRiskSubject {
    subjectId: ID!
    subjectName: String!
    average: Float!
    reason: RiskReason!
  }

  type StudentPerformance {
    studentId: ID!
    studentName: String
    averageGeneral: Float!
    approvedCount: Int!
    pendingCount: Int!
    rejectedCount: Int!
    averagesBySubject: [SubjectAverage!]!
    strongestSubjects: [SubjectAverage!]!
    weakestSubjects: [SubjectAverage!]!
    trendDirection: TrendDirection!
    trendDelta: Float!
    riskSubjects: [AcademicRiskSubject!]!
    riskScore: Int!
    riskLevel: RiskLevel!
    recentEvaluations: [AcademicEvaluation!]!
  }

  type AcademicSubjectSummary {
    subjectId: ID!
    subjectName: String!
    overallAverage: Float!
    studentsCount: Int!
    atRiskCount: Int!
  }

  type AcademicPeriodSummary {
    periodId: ID!
    periodName: String!
    year: Int!
    overallAverage: Float!
    studentsCount: Int!
  }

  type AdminAcademicDashboard {
    totalStudentsWithData: Int!
    studentsInGreen: Int!
    studentsInYellow: Int!
    studentsInRed: Int!
    worstPerformers: [StudentPerformance!]!
    mostImproved: [StudentPerformance!]!
    mostDeclined: [StudentPerformance!]!
    subjectPerformanceSummary: [AcademicSubjectSummary!]!
    periodComparisonSummary: [AcademicPeriodSummary!]!
  }

  type ParentChildAcademicData {
    childId: ID!
    childName: String!
    childGrade: String
    performance: StudentPerformance!
    pendingAcknowledgements: [AcademicEvaluation!]!
  }

  type SectionAcademicMember {
    memberId: ID!
    memberName: String!
    memberGrade: String
    memberInstrument: String
    memberAvatar: String
    allEvaluationsSubmitted: Boolean!
    expectedEvaluationsCount: Int!
    submittedEvaluationsCount: Int!
    missingEvaluationsCount: Int!
    coverageByPeriod: [AcademicPeriodCoverage!]!
    performance: StudentPerformance!
  }

  type AcknowledgeAcademicResult {
    success: Boolean!
    message: String!
  }

  # ─── Inputs ──────────────────────────────────────────────────────────────────

  input AcademicSubjectInput {
    name: String!
    code: String
    isActive: Boolean
    bands: [String!]
    grades: [String!]
  }

  input AcademicPeriodInput {
    name: String!
    year: Int!
    order: Int!
    isActive: Boolean
  }

  input SubmitAcademicEvaluationInput {
    subjectId: ID!
    periodId: ID!
    scoreRaw: Float!
    scaleMin: Float
    scaleMax: Float
    evidenceUrl: String!
    evidencePublicId: String!
    evidenceResourceType: String
    evidenceOriginalName: String
  }

  input UpdateAcademicEvaluationInput {
    scoreRaw: Float
    scaleMin: Float
    scaleMax: Float
    evidenceUrl: String
    evidencePublicId: String
    evidenceResourceType: String
    evidenceOriginalName: String
  }

  input AcademicDashboardFilter {
    periodId: ID
    year: Int
    grade: String
    band: String
    instrument: String
    status: EvaluationStatus
    subjectId: ID
  }

  input PaginationCursorInput {
    limit: Int
    cursor: String
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    academicSubjects(grade: String, isActive: Boolean): [AcademicSubject!]!
    academicPeriods(year: Int, isActive: Boolean): [AcademicPeriod!]!

    myAcademicEvaluations(
      filter: AcademicDashboardFilter
    ): [AcademicEvaluation!]!
    myAcademicPerformance(periodId: ID, year: Int): StudentPerformance!
    myAcademicEvaluationCoverage(year: Int): StudentAcademicCoverage!

    studentAcademicEvaluations(
      studentId: ID!
      filter: AcademicDashboardFilter
    ): [AcademicEvaluation!]!
    studentAcademicPerformance(
      studentId: ID!
      periodId: ID
      year: Int
    ): StudentPerformance!

    # Detalle completo de una evaluación — incluye evidenceUrl y evidencePreviewUrl.
    # Llamar solo al abrir modal (lazy load). No usar en listas.
    evaluationDetail(id: ID!): AcademicEvaluationDetail!

    adminAcademicDashboard(
      filter: AcademicDashboardFilter
    ): AdminAcademicDashboard!
    adminAcademicRiskRanking(
      filter: AcademicDashboardFilter
      limit: Int
    ): [StudentPerformance!]!
    adminPendingEvaluations(
      filter: AcademicDashboardFilter
    ): [AcademicEvaluation!]!
    # Versión paginada — preferir esta en producción
    adminPendingEvaluationsPaginated(
      filter: AcademicDashboardFilter
      pagination: PaginationCursorInput
    ): PendingEvaluationsPage!
    adminAcademicStudents(
      filter: AcademicDashboardFilter
    ): [AdminAcademicStudent!]!

    parentChildrenAcademicOverview(
      periodId: ID
      year: Int
    ): [ParentChildAcademicData!]!
    parentChildEvaluations(
      childId: ID!
      filter: AcademicDashboardFilter
    ): [AcademicEvaluation!]!

    sectionInstrumentAcademicOverview(
      periodId: ID
      year: Int
    ): [SectionAcademicMember!]!

    # Evaluaciones pendientes de la propia sección — accesible por Principal de sección.
    sectionPendingEvaluations(
      filter: AcademicDashboardFilter
    ): [AcademicEvaluation!]!
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    createAcademicSubject(input: AcademicSubjectInput!): AcademicSubject!
    updateAcademicSubject(
      id: ID!
      input: AcademicSubjectInput!
    ): AcademicSubject!
    deleteAcademicSubject(id: ID!): String!

    createAcademicPeriod(input: AcademicPeriodInput!): AcademicPeriod!
    updateAcademicPeriod(id: ID!, input: AcademicPeriodInput!): AcademicPeriod!

    submitAcademicEvaluation(
      input: SubmitAcademicEvaluationInput!
    ): AcademicEvaluation!
    updateOwnPendingAcademicEvaluation(
      id: ID!
      input: UpdateAcademicEvaluationInput!
    ): AcademicEvaluation!
    updateAcademicEvaluationAsAdmin(
      id: ID!
      input: UpdateAcademicEvaluationInput!
    ): AcademicEvaluation!
    deleteAcademicEvaluationAsAdmin(id: ID!): String!
    deleteOwnPendingAcademicEvaluation(id: ID!): String!

    reviewAcademicEvaluation(
      id: ID!
      status: EvaluationStatus!
      reviewComment: String
    ): AcademicEvaluation!

    acknowledgeChildAcademicPerformance(
      childId: ID!
      periodId: ID
      comment: String
    ): AcknowledgeAcademicResult!
  }
`;
