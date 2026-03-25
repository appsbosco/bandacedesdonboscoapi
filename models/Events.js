/**
 * models/Events.js
 * Modelo de eventos actualizado con categoría, notificaciones y campos enriquecidos
 */
const mongoose = require("mongoose");

// ─── Sub-schema: log de notificación ─────────────────────────────────────────
const NotificationLogSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ["NONE", "DRY_RUN", "LIVE"], required: true },
    dispatchedAt: { type: Date },
    audience: [String],
    tokenCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    dryRunPayload: { type: mongoose.Schema.Types.Mixed }, // payload guardado en DRY_RUN
    error: { type: String },
  },
  { _id: false },
);

const BusCapacitySchema = new mongoose.Schema(
  {
    busNumber: { type: Number, required: true, min: 1, max: 6 },
    capacity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

// ─── Main schema ──────────────────────────────────────────────────────────────
const EventSchema = new mongoose.Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },

    // ── Classification ───────────────────────────────────────────────────────
    category: {
      type: String,
      enum: [
        "presentation",
        "rehearsal",
        "meeting",
        "activity",
        "logistics",
        "other",
      ],
      default: "other",
      index: true,
    },
    // type = nombre de la agrupación (Banda de concierto avanzada, etc.)
    type: { type: String, trim: true },

    // ── Scheduling ──────────────────────────────────────────────────────────
    date: { type: Date, required: true, index: true },
    time: { type: String }, // "HH:mm" 24h
    departure: { type: String }, // hora salida de CEDES "HH:mm"
    arrival: { type: String }, // hora llegada aprox. a CEDES "HH:mm"

    // ── Location ────────────────────────────────────────────────────────────
    place: { type: String, trim: true },

    // ── Notifications ────────────────────────────────────────────────────────
    notificationMode: {
      type: String,
      enum: ["NONE", "DRY_RUN", "LIVE"],
      default: "NONE",
    },
    audience: [String], // agrupaciones destino
    notificationLog: NotificationLogSchema,
    busCapacities: {
      type: [BusCapacitySchema],
      default: [],
    },
    transportPaymentEnabled: {
      type: Boolean,
      default: false,
    },
    transportFeeAmount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ── Meta ─────────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
    },
    visibility: {
      type: String,
      enum: ["public", "internal"],
      default: "public",
    },
  },
  { timestamps: true },
);

// Índice compuesto para queries de dashboard (presentaciones futuras por fecha)
EventSchema.index({ date: 1, category: 1 });

module.exports = mongoose.model("Event", EventSchema);
