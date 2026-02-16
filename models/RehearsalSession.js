const mongoose = require("mongoose");
const { normalizeDateToStartOfDayCR } = require("../utils/dates");

const RehearsalSessionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  // Normalizada a inicio del día (00:00:00) para comparaciones
  dateNormalized: {
    type: Date,
    required: true,
    index: true,
  },
  // Sección instrumental que debe pasar lista
  section: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "NO_APLICA",
      "FLAUTAS",
      "CLARINETES",
      "SAXOFONES",
      "TROMPETAS",
      "TROMBONES",
      "TUBAS",
      "EUFONIOS",
      "CORNOS",
      "MALLETS",
      "PERCUSION",
      "COLOR_GUARD",
      "DANZA",
    ],
  },
  // Estado del ensayo
  status: {
    type: String,
    enum: ["SCHEDULED", "IN_PROGRESS", "CLOSED"],
    default: "SCHEDULED",
  },
  // Usuario que pasó/cerró la lista
  takenBy: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
  },
  // Timestamp cuando se pasó lista
  takenAt: {
    type: Date,
  },
  // Timestamp cuando se cerró (opcional)
  closedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ÍNDICE ÚNICO: solo un ensayo por sección por día
RehearsalSessionSchema.index(
  { dateNormalized: 1, section: 1 },
  { unique: true },
);

// Índice para queries rápidas
RehearsalSessionSchema.index({ status: 1, dateNormalized: -1 });

// Hook: normalizar fecha antes de guardar
RehearsalSessionSchema.pre("save", function (next) {
  if (this.date) {
    const normalized = normalizeDateToStartOfDayCR(this.date);
    this.dateNormalized = normalized;
    this.date = normalized;
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("RehearsalSession", RehearsalSessionSchema);
