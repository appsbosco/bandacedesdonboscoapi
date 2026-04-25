"use strict";

const mongoose = require("mongoose");

const { Schema } = mongoose;

const TourParticipantRemovalLogSchema = new Schema(
  {
    tour: {
      type: Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    participant: {
      type: Schema.Types.ObjectId,
      ref: "TourParticipant",
      default: null,
      index: true,
    },
    deletionMode: {
      type: String,
      enum: ["SOFT", "HARD"],
      required: true,
    },
    removalSource: {
      type: String,
      enum: ["ADMIN", "USER_CASCADE", "SYSTEM"],
      required: true,
    },
    removalReason: { type: String, trim: true },
    removedAt: { type: Date, default: Date.now, index: true },
    removedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    hadPayments: { type: Boolean, default: false },
    participantSnapshot: {
      participantId: { type: String, required: true },
      fullName: { type: String, required: true },
      identification: { type: String, default: null },
      instrument: { type: String, default: null },
      linkedUserId: { type: String, default: null },
      linkedUserName: { type: String, default: null },
      linkedUserEmail: { type: String, default: null },
    },
    cascadeResults: {
      itineraryAssignments: { type: Number, default: 0 },
      routeAssignments: { type: Number, default: 0 },
      flightsModified: { type: Number, default: 0 },
      roomOccupantsModified: { type: Number, default: 0 },
      roomResponsiblesCleared: { type: Number, default: 0 },
      itinerariesModified: { type: Number, default: 0 },
      payments: { type: Number, default: 0 },
      installments: { type: Number, default: 0 },
      financialAccounts: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "TourParticipantRemovalLog",
  TourParticipantRemovalLogSchema,
);
