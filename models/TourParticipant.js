/**
 * models/TourParticipant.js
 *
 * Participante de gira — entidad autónoma, sin dependencia de User.
 * Identidad proviene de Excel o entrada manual.
 * Deduplicación: fingerprint SHA-256(normalize(firstName|firstSurname|identification))
 * Enlace opcional a User del sistema via linkedUser.
 */
"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");

const {
  Schema,
  Types: { ObjectId },
} = mongoose;

function normalize(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildFingerprint(firstName, firstSurname, identification) {
  const raw = [firstName, firstSurname, identification]
    .map(normalize)
    .join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const TourParticipantSchema = new Schema(
  {
    tour: { type: ObjectId, ref: "Tour", required: true, index: true },

    // ── Identidad propia ──────────────────────────────────────────────────────
    firstName: { type: String, required: true, trim: true },
    firstSurname: { type: String, required: true, trim: true },
    secondSurname: { type: String, trim: true },
    identification: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    birthDate: { type: Date },
    instrument: { type: String, trim: true },
    grade: { type: String, trim: true },

    // ── Datos migratorios propios ─────────────────────────────────────────────
    passportNumber: { type: String, trim: true },
    passportExpiry: { type: Date },
    hasVisa: { type: Boolean, default: false },
    visaExpiry: { type: Date },
    visaStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "DENIED", "EXPIRED", "UNKNOWN"],
      default: "UNKNOWN",
      index: true,
    },
    visaDecisionDate: { type: Date, default: null },
    visaDeniedCount: { type: Number, default: 0, min: 0 },
    visaLastDeniedAt: { type: Date, default: null },
    visaLastDeniedReason: { type: String, trim: true },
    visaBlockedAt: { type: Date, default: null },
    visaBlockedBy: { type: ObjectId, ref: "User", default: null },
    visaNotes: { type: String, trim: true },
    visaHistory: [
      new Schema(
        {
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "DENIED", "EXPIRED", "UNKNOWN"],
            required: true,
          },
          reason: { type: String, trim: true },
          notes: { type: String, trim: true },
          decidedAt: { type: Date, default: Date.now, required: true },
          decidedBy: { type: ObjectId, ref: "User", default: null },
          source: {
            type: String,
            enum: ["ADMIN_MANUAL", "DOCUMENT_SYNC", "IMPORT", "SYSTEM"],
            default: "ADMIN_MANUAL",
          },
          denialOrdinal: { type: Number, default: null },
        },
        { _id: true },
      ),
    ],
    hasExitPermit: { type: Boolean, default: false },

    // ── Sexo ──────────────────────────────────────────────────────────────────
    sex: {
      type: String,
      enum: ["M", "F", "OTHER", "UNKNOWN"],
      default: "UNKNOWN",
      index: true,
    },

    // ── Estado en la gira ─────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    role: {
      type: String,
      enum: ["MUSICIAN", "STAFF", "DIRECTOR", "GUEST"],
      default: "MUSICIAN",
    },
    notes: { type: String },

    // ── Enlace opcional a User del sistema ────────────────────────────────────
    linkedUser: { type: ObjectId, ref: "User", default: null, index: true },
    linkedUserSnapshotName: { type: String, trim: true },
    linkedUserSnapshotEmail: { type: String, trim: true, lowercase: true },
    linkedUserSnapshotId: { type: ObjectId, ref: "User", default: null },

    // ── Baja lógica / auditoría ───────────────────────────────────────────────
    isRemoved: { type: Boolean, default: false, index: true },
    removedAt: { type: Date, default: null },
    removedBy: { type: ObjectId, ref: "User", default: null },
    removalReason: { type: String, trim: true },
    removalSource: {
      type: String,
      enum: ["ADMIN", "USER_CASCADE", "SYSTEM"],
      default: undefined,
    },
    removalHadPayments: { type: Boolean, default: false },

    // ── Metadatos de importación ──────────────────────────────────────────────
    importBatch: { type: ObjectId, ref: "TourImportBatch", default: null },
    importRowIndex: { type: Number },

    // ── Deduplicación ─────────────────────────────────────────────────────────
    fingerprint: { type: String, required: true },

    addedBy: { type: ObjectId, ref: "User" },
    updatedBy: { type: ObjectId, ref: "User" },
  },
  { timestamps: true },
);

TourParticipantSchema.index({ tour: 1, fingerprint: 1 }, { unique: true });
TourParticipantSchema.index({ tour: 1, status: 1 });
TourParticipantSchema.index({ tour: 1, isRemoved: 1, firstSurname: 1, firstName: 1 });
TourParticipantSchema.index({ tour: 1, visaStatus: 1, visaDeniedCount: 1 });
TourParticipantSchema.index(
  { tour: 1, linkedUser: 1 },
  {
    unique: true,
    partialFilterExpression: { linkedUser: { $type: "objectId" } },
  },
);

TourParticipantSchema.pre("validate", function (next) {
  if (
    this.isModified("firstName") ||
    this.isModified("firstSurname") ||
    this.isModified("identification")
  ) {
    this.fingerprint = buildFingerprint(
      this.firstName,
      this.firstSurname,
      this.identification,
    );
  }
  next();
});

TourParticipantSchema.statics.buildFingerprint = buildFingerprint;

module.exports = mongoose.model("TourParticipant", TourParticipantSchema);
