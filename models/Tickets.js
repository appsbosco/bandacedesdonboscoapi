// models/Ticket.js — versión mejorada
const mongoose = require("mongoose");

const ScanLogSchema = new mongoose.Schema(
  {
    scannedAt: { type: Date, default: Date.now },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // operador
    deviceId: { type: String }, // fingerprint del dispositivo (opcional)
    location: { type: String }, // "Puerta A", "Puerta B"
    result: {
      type: String,
      enum: ["ok", "duplicate", "unpaid", "invalid", "expired"],
    },
    note: { type: String },
  },
  { _id: false },
);

const TicketSchema = new mongoose.Schema(
  {
    // Titularidad — solo UNO de los dos es obligatorio
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    buyerName: { type: String, trim: true },
    buyerEmail: { type: String, trim: true },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventTicket",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["assigned", "purchased", "courtesy", "extra"],
      required: true,
    },

    source: {
      type: String,
      enum: ["manual", "excel_import"],
      default: "manual",
      index: true,
    },
    importKey: { type: String, index: true },
    externalTicketNumbers: [{ type: String }],
    paymentEmailSentAt: { type: Date },
    paymentEmailSentForQuantity: { type: Number, default: 0 },

    // Estado explícito — fuente de verdad única
    status: {
      type: String,
      enum: [
        "pending_payment", // emitido, sin pagar
        "paid", // pagado, sin usar
        "checked_in", // 1er ingreso registrado
        "partially_used", // qty > 1 y scans < qty
        "fully_used", // todos los ingresos consumidos
        "cancelled", // anulado por admin
      ],
      default: "pending_payment",
      index: true,
    },

    // Pago
    paid: { type: Boolean, default: false },
    amountPaid: { type: Number, default: 0 },
    ticketQuantity: { type: Number, required: true, min: 1 },

    // Escaneos
    scans: { type: Number, default: 0 },
    scanLog: [ScanLogSchema], // historial completo

    // QR
    qrCode: { type: String },
    qrSecret: { type: String }, // HMAC secret para anti-tampering (opcional)

    // Rifa
    raffleNumbers: [{ type: String }],

    // Auditoría
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancelledAt: { type: Date },
    notes: { type: String },
  },
  {
    timestamps: true, // createdAt, updatedAt automáticos
  },
);

// Índices
TicketSchema.index({ eventId: 1, status: 1 });
TicketSchema.index({ eventId: 1, source: 1, importKey: 1 });
TicketSchema.index({ buyerEmail: 1 });
TicketSchema.index({ raffleNumbers: 1 });

// Método para recalcular status desde campos de pago/scans
TicketSchema.methods.recalculateStatus = function () {
  if (this.status === "cancelled") return; // irreversible

  const isPaid = this.paid || this.type === "courtesy";
  if (!isPaid) {
    this.status = "pending_payment";
    return;
  }

  const scans = this.scans || 0;
  const qty = this.ticketQuantity || 1;

  if (scans === 0) this.status = "paid";
  else if (scans < qty) this.status = "partially_used";
  else this.status = "fully_used";
};

const Ticket = mongoose.models.Ticket || mongoose.model("Ticket", TicketSchema);

module.exports = Ticket;
module.exports.Ticket = Ticket;
