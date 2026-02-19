/**
 * Sale — Ingreso registrado en caja.
 * businessDate: String "YYYY-MM-DD" (ver decisión en CashSession.js)
 */
const mongoose = require("mongoose");

const LineItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    nameSnapshot: { type: String, required: true, trim: true },
    unitPriceSnapshot: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
  },
  { _id: true },
);

const SaleSchema = new mongoose.Schema(
  {
    businessDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    cashSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "CashSession" },
    activityId: { type: mongoose.Schema.Types.ObjectId, ref: "Activity" },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },

    paymentMethod: {
      type: String,
      enum: ["CASH", "SINPE", "CARD", "TRANSFER", "OTHER"],
      required: true,
    },
    source: {
      type: String,
      enum: ["ORDER", "WALK_IN"],
      required: true,
      default: "WALK_IN",
    },

    // Items opcionales. Si están, permiten reporte por producto.
    lineItems: { type: [LineItemSchema], default: [] },

    total: { type: Number, required: true, min: 0.01 },

    status: {
      type: String,
      enum: ["ACTIVE", "VOIDED", "REFUNDED"],
      default: "ACTIVE",
    },

    // Audit trail
    voidReason: { type: String, trim: true },
    refundReason: { type: String, trim: true },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

SaleSchema.index({ businessDate: 1 });
SaleSchema.index({ businessDate: 1, status: 1 });
SaleSchema.index({ paymentMethod: 1, businessDate: 1 });
SaleSchema.index({ status: 1 });
SaleSchema.index({ activityId: 1, businessDate: 1 });
SaleSchema.index({ orderId: 1 });
SaleSchema.index({ cashSessionId: 1 });
SaleSchema.index({ "lineItems.productId": 1, businessDate: 1 });

module.exports = mongoose.model("Sale", SaleSchema);
