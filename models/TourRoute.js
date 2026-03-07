const mongoose = require("mongoose");

/**
 * TourRoute — represents a full travel itinerary (e.g. "Delta Cotización 1 — Ida").
 * Flights are assigned to routes via TourFlight.routeId.
 * Passengers are assigned to routes via TourRouteAssignment.
 */
const TourRouteSchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    name:        { type: String, required: true, trim: true },
    direction:   { type: String, enum: ["OUTBOUND", "INBOUND"], required: true },
    origin:      { type: String, trim: true },
    destination: { type: String, trim: true },
    notes:       { type: String, trim: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TourRouteSchema.index({ tour: 1, direction: 1 });

module.exports = mongoose.model("TourRoute", TourRouteSchema);
