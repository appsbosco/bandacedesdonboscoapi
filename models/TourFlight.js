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
    notes:      { type: String, trim: true },
    passengers: [PassengerSchema],
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TourFlightSchema.index({ tour: 1, direction: 1 });
TourFlightSchema.index({ tour: 1, departureAt: 1 });

module.exports = mongoose.model("TourFlight", TourFlightSchema);
