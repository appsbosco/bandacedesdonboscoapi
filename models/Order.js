const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: { type: Number, required: true }, // pedido original (inmutable)
  quantityPickedUp: { type: Number, default: 0 }, // acumulado retirado
  status: {
    type: String,
    enum: ["pending", "partial", "completed"],
    default: "pending",
  },
  pickedUpAt: { type: Date }, // última vez que se registró retiro
});

const OrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  products: [OrderItemSchema],
  orderDate: { type: Date, default: Date.now },
  fulfillmentDate: { type: Date, required: false }, // día de preparación/retiro
  isCompleted: { type: Boolean, default: false },
});

// Índices para reportes
OrderSchema.index({ fulfillmentDate: 1 });
OrderSchema.index({ fulfillmentDate: 1, isCompleted: 1 });
OrderSchema.index({ userId: 1, isCompleted: 1 });
OrderSchema.index({ "products.productId": 1, fulfillmentDate: 1 });

module.exports = mongoose.model("Order", OrderSchema);
