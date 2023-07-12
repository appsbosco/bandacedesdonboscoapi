const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  paymentEvent: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentEvent" },
  amount: Number,
  description: { type: String, required: false, unique: false },
  date: { type: String, required: false, unique: false },
});

module.exports = mongoose.model("Payment", PaymentSchema);
