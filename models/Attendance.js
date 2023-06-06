const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  date: {
    type: Date,
    required: true,
  },
  attended: {
    type: String,
  },
});

module.exports = mongoose.model("Attendance", AttendanceSchema);
