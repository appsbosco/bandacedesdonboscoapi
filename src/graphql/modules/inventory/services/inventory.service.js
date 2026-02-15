/**
 * inventory - Service
 * Lógica de negocio + DB (Mongoose)
 */
const Inventory = require("../../../../../models/Inventory");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

function getUserIdFromCtx(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return (u && (u.id || u._id || u.userId)) || null;
}

async function createInventory(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de inventario requeridos");

  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");

  // Siempre asignar owner/user desde contexto (no confiar en input.user)
  const created = await Inventory.create({
    ...input,
    user: userId,
  });

  return created;
}

async function updateInventory(id, input, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de inventario requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");

  const exists = await Inventory.findById(id);
  if (!exists) throw new Error("Este instrumento o inventario no existe");

  // Evitar que cambien el user por input
  const { user, ...safeInput } = input || {};

  const updated = await Inventory.findOneAndUpdate(
    { _id: id, user: userId }, // proteger ownership
    safeInput,
    { new: true, runValidators: true },
  );

  // Si existe pero no pertenece al usuario, devolvemos mismo mensaje “no existe” (no filtra info)
  if (!updated) throw new Error("Este instrumento o inventario no existe");

  return updated;
}

async function deleteInventory(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de inventario requerido");

  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");

  const deleted = await Inventory.findOneAndDelete({ _id: id, user: userId });
  if (!deleted) throw new Error("Este instrumento o inventario no existe");

  return "Instrumento o inventario eliminado correctamente";
}

async function getInventory(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de inventario requerido");

  const inventory = await Inventory.findById(id);
  if (!inventory) throw new Error("Este instrumento o inventario no existe");

  return inventory;
}

async function getInventories(ctx) {
  requireAuth(ctx);

  const inventories = await Inventory.find({}).populate("user");
  return inventories;
}

async function getInventoryByUser(ctx) {
  requireAuth(ctx);

  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");

  const inventory = await Inventory.find({ user: String(userId) });
  return inventory;
}

module.exports = {
  requireAuth,
  createInventory,
  updateInventory,
  deleteInventory,
  getInventory,
  getInventories,
  getInventoryByUser,
};
