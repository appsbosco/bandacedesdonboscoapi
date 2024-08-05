// models/Exalumno.js
const mongoose = require("mongoose");

const guatemalaSchema = new mongoose.Schema({
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
  authorized: {
    type: Boolean,
    required: true,
  },
});

module.exports = mongoose.model("Guatemala", guatemalaSchema);
