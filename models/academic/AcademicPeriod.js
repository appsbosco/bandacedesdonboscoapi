const mongoose = require("mongoose");

/**
 * AcademicPeriod — Período académico (trimestre, semestre, etc.)
 * order: orden dentro del año (1, 2, 3...)
 */
const AcademicPeriodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    academicYear: { type: Number },
    semester: { type: Number, enum: [1, 2], required: true },
    order: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AcademicPeriodSchema.index({ year: 1, order: 1 });
AcademicPeriodSchema.index({ academicYear: 1, semester: 1 });
AcademicPeriodSchema.index({ isActive: 1 });

AcademicPeriodSchema.pre("validate", function setAcademicYear(next) {
  if (!this.academicYear && this.year) this.academicYear = this.year;
  next();
});

module.exports = mongoose.model("AcademicPeriod", AcademicPeriodSchema);
