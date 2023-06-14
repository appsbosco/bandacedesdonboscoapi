const mongoose = require("mongoose");

const PaymentEventSchema = new mongoose.Schema({
  name: { type: String, required: false, unique: false },
  date: Date,
  description: { type: String, required: false, unique: false },
});

module.exports = mongoose.model("PaymentEvent", PaymentEventSchema);
