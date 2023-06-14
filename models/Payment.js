const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  paymentEvent: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentEvent" },
  amount: Number,
  date: { type: String, required: false, unique: false },
});

module.exports = mongoose.model("Payment", PaymentSchema);
