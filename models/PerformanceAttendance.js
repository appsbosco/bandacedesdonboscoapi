// PerformanceAttendanceSchema.js

const mongoose = require("mongoose");

const PerformanceAttendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  event: {
    type: mongoose.Schema.ObjectId,
    ref: "events",
    required: true,
  },
  attended: {
    type: String,
  },
  busNumber: {
    type: Number,
    required: false,
    enum: [1, 2, 3, 4, 5],
  },
  hotel: {
    type: mongoose.Schema.ObjectId,
    ref: "Hotel",
    required: false,
  },
});

module.exports = mongoose.model(
  "PerformanceAttendance",
  PerformanceAttendanceSchema
);
