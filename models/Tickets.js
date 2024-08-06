const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
  },
  type: {
    type: String,
    enum: ["assigned", "extra", "purchased"],
    required: true,
  },
  paid: { type: Boolean, default: false },
  amountPaid: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  qrCode: { type: String, required: true },
  scanned: { type: Boolean, default: false },
  buyerName: { type: String, required: false },
  buyerEmail: { type: String, required: false },
});

const Ticket = mongoose.model("Ticket", ticketSchema);

module.exports = { Ticket };
