// models/Exalumno.js
const mongoose = require("mongoose");

const colorGuardCampRegistrations = new mongoose.Schema({
  teamName: {
    type: String,
    required: true,
  },
  instructorName: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    unique: true,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  participantQuantity: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model(
  "ColorGuardCampRegistration",
  colorGuardCampRegistrations
);
