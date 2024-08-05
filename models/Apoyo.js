// models/Exalumno.js
const mongoose = require("mongoose");

const apoyoSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
  },
  identification: {
    type: String,
    unique: true,
  },
  instrument: {
    type: String,
  },
  email: {
    type: String,
  },
  children: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  comments: {
    type: String,
  },
  availability: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("Apoyo", apoyoSchema);
