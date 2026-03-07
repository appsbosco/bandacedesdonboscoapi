const mongoose = require("mongoose");

/**
 * Ensemble — canonical registry of musical ensembles (Agrupaciones).
 *
 * Keys are the source-of-truth identifiers.
 * Names are the canonical Spanish display strings stored in User.bands.
 * isDefault=true means this ensemble is mandatory for all users (Banda de marcha).
 */
const EnsembleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["MARCHING", "CONCERT", "BIG_BAND", "OTHER"],
    },
    isDefault: { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

EnsembleSchema.index({ category: 1, sortOrder: 1 });
EnsembleSchema.index({ isActive: 1 });

const Ensemble = mongoose.model("Ensemble", EnsembleSchema);

// ── Seed helper ──────────────────────────────────────────────────────────────

const SEED_ENSEMBLES = [
  { key: "MARCHING",              name: "Banda de marcha",                   category: "MARCHING", isDefault: true,  sortOrder: 0 },
  { key: "BIG_BAND_A",            name: "Big Band A",                        category: "BIG_BAND", isDefault: false, sortOrder: 10 },
  { key: "BIG_BAND_B",            name: "Big Band B",                        category: "BIG_BAND", isDefault: false, sortOrder: 11 },
  { key: "BIG_BAND_C",            name: "Big Band C",                        category: "BIG_BAND", isDefault: false, sortOrder: 12 },
  { key: "CONCERT_ADVANCED",      name: "Banda de concierto avanzada",       category: "CONCERT",  isDefault: false, sortOrder: 20 },
  { key: "CONCERT_INTERMEDIATE",  name: "Banda de concierto intermedia",     category: "CONCERT",  isDefault: false, sortOrder: 21 },
  { key: "CONCERT_INITIAL",       name: "Banda de concierto inicial",        category: "CONCERT",  isDefault: false, sortOrder: 22 },
  { key: "CONCERT_ELEMENTARY",    name: "Banda de concierto elemental",      category: "CONCERT",  isDefault: false, sortOrder: 23 },
];

async function seedEnsembles() {
  for (const data of SEED_ENSEMBLES) {
    await Ensemble.findOneAndUpdate(
      { key: data.key },
      { $setOnInsert: data },
      { upsert: true, new: false }
    );
  }
}

module.exports = { Ensemble, seedEnsembles, SEED_ENSEMBLES };
