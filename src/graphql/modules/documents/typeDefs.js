const { gql } = require("apollo-server-express");

const typeDefs = gql`
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
    ts: String
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
    ts: String
  }

  type DocumentImage {
    id: ID!
    kind: ImageKind!
    url: String!
    provider: ImageProvider!
    publicId: String
    width: Int
    height: Int
    bytes: Int
    mimeType: String
    sha256: String
    captureMeta: CaptureMeta
    uploadedAt: String
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
    visaControlNumber: String
    dateOfBirth: String
    sex: String
    expirationDate: String
    issueDate: String
    destination: String
    authorizerName: String
    mrzRaw: String
    mrzValid: Boolean
    mrzFormat: String
    reasonCodes: [String]
    ocrText: String
    ocrConfidence: Float
  }

  type Document {
    id: ID!
    owner: User
    type: DocumentType!
    status: DocumentStatus!
    source: DocumentSource!
    images: [DocumentImage]
    extracted: DocumentExtractedData
    notes: String
    retentionUntil: String
    lastAccessedAt: String
    ocrAttempts: Int
    ocrLastError: String
    ocrUpdatedAt: String
    isExpired: Boolean
    daysUntilExpiration: Int
    createdBy: User
    updatedBy: User
    createdAt: String
    updatedAt: String
  }

  type DocumentPagination {
    documents: [Document]
    pagination: DocumentPaginationInfo!
  }

  type DocumentPaginationInfo {
    total: Int
    limit: Int
    skip: Int
    hasMore: Boolean
  }

  type ExpirationSummary {
    total: Int
    expired: Int
    expiringIn30Days: Int
    expiringIn60Days: Int
    expiringIn90Days: Int
    valid: Int
    noExpirationDate: Int
  }

  input AddDocumentImageInput {
    kind: ImageKind!
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
    fullName: String
    givenNames: String
    surname: String
    nationality: String
    issuingCountry: String
    documentNumber: String
    passportNumber: String
    visaType: String
    visaControlNumber: String
    dateOfBirth: String
    sex: String
    expirationDate: String
    issueDate: String
    destination: String
    authorizerName: String
    mrzRaw: String
    mrzValid: Boolean
    mrzFormat: String
    reasonCodes: [String]
    ocrText: String
    ocrConfidence: Float
  }

  type SignedUploadResult {
    signature: String!
    timestamp: Int!
    cloudName: String!
    apiKey: String!
    folder: String!
    publicId: String
    resourceType: String
  }

  type DocumentVisibilitySettings {
    restrictSensitiveUploadsToAdmins: Boolean!
    sensitiveTypes: [DocumentType!]!
  }

  type EnqueueOcrResult {
    ok: Boolean!
    jobId: String
    message: String
  }

  input DocumentFiltersInput {
    ownerName: String
    type: DocumentType
    status: DocumentStatus
    expirationBefore: String
    expirationAfter: String
    expiredOnly: Boolean
  }

  input DocumentPaginationInput {
    page: Int
    limit: Int
    skip: Int
    sortBy: String
    sortOrder: String
  }

  extend type Query {
    myDocuments(filters: DocumentFiltersInput, pagination: DocumentPaginationInput): DocumentPagination!

    allDocuments(filters: DocumentFiltersInput, pagination: DocumentPaginationInput): DocumentPagination!

    documentById(id: ID!): Document

    documentsExpiringSummary(referenceDate: String): ExpirationSummary!

    documentVisibilitySettings: DocumentVisibilitySettings!
  }

  extend type Mutation {
    createDocument(type: DocumentType!, notes: String): Document!

    getSignedUpload(documentId: ID!, kind: ImageKind, mimeType: String): SignedUploadResult!

    addDocumentImage(documentId: ID!, image: AddDocumentImageInput!): Document!

    upsertDocumentExtractedData(
      documentId: ID!
      data: UpsertDocumentExtractedDataInput!
    ): Document!

    setDocumentStatus(documentId: ID!, status: DocumentStatus!): Document!

    deleteDocument(documentId: ID!): Boolean!

    enqueueDocumentOcr(documentId: ID!): EnqueueOcrResult!

    """
    Process OCR synchronously — normalizes image, runs Vision OCR, extracts
    MRZ/text data, uploads normalized image, and returns the Document with
    extracted data in a single request. Eliminates worker + polling delays.
    Typical response time: 5-12 seconds.
    """
    processDocumentOcr(documentId: ID!): Document!

    updateDocumentVisibilitySettings(
      restrictSensitiveUploadsToAdmins: Boolean!
    ): DocumentVisibilitySettings!
  }
`;

module.exports = typeDefs;
