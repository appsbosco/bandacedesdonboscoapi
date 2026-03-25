const mongoose = require("mongoose");

/**
 * AcademicPeriod — Período académico (trimestre, semestre, etc.)
 * order: orden dentro del año (1, 2, 3...)
 */
const AcademicPeriodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    order: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AcademicPeriodSchema.index({ year: 1, order: 1 });
AcademicPeriodSchema.index({ isActive: 1 });

module.exports = mongoose.model("AcademicPeriod", AcademicPeriodSchema);
