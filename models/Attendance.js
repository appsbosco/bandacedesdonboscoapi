const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  attended: {
    type: String,
    default: false,
  },
});

module.exports = mongoose.model("Attendance", AttendanceSchema);
