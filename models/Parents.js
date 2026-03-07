const mongoose = require("mongoose");

// Create a Mongoose schema for the Parent model
const ParentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  firstSurName: {
    type: String,
    required: true,
  },
  secondSurName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  phone: {
    type: String,
    required: true,
  },
  password: { type: String, required: true, trim: true, unique: false },

  role: {
    type: String,
    required: false,
    default: "Padre/Madre de familia",
    trim: true,
    unique: false,
  },
  avatar: {
    type: String,
  },
  children: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  resetPasswordToken: String,
  resetPasswordExpires: Date,
});

// Indexes for paginated search
ParentSchema.index({ firstSurName: 1, secondSurName: 1, name: 1 });
ParentSchema.index({ children: 1 }); // fast $in lookup by child IDs
// email has unique:true → auto-indexed by Mongo

module.exports = mongoose.model("Parent", ParentSchema);
