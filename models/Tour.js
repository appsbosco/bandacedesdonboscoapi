const mongoose = require("mongoose");

const TourSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "CLOSED", "CANCELLED"],
      default: "DRAFT",
      index: true,
    },
    description: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // ── Self-service access por módulo (configurado por Admin) ────────────────
    // Si enabled=false, ningún usuario no-privilegiado puede ver ningún módulo.
    // Cada flag habilita acceso de solo lectura a ese módulo para usuarios vinculados.
    selfServiceAccess: {
      enabled:   { type: Boolean, default: false },
      documents: { type: Boolean, default: true  },
      payments:  { type: Boolean, default: true  },
      rooms:     { type: Boolean, default: false },
      itinerary: { type: Boolean, default: false },
      flights:   { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

TourSchema.index({ startDate: 1, status: 1 });

module.exports = mongoose.model("Tour", TourSchema);
