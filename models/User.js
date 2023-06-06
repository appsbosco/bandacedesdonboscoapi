const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: false },
  firstSurName: { type: String, required: true, trim: true, unique: false },
  secondSurName: { type: String, required: true, trim: true, unique: false },
  email: { type: String, required: true, trim: true, unique: true },
  password: { type: String, required: true, trim: true, unique: false },
  birthday: { type: String, required: false, unique: false },
  carnet: { type: String, required: false, trim: true, unique: false },
  state: { type: String, required: false, trim: true, unique: false },
  role: { type: String, required: true, trim: true, unique: false },
  grade: { type: String, required: false, trim: true, unique: false },
  phone: { type: String, required: true, trim: true, unique: false },
  instrument: { type: String, required: false, trim: true, unique: false },
  avatar: { type: String },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);
