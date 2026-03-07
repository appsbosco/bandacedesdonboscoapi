const mongoose = require("mongoose");

/**
 * TourRouteAssignment — junction table linking participants to routes.
 *
 * Uniqueness rules (enforced by DB index):
 *   - A participant can only be assigned to each route once: (route, participant) unique.
 *
 * Conflict rule (enforced at service level):
 *   - A participant can be in at most ONE OUTBOUND route and ONE INBOUND route per tour.
 *   - direction is denormalized from route.direction for efficient conflict queries.
 */
const TourRouteAssignmentSchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TourRoute",
      required: true,
      index: true,
    },
    // Denormalized from route.direction for fast conflict queries
    direction: {
      type: String,
      enum: ["OUTBOUND", "INBOUND"],
      required: true,
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

// Each participant can only be assigned to each route once
TourRouteAssignmentSchema.index({ route: 1, participant: 1 }, { unique: true });

// For conflict detection: find existing assignments for (tour, direction, participant)
TourRouteAssignmentSchema.index({ tour: 1, participant: 1, direction: 1 });

module.exports = mongoose.model("TourRouteAssignment", TourRouteAssignmentSchema);
