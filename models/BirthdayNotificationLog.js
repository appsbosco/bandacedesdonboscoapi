"use strict";

const mongoose = require("mongoose");

const BirthdayNotificationLogSchema = new mongoose.Schema({
  birthdayUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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
    default: "birthday",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

BirthdayNotificationLogSchema.index(
  { birthdayUser: 1, recipientUser: 1, dateKey: 1, type: 1 },
  { unique: true }
);

module.exports = mongoose.model("BirthdayNotificationLog", BirthdayNotificationLogSchema);
