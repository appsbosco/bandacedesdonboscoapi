const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  title: { type: String, required: false, unique: false },
  place: { type: String, required: false, unique: false },
  date: { type: Date, required: false, unique: false },
  time: { type: String, required: false, unique: false },
  arrival: { type: String, required: false, unique: false },
  departure: { type: String, required: false, unique: false },
  description: { type: String, required: false, unique: false },
  type: { type: String, required: false, unique: false },
});

module.exports = Events = mongoose.model("events", EventSchema);
