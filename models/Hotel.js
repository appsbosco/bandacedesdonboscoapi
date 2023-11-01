const mongoose = require("mongoose");

// HotelSchema.js

const HotelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("Hotel", HotelSchema);
