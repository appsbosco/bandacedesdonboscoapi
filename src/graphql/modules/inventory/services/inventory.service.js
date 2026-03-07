/**
 * inventory.service.js
 *
 * Domain rules:
 * - Inventory.condition = tenencia/ownership (legacy field, do NOT rename)
 * - Inventory records with user=null are INVALID and must be cleaned up
 * - A user may have at most ONE inventory record assigned
 * - unassignInventory DELETES the record (null-user records are garbage)
 */
const Inventory = require("../../../../../models/Inventory");
const InventoryMaintenance = require("../../../../../models/InventoryMaintenance");
const User = require("../../../../../models/User");

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);
  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");
  return currentUser;
}

function requireAdmin(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  if (!ADMIN_ROLES.has(user.role)) throw new Error("No autorizado");
  return user;
}

function getUserIdFromCtx(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return (u && (u.id || u._id || u.userId)) || null;
}

// ── Status computation ────────────────────────────────────────────────────────

function computeStatus(doc) {
  if (!doc.hasInstrument || !doc.nextMaintenanceDueAt) return "NOT_APPLICABLE";
  const now  = Date.now();
  const due  = new Date(doc.nextMaintenanceDueAt).getTime();
  const days = Math.floor((due - now) / 86_400_000);
  if (days < 0)   return "OVERDUE";
  if (days <= 30) return "DUE_SOON";
  return "ON_TIME";
}

// ── Legacy CRUD ───────────────────────────────────────────────────────────────

async function createInventory(input, ctx) {
  requireAuth(ctx);
  if (!input) throw new Error("Datos de inventario requeridos");
  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");
  return Inventory.create({ ...input, user: userId });
}

async function updateInventory(id, input, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de inventario requerido");
  if (!input) throw new Error("Datos de actualización requeridos");
  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");
  const exists = await Inventory.findById(id);
  if (!exists) throw new Error("Instrumento no encontrado");
  const { user: _u, ...safeInput } = input || {};
  const updated = await Inventory.findOneAndUpdate(
    { _id: id, user: userId },
    safeInput,
    { new: true, runValidators: true }
  );
  if (!updated) throw new Error("Instrumento no encontrado");
  return updated;
}

async function deleteInventory(id, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de inventario requerido");
  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");
  const deleted = await Inventory.findOneAndDelete({ _id: id, user: userId });
  if (!deleted) throw new Error("Instrumento no encontrado");
  return "Instrumento eliminado correctamente";
}

async function getInventory(id, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de inventario requerido");
  const inventory = await Inventory.findById(id);
  if (!inventory) throw new Error("Instrumento no encontrado");
  return inventory;
}

async function getInventories(ctx) {
  requireAuth(ctx);
  return Inventory.find({}).populate("user");
}

async function getInventoryByUser(ctx) {
  requireAuth(ctx);
  const userId = getUserIdFromCtx(ctx);
  if (!userId) throw new Error("No autenticado");
  return Inventory.find({ user: String(userId) });
}

// ── Paginated query ───────────────────────────────────────────────────────────

async function inventoriesPaginated(filter = {}, pagination = {}, ctx) {
  requireAdmin(ctx);

  const {
    page    = 1,
    limit   = 25,
    sortBy  = "createdAt",
    sortDir = "desc",
  } = pagination;

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const safePage  = Math.max(Number(page) || 1, 1);
  const skip      = (safePage - 1) * safeLimit;

  const allowedSort = ["createdAt", "brand", "instrumentType", "condition", "nextMaintenanceDueAt"];
  const sortField   = allowedSort.includes(sortBy) ? sortBy : "createdAt";
  const sort        = { [sortField]: sortDir === "asc" ? 1 : -1 };

  const mongoFilter = _buildFilter(filter);

  const [items, total, facets] = await Promise.all([
    Inventory.find(mongoFilter)
      .sort(sort)
      .skip(skip)
      .limit(safeLimit)
      .populate("user", "-password -resetPasswordToken -resetPasswordExpires")
      .lean(),
    Inventory.countDocuments(mongoFilter),
    _computeFacets(mongoFilter),
  ]);

  return { items, total, page: safePage, limit: safeLimit, facets };
}

function _buildFilter(filter = {}) {
  const { searchText, condition, status, userId } = filter;
  const mongoFilter = {};

  if (userId)    mongoFilter.user = userId;
  if (condition) mongoFilter.condition = condition; // tenencia — maps directly to condition field

  if (searchText) {
    const re = new RegExp(searchText.trim(), "i");
    mongoFilter.$or = [
      { brand: re },
      { model: re },
      { serie: re },
      { numberId: re },
      { instrumentType: re },
    ];
  }

  if (status) {
    const now  = new Date();
    const in30 = new Date(Date.now() + 30 * 86_400_000);
    switch (status) {
      case "NOT_APPLICABLE":
        mongoFilter.$or = [
          { hasInstrument: false },
          { nextMaintenanceDueAt: { $exists: false } },
          { nextMaintenanceDueAt: null },
        ];
        break;
      case "OVERDUE":
        mongoFilter.hasInstrument = { $ne: false };
        mongoFilter.nextMaintenanceDueAt = { $lt: now };
        break;
      case "DUE_SOON":
        mongoFilter.hasInstrument = { $ne: false };
        mongoFilter.nextMaintenanceDueAt = { $gte: now, $lte: in30 };
        break;
      case "ON_TIME":
        mongoFilter.hasInstrument = { $ne: false };
        mongoFilter.nextMaintenanceDueAt = { $gt: in30 };
        break;
    }
  }

  return mongoFilter;
}

async function _computeFacets(baseFilter) {
  const now  = new Date();
  const in30 = new Date(Date.now() + 30 * 86_400_000);

  const statusPipeline = [
    { $match: baseFilter },
    {
      $addFields: {
        _status: {
          $switch: {
            branches: [
              { case: { $eq: ["$hasInstrument", false] }, then: "NOT_APPLICABLE" },
              { case: { $eq: ["$nextMaintenanceDueAt", null] }, then: "NOT_APPLICABLE" },
              { case: { $lt: ["$nextMaintenanceDueAt", now] }, then: "OVERDUE" },
              { case: { $lte: ["$nextMaintenanceDueAt", in30] }, then: "DUE_SOON" },
            ],
            default: "ON_TIME",
          },
        },
      },
    },
    { $group: { _id: "$_status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ];

  const [statusAgg, conditionAgg, instrAgg] = await Promise.all([
    Inventory.aggregate(statusPipeline),
    // byCondition — groups by the condition (tenencia) field
    Inventory.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$condition", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Inventory.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$instrumentType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    byStatus:     statusAgg.map((b)    => ({ value: b._id || "NOT_APPLICABLE", count: b.count })),
    byCondition:  conditionAgg.map((b) => ({ value: b._id || "Sin tenencia",   count: b.count })),
    byInstrument: instrAgg.map((b)     => ({ value: b._id || "Sin instrumento", count: b.count })),
  };
}

// ── Stats summary ─────────────────────────────────────────────────────────────

async function inventoryStats(ctx) {
  requireAdmin(ctx);
  const now  = new Date();
  const in30 = new Date(Date.now() + 30 * 86_400_000);
  const naFilter = { $or: [{ hasInstrument: false }, { nextMaintenanceDueAt: null }] };
  const [total, overdue, dueSoon, notApplicable] = await Promise.all([
    Inventory.countDocuments({}),
    Inventory.countDocuments({ hasInstrument: { $ne: false }, nextMaintenanceDueAt: { $lt: now } }),
    Inventory.countDocuments({ hasInstrument: { $ne: false }, nextMaintenanceDueAt: { $gte: now, $lte: in30 } }),
    Inventory.countDocuments(naFilter),
  ]);
  return { total, onTime: Math.max(0, total - overdue - dueSoon - notApplicable), dueSoon, overdue, notApplicable };
}

// ── Assignment ────────────────────────────────────────────────────────────────

async function assignInventoryToUser(inventoryId, userId, ctx) {
  requireAdmin(ctx);

  const [inv, user] = await Promise.all([
    Inventory.findById(inventoryId),
    User.findById(userId),
  ]);
  if (!inv)  throw new Error("Instrumento no encontrado");
  if (!user) throw new Error("Usuario no encontrado");

  // Enforce 1-instrument-per-user rule
  const existingForUser = await Inventory.findOne({ user: userId, _id: { $ne: inventoryId } });
  if (existingForUser) {
    const desc = [existingForUser.brand, existingForUser.model].filter(Boolean).join(" ") || "instrumento";
    throw new Error(`Este usuario ya tiene asignado un instrumento: ${desc}. Desasígnelo primero.`);
  }

  return Inventory.findByIdAndUpdate(
    inventoryId,
    { user: userId },
    { new: true }
  ).populate("user", "-password -resetPasswordToken -resetPasswordExpires");
}

/**
 * Unassigning = DELETING the record.
 * Domain rule: Inventory records with user=null are invalid garbage.
 * Therefore, removing a user assignment means the record no longer has a purpose
 * and must be deleted. To reassign to a different user, use assignInventoryToUser.
 */
async function unassignInventory(inventoryId, ctx) {
  requireAdmin(ctx);
  const inv = await Inventory.findById(inventoryId);
  if (!inv) throw new Error("Instrumento no encontrado");
  await Inventory.findByIdAndDelete(inventoryId);
  // Also remove orphan maintenance records
  await InventoryMaintenance.deleteMany({ inventory: inventoryId });
  return "Instrumento eliminado del inventario correctamente";
}

// ── Admin cleanup ─────────────────────────────────────────────────────────────

async function adminCleanupInventories(dryRun = true, ctx) {
  requireAdmin(ctx);
  const nullUserFilter = { $or: [{ user: null }, { user: { $exists: false } }] };
  const count = await Inventory.countDocuments(nullUserFilter);

  if (dryRun) {
    return { count, deleted: 0, dryRun: true, message: `${count} registro(s) inválido(s) encontrado(s) (usuario nulo).` };
  }

  const inventoryIds = await Inventory.find(nullUserFilter).distinct("_id");
  const [result] = await Promise.all([
    Inventory.deleteMany(nullUserFilter),
    InventoryMaintenance.deleteMany({ inventory: { $in: inventoryIds } }),
  ]);

  return {
    count,
    deleted: result.deletedCount,
    dryRun: false,
    message: `${result.deletedCount} registro(s) inválido(s) eliminado(s).`,
  };
}

// ── Maintenance records ───────────────────────────────────────────────────────

async function getMaintenanceHistory(inventoryId, ctx) {
  requireAuth(ctx);
  if (!inventoryId) throw new Error("inventoryId requerido");
  return InventoryMaintenance.find({ inventory: inventoryId }).sort({ performedAt: -1 }).lean();
}

async function addMaintenanceRecord(inventoryId, input, ctx) {
  requireAdmin(ctx);
  const inv = await Inventory.findById(inventoryId);
  if (!inv) throw new Error("Instrumento no encontrado");

  const createdById   = getUserIdFromCtx(ctx);
  const performedDate = new Date(input.performedAt);
  const record = await InventoryMaintenance.create({
    inventory:   inventoryId,
    ...input,
    performedAt: performedDate,
    createdBy:   createdById,
  });

  const intervalDays = inv.maintenanceIntervalDays || 180;
  const nextDue      = new Date(performedDate.getTime() + intervalDays * 86_400_000);
  await Inventory.findByIdAndUpdate(inventoryId, {
    lastMaintenanceAt:    performedDate,
    nextMaintenanceDueAt: nextDue,
  });

  return record;
}

async function deleteMaintenanceRecord(id, ctx) {
  requireAdmin(ctx);
  const deleted = await InventoryMaintenance.findByIdAndDelete(id);
  if (!deleted) throw new Error("Registro de mantenimiento no encontrado");
  return "Registro eliminado correctamente";
}

module.exports = {
  requireAuth,
  createInventory,
  updateInventory,
  deleteInventory,
  getInventory,
  getInventories,
  getInventoryByUser,
  inventoriesPaginated,
  inventoryStats,
  assignInventoryToUser,
  unassignInventory,
  adminCleanupInventories,
  getMaintenanceHistory,
  addMaintenanceRecord,
  deleteMaintenanceRecord,
  computeStatus,
};
