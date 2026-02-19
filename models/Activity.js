/**
 * Activity — Catálogo de actividades/campañas (asignables a Sales y Expenses).
 */
const mongoose = require("mongoose");

const ActivitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ActivitySchema.index({ isActive: 1 });

module.exports = mongoose.model("Activity", ActivitySchema);
