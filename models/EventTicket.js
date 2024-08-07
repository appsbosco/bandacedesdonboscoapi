const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: String,
  date: Date,
  description: String,
  totalTickets: { type: Number, default: 0 }, // Campo para el total de boletos emitidos
  ticketLimit: { type: Number, required: true }, // Límite de boletos para el evento
  raffleEnabled: { type: Boolean, default: false },
  price: { type: Number, required: true },
});

const EventTicket = mongoose.model("EventTicket", eventSchema);

module.exports = { EventTicket };
