const mongoose = require("mongoose");

const InventorySchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  brand: { type: String, required: false, unique: false },
  model: { type: String, required: false, unique: false },
  numberId: { type: String, required: false, unique: false },
  serie: { type: String, required: false, unique: false },
  condition: { type: String, required: false, unique: false },
  mainteinance: { type: String, required: false, unique: false },
  details: { type: String, required: false, unique: false },
});

module.exports = mongoose.model("Inventory", InventorySchema);
