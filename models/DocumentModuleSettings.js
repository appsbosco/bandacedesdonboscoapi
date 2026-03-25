const mongoose = require("mongoose");

const documentModuleSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "default",
      unique: true,
      immutable: true,
      trim: true,
    },
    restrictSensitiveUploadsToAdmins: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DocumentModuleSettings", documentModuleSettingsSchema);
