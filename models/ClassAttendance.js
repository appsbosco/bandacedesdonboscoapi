// models/AttendanceClass.js (ACTUALIZADO)

const mongoose = require("mongoose");

const AttendanceClassSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
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
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

AttendanceClassSchema.index({ student: 1, date: -1 });
AttendanceClassSchema.index({ student: 1, paymentStatus: 1 });
AttendanceClassSchema.index({ instructor: 1, date: -1 });

AttendanceClassSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("AttendanceClass", AttendanceClassSchema);
