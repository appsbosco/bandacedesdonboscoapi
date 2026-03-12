import mongoose from "mongoose";

const CompasSchema = new mongoose.Schema(
  {
    numerador: { type: Number, required: true, min: 1, max: 16 },
    denominador: { type: Number, required: true, enum: [4, 8, 16] },
  },
  { _id: false },
);

const TempoSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ["fijo", "curva"], required: true },
    bpm: { type: Number, min: 20, max: 300 },
    inicio: { type: Number, min: 20, max: 300 },
    fin: { type: Number, min: 20, max: 300 },
    curva: { type: String, enum: ["lineal", "exponencial", "logaritmica"] },
  },
  { _id: false },
);

const SeccionSchema = new mongoose.Schema(
  {
    seccionId: { type: String, required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 80 },
    compas: { type: CompasSchema, required: true },
    tempo: { type: TempoSchema, required: true },
    subdivision: { type: Number, enum: [1, 2, 3, 4], default: 1 },
    patronAcento: { type: [Number], default: [] },
    repeticiones: { type: Number, min: 1, max: 999, default: 4 },
  },
  { _id: false },
);

const PracticeSequenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    descripcion: { type: String, trim: true, maxlength: 500 },
    secciones: { type: [SeccionSchema], default: [] },
    countIn: { type: Boolean, default: true },
    countInBeats: { type: Number, enum: [1, 2, 4], default: 2 },
    sonido: {
      type: String,
      enum: ["click", "madera", "digital", "suave"],
      default: "click",
    },
    volumen: { type: Number, min: 0, max: 1, default: 0.8 },
    ultimaAbierta: { type: Boolean, default: false },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Solo una secuencia puede ser "última abierta" por usuario
PracticeSequenceSchema.pre("save", async function (next) {
  if (this.isModified("ultimaAbierta") && this.ultimaAbierta) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { ultimaAbierta: false },
    );
  }
  next();
});

export default mongoose.model("PracticeSequence", PracticeSequenceSchema);
