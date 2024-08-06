const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: String,
  date: Date,
  description: String,
});

const EventTicket = mongoose.model("EventTicket", eventSchema);

module.exports = { EventTicket };
