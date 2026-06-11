const mongoose = require("mongoose");

const AcademicAssessmentSlotSchema = new mongoose.Schema(
  {
    academicYear: { type: Number, required: true, index: true },
    semester: { type: Number, required: true, enum: [1, 2], index: true },
    slotKey: { type: String, required: true, trim: true, uppercase: true },
    label: { type: String, required: true, trim: true },
    evaluationType: {
      type: String,
      enum: ["EXAM", "FINAL_GRADE"],
      required: true,
    },
    subjectType: {
      type: String,
      enum: ["EXAM_BASED", "SEMESTER_FINAL_ONLY"],
      required: true,
    },
    appliesToGrades: [{ type: String, trim: true }],
    excludedGrades: [{ type: String, trim: true }],
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    requiresEvidence: { type: Boolean, default: true },
  },
  { timestamps: true }
);

AcademicAssessmentSlotSchema.index(
  { academicYear: 1, slotKey: 1 },
  { unique: true }
);
AcademicAssessmentSlotSchema.index({ academicYear: 1, semester: 1, isActive: 1 });
AcademicAssessmentSlotSchema.index({ subjectType: 1, evaluationType: 1, isActive: 1 });
AcademicAssessmentSlotSchema.index({ order: 1 });

module.exports = mongoose.model("AcademicAssessmentSlot", AcademicAssessmentSlotSchema);
