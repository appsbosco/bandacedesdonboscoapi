const mongoose = require("mongoose");

const OccupantSchema = new mongoose.Schema(
  {
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TourParticipant",
      required: true,
    },
    confirmedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TourRoomSchema = new mongoose.Schema(
  {
    tour: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tour",
      required: true,
      index: true,
    },
    hotelName:  { type: String, required: true, trim: true },
    roomNumber: { type: String, required: true, trim: true },
    roomType: {
      type: String,
      enum: ["SINGLE", "DOUBLE", "TRIPLE", "QUAD", "SUITE"],
      required: true,
    },
    capacity:  { type: Number, required: true, min: 1 },
    floor:     { type: String, trim: true },
    notes:     { type: String, trim: true },
    occupants: [OccupantSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

TourRoomSchema.index({ tour: 1, hotelName: 1 });
TourRoomSchema.index({ tour: 1, roomNumber: 1 });

module.exports = mongoose.model("TourRoom", TourRoomSchema);
