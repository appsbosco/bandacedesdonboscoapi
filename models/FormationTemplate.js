/**
 * FormationTemplate.js
 *
 * Reusable configuration for parade formations.
 * Stores default column count, zone-based section orders,
 * and optional instrument→section mapping overrides.
 */
const mongoose = require("mongoose");

const InstrumentMappingSchema = new mongoose.Schema(
  {
    instrument: { type: String, required: true, trim: true },
    section:    { type: String, required: true },
  },
  { _id: false }
);

const ZoneOrderSchema = new mongoose.Schema(
  {
    zone:         { type: String, required: true },
    sectionOrder: [{ type: String }],
  },
  { _id: false }
);

const ZoneColumnsSchema = new mongoose.Schema(
  {
    zone:    { type: String, required: true },
    columns: { type: Number, required: true, min: 1, default: 1 },
    rows:    { type: Number, min: 1, default: null },
  },
  { _id: false }
);

const FormationTemplateSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    defaultColumns: { type: Number, required: true, min: 1, default: 8 },

    // Section order per zone — fully configurable
    zoneOrders: [ZoneOrderSchema],

    // Per-zone column overrides for Danza, Percusión, and Color Guard
    zoneColumns: [ZoneColumnsSchema],

    instrumentMappings: [InstrumentMappingSchema],
    notes:    { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FormationTemplate", FormationTemplateSchema);
