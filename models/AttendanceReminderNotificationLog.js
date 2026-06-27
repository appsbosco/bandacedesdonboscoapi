"use strict";

const mongoose = require("mongoose");

const AttendanceReminderNotificationLogSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
  },
  recipientUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  dateKey: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    default: "attendance_reminder",
    required: true,
  },
  reminderSlot: {
    type: String,
    required: true,
  },
  error: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

AttendanceReminderNotificationLogSchema.index(
  { event: 1, recipientUser: 1, dateKey: 1, type: 1, reminderSlot: 1 },
  { unique: true },
);

AttendanceReminderNotificationLogSchema.index({ dateKey: 1, reminderSlot: 1 });

module.exports = mongoose.model(
  "AttendanceReminderNotificationLog",
  AttendanceReminderNotificationLogSchema,
);
