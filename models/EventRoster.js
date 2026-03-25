// models/EventRoster.js
const mongoose = require("mongoose");

const transportPlanSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["FIXED", "FLEX"],
      default: "FIXED",
    },
    primaryBus: { type: Number, min: 1, max: 6, default: null },
    secondaryBus: { type: Number, min: 1, max: 6, default: null },
    primaryCapacity: { type: Number, min: 1, default: null },
  },
  { _id: false },
);

const eventRosterSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // --- Logística ---
    assignmentGroup: { type: String }, // "FLAUTAS", "STAFF", etc.
    busNumber: { type: Number, min: 1, max: 6, default: null },
    plannedBusNumbers: {
      type: [{ type: Number, min: 1, max: 6 }],
      default: [],
    },
    transportPlan: {
      type: transportPlanSchema,
      default: null,
    },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      default: null,
    },

    // --- Exclusiones ---
    excludedFromEvent: { type: Boolean, default: false },
    excludedFromTransport: { type: Boolean, default: false },
    exclusionReason: { type: String, default: "" },

    // --- Asistencia real ---
    // PENDING = convocado pero aún no se pasó lista
    // PRESENT / ABSENT / LATE
    attendanceStatus: {
      type: String,
      enum: ["PENDING", "PRESENT", "ABSENT", "LATE"],
      default: "PENDING",
    },
    attendanceMarkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    attendanceMarkedAt: { type: Date, default: null },

    // --- Pago de transporte ---
    transportPaid: { type: Boolean, default: false },
    transportPaidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    transportPaidAt: { type: Date, default: null },
    transportPaymentMethod: {
      type: String,
      enum: ["CASH", "SINPE"],
      default: null,
    },
    transportAmountPaid: { type: Number, min: 0, default: 0 },
    transportExempt: { type: Boolean, default: false },
    transportExemptReason: { type: String, default: "" },

    // --- Flags ---
    isStaff: { type: Boolean, default: false },

    // --- Auditoría ---
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// ÍNDICE ÚNICO: un registro por persona por evento
eventRosterSchema.index({ event: true, user: true }, { unique: true });

// Índices de consulta frecuente
eventRosterSchema.index({ event: true, busNumber: true });
eventRosterSchema.index({ event: true, assignmentGroup: true });
eventRosterSchema.index({ event: true, excludedFromEvent: true });

module.exports = mongoose.model("EventRoster", eventRosterSchema);
