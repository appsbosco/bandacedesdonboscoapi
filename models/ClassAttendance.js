const mongoose = require("mongoose");

const AttendanceClassSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  date: { type: Date, required: true },
  attendanceStatus: {
    type: String,
    required: true,
    enum: ["Presente", "Ausencia Justificada", "Ausencia No Justificada"],
    default: "Presente",
  },
  justification: {
    type: String,
    required: function () {
      return this.attendanceStatus === "Ausencia Justificada";
    },
  },
  paymentStatus: {
    type: String,
    required: true,
    enum: ["Pendiente", "Pagado", "Becado"],
    default: "Pendiente",
  },
});

module.exports = mongoose.model("AttendanceClass", AttendanceClassSchema);
