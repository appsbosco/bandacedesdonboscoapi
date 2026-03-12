import mongoose from "mongoose";

const MetronomeQuickSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Un documento por usuario
      index: true,
    },
    bpm: { type: Number, min: 20, max: 300, default: 120 },
    pulsaciones: { type: Number, min: 1, max: 16, default: 4 },
    subdivision: { type: Number, enum: [1, 2, 3, 4], default: 1 },
    sonido: {
      type: String,
      enum: ["click", "madera", "digital", "suave"],
      default: "click",
    },
    volumen: { type: Number, min: 0, max: 1, default: 0.8 },
    // Preferencia A4 del afinador guardada junto a la configuración del usuario
    a4Referencia: { type: Number, min: 430, max: 450, default: 440 },
  },
  { timestamps: true },
);

export default mongoose.model(
  "MetronomeQuickSettings",
  MetronomeQuickSettingsSchema,
);
