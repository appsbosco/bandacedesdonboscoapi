const mongoose = require("mongoose");

/**
 * TourItinerary — a roundtrip travel package (e.g. "United Cotización 1").
 *
 * An itinerary contains ALL legs of a trip: outbound, connecting and inbound.
 * Direction lives on TourFlight, not here.
 * Passengers are assigned at this level → they travel on every flight in the itinerary.
 *
 * Capacity: maxPassengers is a hard limit enforced at service layer.
 * Leaders:  leaderIds are a subset of assigned participants (TourItineraryAssignment).
 */
const TourItinerarySchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    name:  { type: String, required: true, trim: true },
    notes: { type: String, trim: true },

    /** Hard capacity limit. Assignment service enforces this. */
    maxPassengers: {
      type: Number,
      required: true,
      min: [1, "El cupo máximo debe ser al menos 1"],
      default: 60,
    },

    /**
     * Optional group leaders — must be TourParticipants assigned to this itinerary.
     * Validation is done at service layer (not DB level for flexibility).
     */
    leaderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TourParticipant",
      },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TourItinerarySchema.index({ tour: 1, name: 1 });

module.exports = mongoose.model("TourItinerary", TourItinerarySchema);
