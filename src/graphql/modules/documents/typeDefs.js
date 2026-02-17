const { gql } = require("apollo-server");

module.exports = gql`
  enum DocumentType {
    PASSPORT
    VISA
    PERMISO_SALIDA
    OTHER
  }

  enum DocumentStatus {
    UPLOADED
    DATA_CAPTURED
    CAPTURE_ACCEPTED
    OCR_PENDING
    OCR_PROCESSING
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

  enum ImageKind {
    RAW
    NORMALIZED
    MRZ_ROI
  }

  type CaptureMeta {
    device: String
    browser: String
    w: Int
    h: Int
    blurVar: Float
    glarePct: Float
    attempt: Int
    torchUsed: Boolean
    ts: DateTime
  }

  type DocumentImage {
    _id: ID!
    kind: ImageKind
    url: String!
    provider: ImageProvider!
    publicId: String
    width: Int
    height: Int
    bytes: Int
    mimeType: String
    sha256: String
    captureMeta: CaptureMeta
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
    mrzFormat: String
    reasonCodes: [String!]
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
    ocrAttempts: Int
    ocrLastError: String
    ocrUpdatedAt: DateTime
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

  type SignedUploadResult {
    timestamp: Int!
    signature: String!
    apiKey: String!
    cloudName: String!
    folder: String!
    publicId: String!
  }

  input CreateDocumentInput {
    type: DocumentType!
    source: DocumentSource
    notes: String
    retentionUntil: DateTime
  }

  input GetSignedUploadInput {
    documentId: ID!
    kind: ImageKind!
  }

  input CaptureMetaInput {
    device: String
    browser: String
    w: Int
    h: Int
    blurVar: Float
    glarePct: Float
    attempt: Int
    torchUsed: Boolean
    ts: DateTime
  }

  input AddDocumentImageInput {
    documentId: ID!
    kind: ImageKind
    url: String!
    provider: ImageProvider
    publicId: String
    width: Int
    height: Int
    bytes: Int
    mimeType: String
    sha256: String
    captureMeta: CaptureMetaInput
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
    mrzValid: Boolean
    mrzFormat: String
    reasonCodes: [String!]
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

  input EnqueueDocumentOcrInput {
    documentId: ID!
  }

  type EnqueueDocumentOcrResult {
    success: Boolean!
    jobId: String
  }

  extend type Mutation {
    createDocument(input: CreateDocumentInput!): Document!
    getSignedUpload(input: GetSignedUploadInput!): SignedUploadResult!
    addDocumentImage(input: AddDocumentImageInput!): Document!
    upsertDocumentExtractedData(
      input: UpsertDocumentExtractedDataInput!
    ): Document!
    setDocumentStatus(documentId: ID!, status: DocumentStatus!): Document!
    deleteDocument(documentId: ID!): DeleteDocumentResult!
    enqueueDocumentOcr(input: EnqueueDocumentOcrInput!): EnqueueDocumentOcrResult!
  }
`;
