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
  }

  type AcademicEvaluation {
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
    status: EvaluationStatus!
    submittedByStudentAt: String
    reviewedByAdmin: EvalBasicUser
    reviewedAt: String
    reviewComment: String
    parentAcknowledged: Boolean!
    parentAcknowledgedAt: String
    parentComment: String
    createdAt: String
    updatedAt: String
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

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    academicSubjects(grade: String, isActive: Boolean): [AcademicSubject!]!
    academicPeriods(year: Int, isActive: Boolean): [AcademicPeriod!]!

    myAcademicEvaluations(filter: AcademicDashboardFilter): [AcademicEvaluation!]!
    myAcademicPerformance(periodId: ID, year: Int): StudentPerformance!

    studentAcademicEvaluations(studentId: ID!, filter: AcademicDashboardFilter): [AcademicEvaluation!]!
    studentAcademicPerformance(studentId: ID!, periodId: ID, year: Int): StudentPerformance!

    adminAcademicDashboard(filter: AcademicDashboardFilter): AdminAcademicDashboard!
    adminAcademicRiskRanking(filter: AcademicDashboardFilter, limit: Int): [StudentPerformance!]!
    adminPendingEvaluations(filter: AcademicDashboardFilter): [AcademicEvaluation!]!
    adminAcademicStudents(filter: AcademicDashboardFilter): [AdminAcademicStudent!]!

    parentChildrenAcademicOverview(periodId: ID, year: Int): [ParentChildAcademicData!]!
    parentChildEvaluations(childId: ID!, filter: AcademicDashboardFilter): [AcademicEvaluation!]!

    sectionInstrumentAcademicOverview(periodId: ID, year: Int): [SectionAcademicMember!]!
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    createAcademicSubject(input: AcademicSubjectInput!): AcademicSubject!
    updateAcademicSubject(id: ID!, input: AcademicSubjectInput!): AcademicSubject!
    deleteAcademicSubject(id: ID!): String!

    createAcademicPeriod(input: AcademicPeriodInput!): AcademicPeriod!
    updateAcademicPeriod(id: ID!, input: AcademicPeriodInput!): AcademicPeriod!

    submitAcademicEvaluation(input: SubmitAcademicEvaluationInput!): AcademicEvaluation!
    updateOwnPendingAcademicEvaluation(id: ID!, input: UpdateAcademicEvaluationInput!): AcademicEvaluation!
    updateAcademicEvaluationAsAdmin(id: ID!, input: UpdateAcademicEvaluationInput!): AcademicEvaluation!
    deleteAcademicEvaluationAsAdmin(id: ID!): String!
    deleteOwnPendingAcademicEvaluation(id: ID!): String!

    reviewAcademicEvaluation(id: ID!, status: EvaluationStatus!, reviewComment: String): AcademicEvaluation!

    acknowledgeChildAcademicPerformance(childId: ID!, periodId: ID, comment: String): AcknowledgeAcademicResult!
  }
`;
