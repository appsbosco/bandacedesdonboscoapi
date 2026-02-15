const { gql } = require("apollo-server");

module.exports = gql`
  enum DocumentType {
    PASSPORT
    VISA
  }

  enum DocumentStatus {
    UPLOADED
    DATA_CAPTURED
    OCR_PENDING
    OCR_SUCCESS
    OCR_FAILED
    VERIFIED
    REJECTED
  }

  enum DocumentSource {
    MANUAL
    OCR
  }

  enum ImageProvider {
    CLOUDINARY
    S3
  }

  type DocumentImage {
    _id: ID!
    url: String!
    provider: ImageProvider!
    publicId: String
    uploadedAt: DateTime!
  }

  type DocumentExtractedData {
    fullName: String
    givenNames: String
    surname: String
    nationality: String
    issuingCountry: String
    documentNumber: String
    passportNumber: String
    visaType: String
    dateOfBirth: DateTime
    sex: String
    expirationDate: DateTime
    issueDate: DateTime
    mrzRaw: String
    mrzValid: Boolean
    ocrText: String
    ocrConfidence: Float
  }

  type Document {
    _id: ID!
    owner: User!
    type: DocumentType!
    status: DocumentStatus!
    source: DocumentSource!
    images: [DocumentImage!]!
    extracted: DocumentExtractedData
    notes: String
    retentionUntil: DateTime
    lastAccessedAt: DateTime
    isDeleted: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    createdBy: User!
    updatedBy: User
    isExpired: Boolean
    daysUntilExpiration: Int
  }

  type DocumentsResult {
    documents: [Document!]!
    pagination: PaginationInfo!
  }

  type PaginationInfo {
    total: Int!
    limit: Int!
    skip: Int!
    hasMore: Boolean!
  }

  type ExpirationSummary {
    total: Int!
    expired: Int!
    expiringIn30Days: Int!
    expiringIn60Days: Int!
    expiringIn90Days: Int!
    valid: Int!
    noExpirationDate: Int!
  }

  type DeleteDocumentResult {
    success: Boolean!
    message: String!
  }

  input CreateDocumentInput {
    type: DocumentType!
    source: DocumentSource
    notes: String
    retentionUntil: DateTime
  }

  input AddDocumentImageInput {
    documentId: ID!
    url: String!
    provider: ImageProvider
    publicId: String
  }

  input UpsertDocumentExtractedDataInput {
    documentId: ID!
    fullName: String
    givenNames: String
    surname: String
    nationality: String
    issuingCountry: String
    documentNumber: String
    passportNumber: String
    visaType: String
    dateOfBirth: DateTime
    sex: String
    expirationDate: DateTime
    issueDate: DateTime
    mrzRaw: String
    ocrText: String
    ocrConfidence: Float
  }

  input DocumentFiltersInput {
    type: DocumentType
    status: DocumentStatus
    source: DocumentSource
    expired: Boolean
    expiresBefore: DateTime
    expiresInDays: Int
  }

  input PaginationInput {
    limit: Int
    skip: Int
  }

  extend type Query {
    myDocuments(
      filters: DocumentFiltersInput
      pagination: PaginationInput
    ): DocumentsResult!
    documentById(id: ID!): Document!
    documentsExpiringSummary(referenceDate: DateTime): ExpirationSummary!
  }

  extend type Mutation {
    createDocument(input: CreateDocumentInput!): Document!
    addDocumentImage(input: AddDocumentImageInput!): Document!
    upsertDocumentExtractedData(
      input: UpsertDocumentExtractedDataInput!
    ): Document!
    setDocumentStatus(documentId: ID!, status: DocumentStatus!): Document!
    deleteDocument(documentId: ID!): DeleteDocumentResult!
  }
`;
