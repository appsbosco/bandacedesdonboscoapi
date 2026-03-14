/**
 * tourImports/typeDefs.js
 * Importación de participantes de gira desde Excel.
 *
 * Flujo de 2 pasos:
 *   1. previewTourParticipantImport → parsea, valida, devuelve preview + batchId
 *   2. confirmTourParticipantImport → re-envía el mismo archivo con batchId para confirmar
 */
const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum TourImportBatchStatus {
    PREVIEW
    CONFIRMED
    CANCELLED
  }

  # ─── Types ──────────────────────────────────────────────────────────────────

  type TourImportPreviewRow {
    rowIndex: Int!
    firstName: String
    firstSurname: String
    secondSurname: String
    identification: String
    email: String
    phone: String
    birthDate: String
    instrument: String
    grade: String
    passportNumber: String
    role: String
    isValid: Boolean!
    isDuplicate: Boolean!
    errors: [String!]!
  }

  type TourImportBatch {
    id: ID!
    tour: Tour!
    fileName: String
    status: TourImportBatchStatus!
    totalRows: Int!
    validRows: Int!
    invalidRows: Int!
    duplicateRows: Int!
    importedCount: Int!
    createdBy: User
    confirmedBy: User
    confirmedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TourImportPreviewResult {
    batchId: ID!
    tourId: ID!
    fileName: String
    totalRows: Int!
    validRows: Int!
    invalidRows: Int!
    duplicateRows: Int!
    rows: [TourImportPreviewRow!]!
  }

  type TourImportConfirmResult {
    batchId: ID!
    tourId: ID!
    importedCount: Int!
    updatedCount: Int
    duplicates: Int!
    errors: Int!
    mode: String
    participants: [TourParticipant!]!
  }

  # ─── Inputs ─────────────────────────────────────────────────────────────────

  input TourImportInput {
    tourId: ID!
    fileBase64: String!
    fileName: String
    sheetName: String
    mode: String
  }

  input TourImportConfirmInput {
    batchId: ID!
    fileBase64: String!
    sheetName: String
    mode: String
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    getTourImportBatch(id: ID!): TourImportBatch
    getTourImportBatches(tourId: ID!): [TourImportBatch!]!
  }

  # ─── Mutations ───────────────────────────────────────────────────────────────

  extend type Mutation {
    previewTourParticipantImport(
      input: TourImportInput!
    ): TourImportPreviewResult!
    confirmTourParticipantImport(
      input: TourImportConfirmInput!
    ): TourImportConfirmResult!
    cancelTourImportBatch(batchId: ID!): String!
  }
`;
