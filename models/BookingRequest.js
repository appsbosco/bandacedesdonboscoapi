const mongoose = require("mongoose");

const BOOKING_REQUEST_ENSEMBLES = [
  "BANDAS_DE_CONCIERTO",
  "BIG_BAND",
  "BANDA_DE_MARCHA",
  "CIMARRONA",
];

const BOOKING_REQUEST_STATUSES = [
  "NEW",
  "IN_REVIEW",
  "CONTACTED",
  "QUOTED",
  "CLOSED",
];

const BOOKING_REQUEST_EVENT_TYPES = [
  "CONCERT",
  "FESTIVAL",
  "PARADE",
  "WEDDING",
  "CORPORATE",
  "INSTITUTIONAL",
  "COMMUNITY",
  "PRIVATE",
  "PROTOCOL",
  "OTHER",
];

const BOOKING_REQUEST_BUDGET_CURRENCIES = ["CRC", "USD"];

const BookingRequestSchema = new mongoose.Schema(
  {
    ensemble: {
      type: String,
      enum: BOOKING_REQUEST_ENSEMBLES,
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
      type: String,
      enum: BOOKING_REQUEST_EVENT_TYPES,
      required: true,
      trim: true,
    },
    eventTypeOther: {
      type: String,
      trim: true,
      default: "",
    },
    eventDate: {
      type: Date,
      required: true,
      index: true,
    },
    eventTime: {
      type: String,
      required: true,
      trim: true,
    },
    venue: {
      type: String,
      required: true,
      trim: true,
    },
    province: {
      type: String,
      required: true,
      trim: true,
    },
    canton: {
      type: String,
      required: true,
      trim: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedDuration: {
      type: String,
      required: true,
      trim: true,
    },
    expectedAudience: {
      type: Number,
      min: 0,
      default: null,
    },
    estimatedBudget: {
      type: Number,
      min: 0,
      default: null,
    },
    budgetCurrency: {
      type: String,
      enum: BOOKING_REQUEST_BUDGET_CURRENCIES,
      default: null,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    acceptedDataPolicy: {
      type: Boolean,
      required: true,
      default: false,
    },
    status: {
      type: String,
      enum: BOOKING_REQUEST_STATUSES,
      default: "NEW",
      index: true,
    },
    statusNotes: {
      type: String,
      trim: true,
      default: "",
    },
    notificationEmailSentAt: {
      type: Date,
      default: null,
    },
    confirmationEmailSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

BookingRequestSchema.index({ createdAt: -1, status: 1, ensemble: 1 });

module.exports = mongoose.model("BookingRequest", BookingRequestSchema);
