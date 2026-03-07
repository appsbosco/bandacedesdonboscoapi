const mongoose = require("mongoose");

/**
 * TourItineraryAssignment — links a participant to a roundtrip itinerary.
 *
 * Uniqueness rules:
 *   (tour, participant)       unique → one itinerary per participant per tour
 *   (itinerary, participant)  unique → only assigned once to the same itinerary
 */
const TourItineraryAssignmentSchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    itinerary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TourItinerary",
      required: true,
      index: true,
    },
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TourParticipant",
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// One itinerary per participant per tour (enforced at DB level)
TourItineraryAssignmentSchema.index({ tour: 1, participant: 1 }, { unique: true });
// Prevent duplicate assignment to same itinerary
TourItineraryAssignmentSchema.index({ itinerary: 1, participant: 1 }, { unique: true });

module.exports = mongoose.model("TourItineraryAssignment", TourItineraryAssignmentSchema);
