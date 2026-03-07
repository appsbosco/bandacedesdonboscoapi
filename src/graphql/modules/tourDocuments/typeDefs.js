/**
 * tourDocuments/typeDefs.js
 * Solo queries — las mutations de documentos viven en el módulo documents existente.
 */
const { gql } = require("apollo-server");

module.exports = gql`
  # ─── Enums ──────────────────────────────────────────────────────────────────

  enum DocumentCompletionStatus {
    COMPLETE
    INCOMPLETE
    EXPIRED
    EXPIRING
  }

  enum DocumentAlertType {
    MISSING_PASSPORT
    MISSING_VISA
    MISSING_PERMISO_SALIDA
    EXPIRED
    EXPIRING
  }

  # ─── Types ──────────────────────────────────────────────────────────────────

  type ParticipantDocumentStatus {
    id: ID!
    participant: TourParticipant!
    hasPassport: Boolean!
    hasVisa: Boolean!
    hasPermisoSalida: Boolean!
    passportStatus: String
    visaStatus: String
    passportExpiresAt: DateTime
    visaExpiresAt: DateTime
    overallStatus: DocumentCompletionStatus!
  }

  type DocumentAlert {
    id: ID!
    participant: TourParticipant!
    alertType: DocumentAlertType!
    documentType: DocumentType
    daysUntilExpiration: Int
  }

  # ─── Queries ─────────────────────────────────────────────────────────────────

  extend type Query {
    getTourDocumentStatus(tourId: ID!): [ParticipantDocumentStatus!]!
    getTourDocumentAlerts(tourId: ID!, daysAhead: Int): [DocumentAlert!]!
  }
`;
