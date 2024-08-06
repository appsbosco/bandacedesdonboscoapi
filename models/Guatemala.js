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
    default: null,
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

guatemalaSchema.index(
  { identification: 1 },
  {
    unique: true,
    partialFilterExpression: { identification: { $type: "string", $ne: "" } },
  }
);

const Guatemala = mongoose.model("Guatemala", guatemalaSchema);

module.exports = Guatemala;

module.exports = mongoose.model("Guatemala", guatemalaSchema);
