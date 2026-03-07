const mongoose = require("mongoose");

const PassengerSchema = new mongoose.Schema(
  {
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TourParticipant",
      required: true,
    },
    seatNumber:  { type: String, trim: true },
    confirmedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TourFlightSchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    airline:      { type: String, required: true, trim: true },
    flightNumber: { type: String, required: true, trim: true },
    origin:       { type: String, required: true, trim: true },
    destination:  { type: String, required: true, trim: true },
    departureAt:  { type: Date, required: true },
    arrivalAt:    { type: Date, required: true },
    direction: {
      type: String,
      enum: ["OUTBOUND", "INBOUND", "CONNECTING"],
      required: true,
    },
    // itineraryId: the roundtrip TourItinerary this flight belongs to.
    // Direction (OUTBOUND/INBOUND/CONNECTING) lives on this flight, not the itinerary.
    itineraryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TourItinerary",
      default: null,
      index: true,
    },
    // routeGroup / routeId: DEPRECATED — kept for legacy data migration only.
    routeGroup: { type: String, trim: true, default: null },
    notes:      { type: String, trim: true },
    passengers: [PassengerSchema],
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TourFlightSchema.index({ tour: 1, direction: 1 });
TourFlightSchema.index({ tour: 1, departureAt: 1 });
TourFlightSchema.index({ tour: 1, itineraryId: 1 });
TourFlightSchema.index({ tour: 1, routeGroup: 1 });

module.exports = mongoose.model("TourFlight", TourFlightSchema);
