const mongoose = require("mongoose");
const { encryptField, decryptField } = require("../utils/encryption");

const captureMetaSchema = new mongoose.Schema(
  {
    device: String,
    browser: String,
    w: Number,
    h: Number,
    blurVar: Number,
    glarePct: Number,
    attempt: Number,
    torchUsed: Boolean,
    ts: Date,
  },
  { _id: false },
);

const documentImageSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["RAW", "NORMALIZED", "MRZ_ROI"],
      default: "RAW",
    },
    url: { type: String, required: true },
    provider: {
      type: String,
      enum: ["CLOUDINARY", "S3"],
      default: "CLOUDINARY",
    },
    publicId: String,
    width: Number,
    height: Number,
    bytes: Number,
    mimeType: String,
    sha256: String,
    captureMeta: captureMetaSchema,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const extractedDataSchema = new mongoose.Schema(
  {
    fullName: String,
    givenNames: String,
    surname: String,
    nationality: String,
    issuingCountry: String,
    // Encrypted
    documentNumber: String,
    passportNumber: String,
    // End encrypted
    visaType: String,
    visaControlNumber: String,
    dateOfBirth: Date,
    sex: { type: String, enum: ["M", "F", "X", null] },
    expirationDate: Date,
    issueDate: Date,
    // Permiso de salida
    destination: String,
    authorizerName: String,
    // MRZ
    mrzRaw: String, // Encrypted
    mrzValid: Boolean,
    mrzFormat: { type: String, enum: ["TD1", "TD2", "TD3", null] },
    reasonCodes: [String],
    // OCR
    ocrText: String,
    ocrConfidence: Number,
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["PASSPORT", "VISA", "PERMISO_SALIDA", "OTHER"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "UPLOADED",
        "DATA_CAPTURED",
        "CAPTURE_ACCEPTED",
        "OCR_PENDING",
        "OCR_PROCESSING",
        "OCR_SUCCESS",
        "OCR_FAILED",
        "VERIFIED",
        "REJECTED",
      ],
      default: "UPLOADED",
    },
    source: { type: String, enum: ["MANUAL", "OCR"], default: "MANUAL" },
    images: [documentImageSchema],
    extracted: extractedDataSchema,
    notes: String,
    retentionUntil: Date,
    lastAccessedAt: Date,
    ocrAttempts: { type: Number, default: 0 },
    ocrLastError: String,
    ocrUpdatedAt: Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

documentSchema.index({ owner: 1, type: 1, "extracted.expirationDate": 1 });
documentSchema.index({ owner: 1, isDeleted: 1 });
documentSchema.index({ "extracted.expirationDate": 1, isDeleted: 1 });

documentSchema.virtual("isExpired").get(function () {
  if (!this.extracted?.expirationDate) return null;
  return new Date(this.extracted.expirationDate) < new Date();
});

documentSchema.methods.encryptSensitiveFields = function () {
  if (this.extracted) {
    if (this.extracted.documentNumber)
      this.extracted.documentNumber = encryptField(
        this.extracted.documentNumber,
      );
    if (this.extracted.passportNumber)
      this.extracted.passportNumber = encryptField(
        this.extracted.passportNumber,
      );
    if (this.extracted.mrzRaw)
      this.extracted.mrzRaw = encryptField(this.extracted.mrzRaw);
  }
};

documentSchema.methods.decryptSensitiveFields = function () {
  if (this.extracted) {
    for (const field of ["documentNumber", "passportNumber", "mrzRaw"]) {
      if (this.extracted[field]) {
        try {
          this.extracted[field] = decryptField(this.extracted[field]);
        } catch (err) {
          console.error(`Error decrypting ${field}:`, err.message);
        }
      }
    }
  }
  return this;
};

documentSchema.pre("save", function (next) {
  if (this.isModified("extracted")) this.encryptSensitiveFields();
  next();
});

documentSchema.post("find", function (docs) {
  if (docs?.length) docs.forEach((d) => d.decryptSensitiveFields?.());
});

documentSchema.post("findOne", function (doc) {
  if (doc?.decryptSensitiveFields) doc.decryptSensitiveFields();
});

documentSchema.methods.updateLastAccessed = function () {
  this.lastAccessedAt = new Date();
  return this.save();
};

const Document = mongoose.model("Document", documentSchema);
module.exports = Document;
