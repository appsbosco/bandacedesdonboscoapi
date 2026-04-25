/**
 * src/graphql/modules/tourPayments/typeDefs.js
 *
 * Esquema GraphQL completo del módulo financiero de giras.
 */
const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum FinancialStatus {
    PENDING
    UP_TO_DATE
    LATE
    PARTIAL
    PAID
    OVERPAID
  }

  enum InstallmentStatus {
    PENDING
    PARTIAL
    PAID
    LATE
    WAIVED
  }

  enum PaymentMethod {
    CASH
    TRANSFER
    CARD
    CHECK
    OTHER
  }

  # ─── Types: Payment Plan ─────────────────────────────────────────────────────

  type InstallmentTemplate {
    id: ID!
    order: Int!
    dueDate: DateTime!
    amount: Float!
    concept: String!
  }

  type TourPaymentPlan {
    id: ID!
    tour: Tour!
    name: String!
    currency: String!
    totalAmount: Float!
    installments: [InstallmentTemplate!]!
    isDefault: Boolean!
    createdBy: User
    updatedBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Types: Financial Account ────────────────────────────────────────────────

  type FinancialAdjustment {
    id: ID!
    concept: String!
    amount: Float!
    appliedBy: User
    appliedAt: DateTime!
    notes: String
  }

  type ParticipantFinancialAccount {
    id: ID!
    tour: Tour!
    participant: TourParticipant!
    paymentPlan: TourPaymentPlan
    installments: [ParticipantInstallment!]!

    currency: String!

    # Composición del monto
    baseAmount: Float!
    discount: Float!
    scholarship: Float!
    adjustments: [FinancialAdjustment!]!
    finalAmount: Float!

    # Estado calculado
    totalPaid: Float!
    balance: Float!
    overpayment: Float!
    financialStatus: FinancialStatus!

    createdBy: User
    updatedBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Types: Installments ─────────────────────────────────────────────────────

  type ParticipantInstallment {
    id: ID!
    tour: Tour!
    participant: TourParticipant!
    paymentPlan: TourPaymentPlan

    order: Int!
    dueDate: DateTime!
    amount: Float!
    concept: String!

    paidAmount: Float!
    remainingAmount: Float!
    status: InstallmentStatus!
    paidAt: DateTime

    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Types: Payment ──────────────────────────────────────────────────────────

  type PaymentDistribution {
    installment: ParticipantInstallment!
    amountApplied: Float!
  }

  type TourPayment {
    id: ID!
    tour: Tour!
    participant: TourParticipant!
    linkedUser: User

    amount: Float!
    paymentDate: DateTime!
    method: PaymentMethod!
    reference: String
    notes: String
    appliedTo: [PaymentDistribution!]!
    unappliedAmount: Float!

    registeredBy: User
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # ─── Types: Reports ──────────────────────────────────────────────────────────

  type FinancialStatusByCount {
    PENDING: Int!
    UP_TO_DATE: Int!
    LATE: Int!
    PARTIAL: Int!
    PAID: Int!
    OVERPAID: Int!
  }

  type TourFinancialSummary {
    tourId: ID!
    tourName: String!
    totalParticipants: Int!
    totalAssigned: Float!
    totalCollected: Float!
    totalBalance: Float!
    byStatus: FinancialStatusByCount!
  }

  type PaymentFlowEntry {
    date: String!
    totalAmount: Float!
    count: Int!
    cumulative: Float!
  }

  # Columna de la tabla financiera (corresponde a una cuota del plan)
  type FinancialTableColumn {
    order: Int!
    dueDate: DateTime!
    concept: String!
    amount: Float!
  }

  # Detalle por cuota dentro de una fila de la tabla
  type FinancialTableInstallmentCell {
    installmentId: ID!
    order: Int!
    dueDate: DateTime!
    concept: String!
    amount: Float!
    paidAmount: Float!
    remainingAmount: Float!
    status: InstallmentStatus!
  }

  # Fila de la tabla financiera (un participante)
  type FinancialTableRow {
    accountId: ID!
    participantId: ID!
    hasFinancialAccount: Boolean!
    fullName: String!
    identification: String!
    instrument: String!
    visaStatus: TourParticipantVisaStatus!
    visaDeniedCount: Int!
    linkedUserName: String
    linkedUserEmail: String
    isRemoved: Boolean!
    removedAt: DateTime
    removedByName: String
    removalHadPayments: Boolean!
    finalAmount: Float!
    totalPaid: Float!
    balance: Float!
    overpayment: Float!
    financialStatus: FinancialStatus!
    installments: [FinancialTableInstallmentCell!]!
  }

  # Tabla completa tipo Excel
  type FinancialTable {
    tourId: ID!
    tourName: String!
    columns: [FinancialTableColumn!]!
    rows: [FinancialTableRow!]!
  }

  # Resultado de operación masiva
  type BulkOperationResult {
    total: Int!
    created: Int!
    skipped: Int!
    errors: [BulkOperationError!]!
  }

  type BulkOperationError {
    participantId: ID!
    name: String!
    error: String!
  }

  type AssignPlanResult {
    assigned: Int!
    skipped: Int!
    total: Int!
  }

  # ─── Inputs ──────────────────────────────────────────────────────────────────

  input InstallmentTemplateInput {
    order: Int
    dueDate: DateTime!
    amount: Float!
    concept: String!
  }

  input CreatePaymentPlanInput {
    tourId: ID!
    name: String!
    currency: String
    isDefault: Boolean
    installments: [InstallmentTemplateInput!]!
  }

  input UpdatePaymentPlanInput {
    name: String
    currency: String
    isDefault: Boolean
    installments: [InstallmentTemplateInput!]
  }

  input AdjustmentInput {
    concept: String!
    amount: Float!
    notes: String
  }

  input CreateFinancialAccountInput {
    tourId: ID!
    participantId: ID!
    paymentPlanId: ID
    currency: String
    baseAmount: Float
    discount: Float
    scholarship: Float
  }

  input UpdateFinancialAccountInput {
    paymentPlanId: ID
    currency: String
    baseAmount: Float
    discount: Float
    scholarship: Float
    adjustment: AdjustmentInput
  }

  input RegisterPaymentInput {
    tourId: ID!
    participantId: ID!
    amount: Float!
    paymentDate: DateTime
    method: PaymentMethod
    reference: String
    notes: String
  }

  input UpdateInstallmentInput {
    dueDate: DateTime
    amount: Float
    concept: String
    status: InstallmentStatus
  }

  input FinancialAccountsFilter {
    financialStatus: FinancialStatus
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    # Payment Plans
    getPaymentPlan(id: ID!): TourPaymentPlan!
    getPaymentPlansByTour(tourId: ID!): [TourPaymentPlan!]!

    # Financial Accounts
    getFinancialAccount(
      participantId: ID!
      tourId: ID!
    ): ParticipantFinancialAccount!
    getFinancialAccountsByTour(
      tourId: ID!
      filter: FinancialAccountsFilter
    ): [ParticipantFinancialAccount!]!

    # Installments
    getInstallmentsByParticipant(
      participantId: ID!
      tourId: ID
    ): [ParticipantInstallment!]!

    # Payments
    getTourPayments(tourId: ID!): [TourPayment!]!
    getPaymentsByParticipant(participantId: ID!, tourId: ID): [TourPayment!]!

    # Reports
    getFinancialTable(tourId: ID!): FinancialTable!
    getFinancialSummary(tourId: ID!): TourFinancialSummary!
    getPaymentFlow(tourId: ID!): [PaymentFlowEntry!]!
    getParticipantsByFinancialStatus(
      tourId: ID!
      status: FinancialStatus
    ): [ParticipantFinancialAccount!]!

    # Self-service: cuenta financiera del participante vinculado al usuario autenticado
    myTourPaymentAccount(tourId: ID!): ParticipantFinancialAccount

    # Parent self-service: cuenta financiera de un hijo específico
    myChildTourPaymentAccount(tourId: ID!, childUserId: ID!): ParticipantFinancialAccount
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    # Payment Plans
    createPaymentPlan(input: CreatePaymentPlanInput!): TourPaymentPlan!
    updatePaymentPlan(id: ID!, input: UpdatePaymentPlanInput!): TourPaymentPlan!
    deletePaymentPlan(id: ID!): String!

    # Financial Accounts
    createFinancialAccount(
      input: CreateFinancialAccountInput!
    ): ParticipantFinancialAccount!
    updateFinancialAccount(
      id: ID!
      input: UpdateFinancialAccountInput!
    ): ParticipantFinancialAccount!

    # Bulk: crear cuentas para todos los participantes importados
    createFinancialAccountsForAll(
      tourId: ID!
      baseAmount: Float!
      planId: ID
    ): BulkOperationResult!

    # Installment Plan Assignment
    assignPaymentPlan(
      participantId: ID!
      tourId: ID!
      planId: ID!
    ): [ParticipantInstallment!]!

    # Bulk: asignar plan por defecto a todos los participantes sin cuotas
    assignDefaultPlanToAll(tourId: ID!): AssignPlanResult!

    # Installment edits
    updateInstallment(
      id: ID!
      input: UpdateInstallmentInput!
    ): ParticipantInstallment!

    # Payments
    registerPayment(input: RegisterPaymentInput!): TourPayment!
    deleteTourPayment(id: ID!): String!
  }
`;
