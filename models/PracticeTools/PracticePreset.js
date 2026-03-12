import mongoose from "mongoose";

const PracticePresetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    descripcion: { type: String, trim: true, maxlength: 400 },
    esPublico: { type: Boolean, default: false, index: true },
    esFavorito: { type: Boolean, default: false },
    esPorDefecto: { type: Boolean, default: false },
    // Datos completos de la secuencia serializada
    datos: { type: mongoose.Schema.Types.Mixed, required: true },
    etiquetas: { type: [String], default: [] },
    vecesUsado: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true },
);

PracticePresetSchema.index({ user: 1, esFavorito: 1 });
PracticePresetSchema.index({ esPublico: 1, createdAt: -1 });

export default mongoose.model("PracticePreset", PracticePresetSchema);
