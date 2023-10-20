// models/Exalumno.js
const mongoose = require("mongoose");

const exAlumnoSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  identification: {
    type: String,
    unique: true,
    required: true,
  },
  instrument: {
    type: String,
    required: true,
  },
  yearGraduated: {
    type: Number,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  instrumentCondition: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("Exalumno", exAlumnoSchema);
