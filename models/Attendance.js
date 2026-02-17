// models/Attendance.js - AGREGAR AL FINAL

const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.ObjectId,
    ref: "RehearsalSession",
    required: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: [
      "PRESENT",
      "ABSENT_UNJUSTIFIED",
      "ABSENT_JUSTIFIED",
      "LATE",
      "UNJUSTIFIED_WITHDRAWAL",
      "JUSTIFIED_WITHDRAWAL",
    ],
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  recordedBy: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  // Campos legacy para mantener compatibilidad
  legacyId: {
    type: mongoose.Schema.ObjectId,
  },
  legacyAttended: {
    type: String,
  },
  legacyDate: {
    type: Date,
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

AttendanceSchema.index({ session: 1, user: 1 }, { unique: true });
AttendanceSchema.index({ user: 1, createdAt: -1 });
AttendanceSchema.index({ session: 1, status: 1 });

AttendanceSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// CAMBIO CRÍTICO: Especificar nombre de colección
module.exports = mongoose.model(
  "Attendance",
  AttendanceSchema,
  "attendanceRecords",
);
