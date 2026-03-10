/**
 * Formation.js
 *
 * Domain rules:
 * - Source of truth = users (by instrument→section mapping), NOT attendance.
 * - Global `columns` applies to wind blocks; Danza, Percusión, and Color Guard have their own.
 * - 5 zones in depth order (vertical):
 *     FRENTE_ESPECIAL → BLOQUE_FRENTE → PERCUSION → BLOQUE_ATRAS → FINAL
 * - SINGLE: FRENTE_ESPECIAL, BLOQUE_FRENTE, PERCUSION, FINAL
 * - DOUBLE: all 5 zones — members of BLOQUE_FRENTE/ATRAS are split per section
 * - Slots are flat; zone identifies depth position; section is for color-coding only.
 */
const mongoose = require("mongoose");

const FormationSlotSchema = new mongoose.Schema(
  {
    zone: {
      type: String,
      required: true,
      enum: ["FRENTE_ESPECIAL", "BLOQUE_FRENTE", "PERCUSION", "BLOQUE_ATRAS", "FINAL"],
    },
    row:         { type: Number, required: true },
    col:         { type: Number, required: true },
    section:     { type: String, default: null }, // for color-coding only
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    displayName: { type: String, default: null },
    locked:      { type: Boolean, default: false },
  },
  { _id: false }
);

const ZoneMemberCountSchema = new mongoose.Schema(
  {
    zone:  { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

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

const FormationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true },

    // SINGLE = FRENTE_ESPECIAL + BLOQUE_FRENTE + PERCUSION + FINAL
    // DOUBLE = all 5 zones (BLOQUE_ATRAS added between PERCUSION and FINAL)
    type: { type: String, enum: ["SINGLE", "DOUBLE"], required: true, default: "SINGLE" },

    // Global column count — applies to every zone
    columns: { type: Number, required: true, min: 1, default: 8 },

    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "FormationTemplate", default: null },

    // Section order per zone — fully configurable
    zoneOrders: [ZoneOrderSchema],

    // Per-zone column overrides for Danza (FRENTE_ESPECIAL), Percusión, and Color Guard (FINAL)
    zoneColumns: [ZoneColumnsSchema],

    instrumentMappings: [InstrumentMappingSchema],
    excludedUserIds:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    slots:              [FormationSlotSchema],
    zoneMemberCounts:   [ZoneMemberCountSchema],
    notes:              { type: String, trim: true },
    createdBy:          { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Formation", FormationSchema);
