/**
 * Category — Catálogo de categorías de egreso.
 */
const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CategorySchema.index({ isActive: 1 });

module.exports = mongoose.model("Category", CategorySchema);
