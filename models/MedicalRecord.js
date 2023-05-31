const mongoose = require("mongoose");

const MedicalRecordSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  identification: { type: String, required: false, trim: true, unique: true },
  sex: { type: String, required: false, unique: false, trim: true },
  bloodType: { type: String, required: false, unique: false, trim: true },
  address: { type: String, required: false, unique: false, trim: true },
  familyMemberName: {
    type: String,
    required: false,
    unique: false,
    trim: true,
  },
  familyMemberNumber: {
    type: String,
    required: false,
    unique: false,
    trim: true,
  },
  familyMemberNumberId: {
    type: String,
    required: false,
    unique: false,
    trim: true,
  },
  familyMemberRelationship: {
    type: String,
    required: false,
    unique: false,
    trim: true,
  },
  illness: { type: String, required: false, unique: false, trim: true },
  medicine: { type: String, required: false, unique: false, trim: true },
  medicineOnTour: {
    type: String,
    required: false,
    unique: false,
    trim: true,
  },
});

module.exports = mongoose.model("MedicalRecord", MedicalRecordSchema);
