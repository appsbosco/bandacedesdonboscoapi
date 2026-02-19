const User = require("../../../../../models/User");
const Product = require("../../../../../models/Product");
const Order = require("../../../../../models/Order");
const { dispatch } = require("../../../notifications/notification.dispatcher");
const { EVENTS } = require("../../../notifications/notification.templates");

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);
  // if (!currentUser) throw new Error("No autenticado");
  return currentUser;
}

function normalizeDate(dateInput, fieldName) {
  if (dateInput === undefined || dateInput === null || dateInput === "")
    return undefined;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime()))
    throw new Error(`${fieldName || "Fecha"} inválida`);
  return d;
}

function populateOrder(q) {
  return q
    .populate({ path: "userId", model: "User" })
    .populate({ path: "products.productId", model: "Product" });
}

// ─── Notifications ───────────────────────────────────────────────────────────

async function sendNewProductNotification(productId) {
  dispatch(EVENTS.STORE_PRODUCT_CREATED, { productId }).catch((err) =>
    console.error("[store.service] notif error:", err.message),
  );
}

// ─── Products ────────────────────────────────────────────────────────────────

async function createProduct(payload, ctx) {
  requireAuth(ctx);
  if (!payload) throw new Error("Datos de producto requeridos");

  const closingDate = normalizeDate(payload.closingDate, "closingDate");

  const created = await Product.create({
    name: payload.name,
    description: payload.description,
    category: payload.category,
    price: payload.price,
    availableForDays: payload.availableForDays,
    photo: payload.photo,
    ...(closingDate ? { closingDate } : {}),
  });

  // BUG FIX: antes llamaba sendNewProductNotification(ctx) en vez del id
  sendNewProductNotification(created._id.toString());

  return created;
}

async function updateProduct(payload, ctx) {
  requireAuth(ctx);
  if (!payload || !payload.id) throw new Error("ID de producto requerido");

  const exists = await Product.findById(payload.id);
  if (!exists) throw new Error("Producto no existe");

  const closingDate = normalizeDate(payload.closingDate, "closingDate");

  const $set = {};
  if (payload.name !== undefined) $set.name = payload.name;
  if (payload.description !== undefined) $set.description = payload.description;
  if (payload.category !== undefined) $set.category = payload.category;
  if (payload.price !== undefined) $set.price = payload.price;
  if (payload.availableForDays !== undefined)
    $set.availableForDays = payload.availableForDays;
  if (payload.photo !== undefined) $set.photo = payload.photo;
  if (closingDate !== undefined) $set.closingDate = closingDate;

  const updated = await Product.findByIdAndUpdate(
    payload.id,
    { $set },
    { new: true, runValidators: true },
  );
  if (!updated) throw new Error("Producto no existe");
  return updated;
}

async function deleteProduct(id, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de producto requerido");
  const deleted = await Product.findByIdAndDelete(id);
  if (!deleted) throw new Error("Producto no existe");
  return deleted;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

async function createOrder(userId, products, ctx, fulfillmentDate) {
  requireAuth(ctx);
  if (!userId) throw new Error("userId requerido");
  if (!Array.isArray(products) || products.length === 0)
    throw new Error("products requerido");

  const user = await User.findById(userId);
  if (!user) throw new Error("Usuario no encontrado");

  const fd = normalizeDate(fulfillmentDate, "fulfillmentDate");

  // Mapear a subdocs con campos de retiro inicializados
  const items = products.map((p) => ({
    productId: p.productId,
    quantity: p.quantity,
    quantityPickedUp: 0,
    status: "pending",
  }));

  const created = await Order.create({
    userId,
    products: items,
    orderDate: new Date(),
    ...(fd ? { fulfillmentDate: fd } : {}),
    isCompleted: false,
  });

  return populateOrder(Order.findById(created._id));
}

async function recordPickup(
  orderId,
  itemId,
  quantityPickedUp,
  pickedUpAt,
  ctx,
) {
  requireAuth(ctx);
  if (!orderId) throw new Error("orderId requerido");
  if (!itemId) throw new Error("itemId requerido");
  if (!quantityPickedUp || quantityPickedUp <= 0)
    throw new Error("quantityPickedUp debe ser > 0");

  const order = await Order.findById(orderId);
  if (!order) throw new Error("Orden no existe");
  if (order.isCompleted) throw new Error("La orden ya está completada");

  const item = order.products.id(itemId);
  if (!item) throw new Error("Item no encontrado en la orden");

  const newTotal = item.quantityPickedUp + quantityPickedUp;
  if (newTotal > item.quantity) {
    throw new Error(
      `No se puede retirar más de lo pedido. Pedido: ${item.quantity}, ya retirado: ${item.quantityPickedUp}, intentando retirar: ${quantityPickedUp}`,
    );
  }

  item.quantityPickedUp = newTotal;
  item.pickedUpAt = normalizeDate(pickedUpAt, "pickedUpAt") || new Date();
  item.status =
    newTotal >= item.quantity
      ? "completed"
      : newTotal > 0
        ? "partial"
        : "pending";

  // Sincronizar isCompleted
  order.isCompleted = order.products.every(
    (p) => p.quantityPickedUp >= p.quantity,
  );

  await order.save();

  return populateOrder(Order.findById(order._id));
}

// Mantener compatibilidad con completeOrder existente
async function completeOrder(orderId, ctx) {
  requireAuth(ctx);
  if (!orderId) throw new Error("orderId requerido");

  const order = await Order.findById(orderId);
  if (!order) throw new Error("Orden no existe");

  // Marcar todos los items como completados
  for (const item of order.products) {
    item.quantityPickedUp = item.quantity;
    item.status = "completed";
    item.pickedUpAt = item.pickedUpAt || new Date();
  }
  order.isCompleted = true;
  await order.save();

  return populateOrder(Order.findById(order._id));
}

// ─── Queries básicas ─────────────────────────────────────────────────────────

async function getProducts(ctx) {
  requireAuth(ctx);
  return Product.find({});
}

async function getOrders(ctx) {
  requireAuth(ctx);
  return populateOrder(Order.find({}));
}

async function getOrdersByUserId(userId, ctx) {
  requireAuth(ctx);
  const query = userId ? { userId } : {};
  return populateOrder(Order.find(query));
}

async function getOrderById(id, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de orden requerido");
  const order = await populateOrder(Order.findById(id));
  if (!order) throw new Error("Orden no existe");
  return order;
}

// ─── Reportes ────────────────────────────────────────────────────────────────

function dateRange(startDate, endDate) {
  const start = normalizeDate(startDate, "startDate");
  const end = normalizeDate(endDate, "endDate");
  if (!start || !end) throw new Error("startDate y endDate requeridos");
  // end = fin del día
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Resumen por día: total órdenes, items, unidades pedidas vs retiradas.
 * Agrupa por fulfillmentDate (fallback a orderDate si no existe).
 */
async function reportDailySummary(startDate, endDate, ctx) {
  requireAuth(ctx);
  const { start, end } = dateRange(startDate, endDate);

  const pipeline = [
    {
      $match: {
        $or: [
          { fulfillmentDate: { $gte: start, $lte: end } },
          {
            fulfillmentDate: { $exists: false },
            orderDate: { $gte: start, $lte: end },
          },
        ],
      },
    },
    { $unwind: "$products" },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: {
              $ifNull: ["$fulfillmentDate", "$orderDate"],
            },
          },
        },
        orderIds: { $addToSet: "$_id" },
        totalItems: { $sum: 1 },
        totalUnits: { $sum: "$products.quantity" },
        pickedUpUnits: { $sum: "$products.quantityPickedUp" },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        totalOrders: { $size: "$orderIds" },
        totalItems: 1,
        totalUnits: 1,
        pickedUpUnits: 1,
        pendingUnits: { $subtract: ["$totalUnits", "$pickedUpUnits"] },
      },
    },
    { $sort: { date: 1 } },
  ];

  return Order.aggregate(pipeline);
}

/**
 * Resumen por producto en rango de fechas.
 */
async function reportProductRange(startDate, endDate, ctx) {
  requireAuth(ctx);
  const { start, end } = dateRange(startDate, endDate);

  const pipeline = [
    {
      $match: {
        $or: [
          { fulfillmentDate: { $gte: start, $lte: end } },
          {
            fulfillmentDate: { $exists: false },
            orderDate: { $gte: start, $lte: end },
          },
        ],
      },
    },
    { $unwind: "$products" },
    {
      $group: {
        _id: "$products.productId",
        totalOrdered: { $sum: "$products.quantity" },
        totalPickedUp: { $sum: "$products.quantityPickedUp" },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productInfo",
      },
    },
    { $unwind: { path: "$productInfo", preserveNullAndEmpty: true } },
    {
      $project: {
        _id: 0,
        productId: "$_id",
        name: { $ifNull: ["$productInfo.name", "Producto eliminado"] },
        totalOrdered: 1,
        totalPickedUp: 1,
        totalPending: { $subtract: ["$totalOrdered", "$totalPickedUp"] },
      },
    },
    { $sort: { name: 1 } },
  ];

  return Order.aggregate(pipeline);
}

/**
 * Desglose por día + producto: cuánto preparar.
 */
async function reportDayBreakdown(startDate, endDate, ctx) {
  requireAuth(ctx);
  const { start, end } = dateRange(startDate, endDate);

  const pipeline = [
    {
      $match: {
        $or: [
          { fulfillmentDate: { $gte: start, $lte: end } },
          {
            fulfillmentDate: { $exists: false },
            orderDate: { $gte: start, $lte: end },
          },
        ],
      },
    },
    { $unwind: "$products" },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: { $ifNull: ["$fulfillmentDate", "$orderDate"] },
            },
          },
          productId: "$products.productId",
        },
        totalOrdered: { $sum: "$products.quantity" },
        totalPickedUp: { $sum: "$products.quantityPickedUp" },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id.productId",
        foreignField: "_id",
        as: "productInfo",
      },
    },
    { $unwind: { path: "$productInfo", preserveNullAndEmpty: true } },
    {
      $group: {
        _id: "$_id.date",
        products: {
          $push: {
            productId: "$_id.productId",
            name: { $ifNull: ["$productInfo.name", "Producto eliminado"] },
            totalOrdered: "$totalOrdered",
            totalPickedUp: "$totalPickedUp",
            totalPending: { $subtract: ["$totalOrdered", "$totalPickedUp"] },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        products: 1,
      },
    },
    { $sort: { date: 1 } },
  ];

  return Order.aggregate(pipeline);
}

module.exports = {
  requireAuth,
  // Products
  createProduct,
  updateProduct,
  deleteProduct,
  // Orders
  createOrder,
  completeOrder,
  recordPickup,
  // Queries
  getProducts,
  getOrders,
  getOrdersByUserId,
  getOrderById,
  // Reports
  reportDailySummary,
  reportProductRange,
  reportDayBreakdown,
};
