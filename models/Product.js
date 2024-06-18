const mongoose = require("mongoose");

const ProductSchema = mongoose.Schema({
  name: { type: String, required: true, trim: true },
  photo: { type: String },
  description: { type: String, trim: true },
  category: { type: String, trim: true },
  price: { type: Number, required: true },
  availableForDays: { type: String, trim: true },
  closingDate: { type: Date, required: true },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Product", ProductSchema);
