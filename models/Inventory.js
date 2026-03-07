const mongoose = require("mongoose");

const InventorySchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // ── Legacy fields (do NOT rename) ────────────────────────────────────────
    brand:       { type: String },
    model:       { type: String },
    numberId:    { type: String },
    serie:       { type: String },
    condition:   { type: String },
    mainteinance: { type: String }, // legacy free-text notes field
    details:     { type: String },

    // ── Phase-1 additions ────────────────────────────────────────────────────
    instrumentType: { type: String },                   // mirrors user.instrument at record creation
    ownership: {
      type: String,
      enum: ["PERSONAL", "INSTITUTIONAL", "BORROWED"],
      default: "PERSONAL",
    },
    hasInstrument: { type: Boolean, default: true },    // false → NOT_APPLICABLE for maintenance status

    // Maintenance scheduling
    lastMaintenanceAt:      { type: Date },
    nextMaintenanceDueAt:   { type: Date },
    maintenanceIntervalDays: { type: Number, default: 180 }, // 6 months
  },
  { timestamps: true }
);

module.exports = mongoose.model("Inventory", InventorySchema);
