const mongoose = require("mongoose");

const MAINTENANCE_TYPES = ["PREVENTIVE", "CORRECTIVE", "TUNING", "CLEANING", "OTHER"];

const InventoryMaintenanceSchema = mongoose.Schema(
  {
    inventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
      index: true,
    },
    performedAt:  { type: Date, required: true },
    type: {
      type: String,
      enum: MAINTENANCE_TYPES,
      default: "PREVENTIVE",
    },
    notes:        { type: String },
    performedBy:  { type: String },   // technician / shop name
    cost:         { type: Number },   // optional cost in local currency
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InventoryMaintenance", InventoryMaintenanceSchema);
