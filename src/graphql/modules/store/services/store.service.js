/**
 * store - Service
 * Lógica de negocio + DB (Mongoose)
 */
const User = require("../../../../../models/User");
const Product = require("../../../../../models/Product");
const Order = require("../../../../../models/Order");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
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

function getAdminMessaging(ctx) {
  // No invento imports: si tu proyecto ya inyecta firebase admin en ctx, lo usamos.
  // Ejemplos posibles: ctx.admin, ctx.firebaseAdmin
  const admin = ctx && (ctx.admin || ctx.firebaseAdmin);
  if (!admin || !admin.messaging) return null;
  try {
    return admin.messaging();
  } catch (e) {
    return null;
  }
}

async function sendNewProductNotification(ctx) {
  const messaging = getAdminMessaging(ctx);
  if (!messaging) return; // Silencioso: no rompe si no hay firebase admin en ctx.

  const users = await User.find(
    { notificationTokens: { $exists: true, $ne: [] } },
    { notificationTokens: 1 },
  );

  const tokens = Array.from(
    new Set(
      users.flatMap((u) =>
        Array.isArray(u.notificationTokens) ? u.notificationTokens : [],
      ),
    ),
  );

  if (tokens.length === 0) return;

  const message = {
    notification: {
      title: "Banda CEDES Don Bosco - Nuevo Producto Disponible",
      body: "Un nuevo producto ha sido añadido y ya puedes hacer la solicitud de tu almuerzo.",
    },
    tokens,
  };

  const response = await messaging.sendEachForMulticast(message);

  if (response && typeof response.successCount === "number") {
    console.log(
      `${response.successCount} mensajes fueron enviados exitosamente.`,
    );
  }

  if (
    response &&
    response.failureCount > 0 &&
    Array.isArray(response.responses)
  ) {
    response.responses.forEach((resp, idx) => {
      if (resp && !resp.success) {
        console.log(`Error en el token en índice ${idx}:`, resp.error);
      }
    });
  }
}

/**
 * Products
 */
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

  // Notificación best-effort (no rompe si falla)
  try {
    await sendNewProductNotification(ctx);
  } catch (e) {
    console.log("Error enviando notificación de nuevo producto:", e);
  }

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

/**
 * Orders
 */
function populateOrder(q) {
  return q
    .populate({ path: "userId", model: "User" })
    .populate({ path: "products.productId", model: "Product" });
}

async function createOrder(userId, products, ctx) {
  requireAuth(ctx);

  if (!userId) throw new Error("userId requerido");
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("products requerido");
  }

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const created = await Order.create({
    userId,
    products,
    orderDate: new Date(),
  });

  const populated = await populateOrder(Order.findById(created._id));
  return populated || created;
}

async function completeOrder(orderId, ctx) {
  requireAuth(ctx);

  if (!orderId) throw new Error("orderId requerido");

  const updated = await Order.findByIdAndUpdate(
    orderId,
    { $set: { isCompleted: true } },
    { new: true, runValidators: true },
  );

  if (!updated) throw new Error("Orden no existe");
  return updated;
}

async function getProducts(ctx) {
  requireAuth(ctx);
  return await Product.find({});
}

async function getOrders(ctx) {
  requireAuth(ctx);
  return await populateOrder(Order.find({}));
}

async function getOrdersByUserId(userId, ctx) {
  requireAuth(ctx);

  const query = {};
  if (userId) query.userId = userId;

  return await populateOrder(Order.find(query));
}

async function getOrderById(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de orden requerido");

  const order = await populateOrder(Order.findById(id));
  if (!order) throw new Error("Orden no existe");

  return order;
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

  // Queries
  getProducts,
  getOrders,
  getOrdersByUserId,
  getOrderById,
};
