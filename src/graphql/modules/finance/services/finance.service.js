/**
 * finance.service.js
 * Lógica de negocio + DB para el módulo finance.
 *
 * TIMEZONE DECISION:
 * businessDate se trata siempre como String "YYYY-MM-DD" (date-only).
 * Los filtros de rango hacen comparaciones lexicográficas (funciona correctamente
 * en ISO 8601). No se usa Date para businessDate — evita bugs de UTC midnight.
 */

const mongoose = require("mongoose");

const CashSession = require("../../../../../models/CashSession");
const Sale = require("../../../../../models/Sale");
const Expense = require("../../../../../models/Expense");
const Category = require("../../../../../models/Category");
const Activity = require("../../../../../models/Activity");
const Order = require("../../../../../models/Order");
const Product = require("../../../../../models/Product");

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  // if (!u) throw new Error("No autenticado");
  return u;
}

/** Valida y normaliza "YYYY-MM-DD". Lanza si inválido. */
function normalizeBusinessDate(value, field = "businessDate") {
  if (!value || typeof value !== "string")
    throw new Error(`${field} requerido (formato YYYY-MM-DD)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`${field} inválido — usar formato YYYY-MM-DD`);
  const d = new Date(value + "T12:00:00Z"); // noon UTC to avoid TZ boundary
  if (isNaN(d.getTime())) throw new Error(`${field} no es una fecha válida`);
  return value;
}

/** Requiere al menos uno de dos args (para cashSessionDetail). */
function requireOneOf(a, b, nameA, nameB) {
  if (!a && !b) throw new Error(`Se requiere ${nameA} o ${nameB}`);
}

function userId(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return u ? u._id || u.id : undefined;
}

// ─── Categories ─────────────────────────────────────────────────────────────

async function createCategory({ name, code }, ctx) {
  requireAuth(ctx);
  if (!name) throw new Error("name requerido");
  return Category.create({ name, code });
}

async function getCategories({ onlyActive } = {}, ctx) {
  requireAuth(ctx);
  const q = onlyActive === true ? { isActive: true } : {};
  return Category.find(q).sort({ name: 1 });
}

async function toggleCategoryActive(id, ctx) {
  requireAuth(ctx);
  const cat = await Category.findById(id);
  if (!cat) throw new Error("Categoría no existe");
  cat.isActive = !cat.isActive;
  return cat.save();
}

// ─── Activities ──────────────────────────────────────────────────────────────

async function createActivity({ name, code }, ctx) {
  requireAuth(ctx);
  if (!name) throw new Error("name requerido");
  return Activity.create({ name, code });
}

async function getActivities({ onlyActive } = {}, ctx) {
  requireAuth(ctx);
  const q = onlyActive === true ? { isActive: true } : {};
  return Activity.find(q).sort({ name: 1 });
}

async function toggleActivityActive(id, ctx) {
  requireAuth(ctx);
  const act = await Activity.findById(id);
  if (!act) throw new Error("Actividad no existe");
  act.isActive = !act.isActive;
  return act.save();
}

// ─── CashSession ─────────────────────────────────────────────────────────────

async function openCashSession({ businessDate, openingCash, notes }, ctx) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);

  const exists = await CashSession.findOne({ businessDate: bd });
  if (exists) {
    if (exists.status === "OPEN")
      throw new Error(`Ya existe una caja abierta para ${bd}`);
    throw new Error(
      `Ya existe una sesión cerrada para ${bd}. No se puede reabrir.`,
    );
  }

  return CashSession.create({
    businessDate: bd,
    openingCash: openingCash ?? 0,
    notes,
    createdBy: userId(ctx),
    openedAt: new Date(),
  });
}

async function closeCashSession(
  { businessDate, cashSessionId, countedCash, notes },
  ctx,
) {
  requireAuth(ctx);
  requireOneOf(businessDate, cashSessionId, "businessDate", "cashSessionId");

  if (countedCash === undefined || countedCash === null)
    throw new Error("countedCash requerido");

  const session = cashSessionId
    ? await CashSession.findById(cashSessionId)
    : await CashSession.findOne({
        businessDate: normalizeBusinessDate(businessDate),
      });

  if (!session) throw new Error("Sesión de caja no encontrada");
  if (session.status === "CLOSED") throw new Error("La sesión ya está cerrada");

  // Calcular totales esperados desde ventas y egresos del día
  const bd = session.businessDate;
  const [salesAgg, expenseAgg] = await Promise.all([
    Sale.aggregate([
      { $match: { businessDate: bd, status: "ACTIVE" } },
      { $group: { _id: "$paymentMethod", total: { $sum: "$total" } } },
    ]),
    Expense.aggregate([
      { $match: { businessDate: bd, status: "ACTIVE" } },
      { $group: { _id: "$paymentMethod", total: { $sum: "$amount" } } },
    ]),
  ]);

  const byMethod = { cash: 0, sinpe: 0, card: 0, other: 0 };
  for (const s of salesAgg)
    byMethod[s._id.toLowerCase()] =
      (byMethod[s._id.toLowerCase()] || 0) + s.total;
  for (const e of expenseAgg)
    byMethod[e._id.toLowerCase()] =
      (byMethod[e._id.toLowerCase()] || 0) - e.total;

  const expectedCash = byMethod.cash;
  const difference = countedCash - (expectedCash + (session.openingCash || 0));

  session.status = "CLOSED";
  session.closedAt = new Date();
  session.closedBy = userId(ctx);
  session.countedCash = countedCash;
  session.difference = difference;
  session.expectedTotalsByMethod = {
    cash: Math.max(0, byMethod.cash),
    sinpe: Math.max(0, byMethod.sinpe),
    card: Math.max(0, byMethod.card),
    other: Math.max(0, byMethod.other),
  };
  if (notes) session.notes = notes;

  return session.save();
}

async function getCashSessionDetail({ businessDate, cashSessionId }, ctx) {
  requireAuth(ctx);
  requireOneOf(businessDate, cashSessionId, "businessDate", "cashSessionId");

  if (cashSessionId) return CashSession.findById(cashSessionId);
  return CashSession.findOne({
    businessDate: normalizeBusinessDate(businessDate),
  });
}

async function getCashSessions({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  return CashSession.find({
    businessDate: {
      $gte: normalizeBusinessDate(dateFrom, "dateFrom"),
      $lte: normalizeBusinessDate(dateTo, "dateTo"),
    },
  }).sort({ businessDate: 1 });
}

// ─── Sales ───────────────────────────────────────────────────────────────────

async function recordSale(input, ctx) {
  requireAuth(ctx);
  const {
    businessDate,
    paymentMethod,
    source = "WALK_IN",
    total,
    lineItems = [],
    orderId,
    activityId,
    cashSessionId,
  } = input;

  const bd = normalizeBusinessDate(businessDate);
  if (!paymentMethod) throw new Error("paymentMethod requerido");

  // Validar sesión si se pasa
  if (cashSessionId) {
    const sess = await CashSession.findById(cashSessionId);
    if (!sess) throw new Error("cashSessionId no existe");
    if (sess.status !== "OPEN")
      throw new Error("La sesión de caja está cerrada");
  }

  // Validar order si se pasa
  if (orderId) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order no encontrada");
  }

  // Calcular lineItems y total
  let computedItems = [];
  let computedTotal = total;

  if (lineItems.length > 0) {
    computedItems = lineItems.map((li) => {
      if (!li.nameSnapshot)
        throw new Error("nameSnapshot requerido en cada item");
      if (li.quantity < 1) throw new Error("quantity debe ser >= 1");
      if (li.unitPriceSnapshot < 0)
        throw new Error("unitPriceSnapshot inválido");
      const subtotal = li.unitPriceSnapshot * li.quantity;
      return { ...li, subtotal };
    });
    const itemsTotal = computedItems.reduce((a, i) => a + i.subtotal, 0);
    // Si pasaron total explícito, lo respetamos; si no, lo derivamos de items
    computedTotal = total !== undefined && total !== null ? total : itemsTotal;
  }

  if (
    computedTotal === undefined ||
    computedTotal === null ||
    computedTotal <= 0
  )
    throw new Error("total inválido (debe ser > 0)");

  const sale = await Sale.create({
    businessDate: bd,
    cashSessionId: cashSessionId || undefined,
    activityId: activityId || undefined,
    orderId: orderId || undefined,
    paymentMethod,
    source: orderId ? "ORDER" : source,
    lineItems: computedItems,
    total: computedTotal,
    createdBy: userId(ctx),
  });

  return sale;
}

async function voidSale(saleId, reason, ctx) {
  requireAuth(ctx);
  if (!reason) throw new Error("reason requerido");
  const sale = await Sale.findById(saleId);
  if (!sale) throw new Error("Venta no encontrada");
  if (sale.status !== "ACTIVE")
    throw new Error("Solo se pueden anular ventas ACTIVE");

  sale.status = "VOIDED";
  sale.voidReason = reason;
  sale.voidedAt = new Date();
  sale.voidedBy = userId(ctx);
  return sale.save();
}

async function refundSale(saleId, reason, ctx) {
  requireAuth(ctx);
  if (!reason) throw new Error("reason requerido");
  const sale = await Sale.findById(saleId);
  if (!sale) throw new Error("Venta no encontrada");
  if (sale.status !== "ACTIVE")
    throw new Error("Solo se pueden reembolsar ventas ACTIVE");

  sale.status = "REFUNDED";
  sale.refundReason = reason;
  sale.voidedAt = new Date();
  sale.voidedBy = userId(ctx);
  return sale.save();
}

async function getSalesByDate(businessDate, ctx) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  return Sale.find({ businessDate: bd }).sort({ createdAt: -1 });
}

// ─── Expenses ────────────────────────────────────────────────────────────────

async function recordExpense(input, ctx) {
  requireAuth(ctx);
  const {
    businessDate,
    paymentMethod,
    concept,
    amount,
    categoryId,
    activityId,
    cashSessionId,
    detail,
    vendor,
    receiptUrl,
    isAssetPurchase = false,
    purpose,
  } = input;

  const bd = normalizeBusinessDate(businessDate);
  if (!concept) throw new Error("concept requerido");
  if (!amount || amount <= 0) throw new Error("amount inválido (debe ser > 0)");
  if (!paymentMethod) throw new Error("paymentMethod requerido");

  // Snapshot de categoría
  let categorySnapshot = undefined;
  if (categoryId) {
    const cat = await Category.findById(categoryId);
    if (!cat) throw new Error("categoryId no existe");
    categorySnapshot = cat.name;
  }

  if (cashSessionId) {
    const sess = await CashSession.findById(cashSessionId);
    if (!sess) throw new Error("cashSessionId no existe");
    if (sess.status !== "OPEN")
      throw new Error("La sesión de caja está cerrada");
  }

  return Expense.create({
    businessDate: bd,
    cashSessionId: cashSessionId || undefined,
    activityId: activityId || undefined,
    categoryId: categoryId || undefined,
    categorySnapshot,
    concept,
    detail,
    amount,
    paymentMethod,
    vendor,
    receiptUrl,
    isAssetPurchase,
    purpose,
    createdBy: userId(ctx),
  });
}

async function voidExpense(expenseId, reason, ctx) {
  requireAuth(ctx);
  if (!reason) throw new Error("reason requerido");
  const expense = await Expense.findById(expenseId);
  if (!expense) throw new Error("Egreso no encontrado");
  if (expense.status !== "ACTIVE")
    throw new Error("Solo se pueden anular egresos ACTIVE");

  expense.status = "VOIDED";
  expense.voidReason = reason;
  expense.voidedAt = new Date();
  expense.voidedBy = userId(ctx);
  return expense.save();
}

async function getExpensesByDate(businessDate, ctx) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  return Expense.find({ businessDate: bd }).sort({ createdAt: -1 });
}

// ─── Aggregations ────────────────────────────────────────────────────────────

/**
 * Pipelines reutilizables
 */

function salesTotalPipeline(matchExtra = {}) {
  return [
    { $match: { status: "ACTIVE", ...matchExtra } },
    {
      $group: {
        _id: null,
        total: { $sum: "$total" },
        count: { $sum: 1 },
      },
    },
  ];
}

function salesByMethodPipeline(matchExtra = {}) {
  return [
    { $match: { status: "ACTIVE", ...matchExtra } },
    {
      $group: {
        _id: "$paymentMethod",
        total: { $sum: "$total" },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, method: "$_id", total: 1, count: 1 } },
    { $sort: { total: -1 } },
  ];
}

function expensesByMethodPipeline(matchExtra = {}) {
  return [
    { $match: { status: "ACTIVE", ...matchExtra } },
    {
      $group: {
        _id: "$paymentMethod",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, method: "$_id", total: 1, count: 1 } },
    { $sort: { total: -1 } },
  ];
}

function productSalesPipeline(matchExtra = {}) {
  return [
    {
      $match: {
        status: "ACTIVE",
        "lineItems.0": { $exists: true },
        ...matchExtra,
      },
    },
    { $unwind: "$lineItems" },
    {
      $group: {
        _id: {
          productId: "$lineItems.productId",
          nameSnapshot: "$lineItems.nameSnapshot",
        },
        totalUnits: { $sum: "$lineItems.quantity" },
        totalRevenue: { $sum: "$lineItems.subtotal" },
      },
    },
    {
      $project: {
        _id: 0,
        productId: "$_id.productId",
        name: "$_id.nameSnapshot",
        totalUnits: 1,
        totalRevenue: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
  ];
}

function expensesByCategoryPipeline(matchExtra = {}) {
  return [
    { $match: { status: "ACTIVE", ...matchExtra } },
    {
      $group: {
        _id: {
          categoryId: "$categoryId",
          categorySnapshot: { $ifNull: ["$categorySnapshot", "Sin categoría"] },
        },
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        categoryId: "$_id.categoryId",
        categorySnapshot: "$_id.categorySnapshot",
        totalAmount: 1,
        count: 1,
      },
    },
    { $sort: { totalAmount: -1 } },
  ];
}

async function activitiesSummaryPipeline(dateMatch) {
  const [salesAgg, expensesAgg] = await Promise.all([
    Sale.aggregate([
      { $match: { status: "ACTIVE", activityId: { $ne: null }, ...dateMatch } },
      { $group: { _id: "$activityId", totalSales: { $sum: "$total" } } },
    ]),
    Expense.aggregate([
      { $match: { status: "ACTIVE", activityId: { $ne: null }, ...dateMatch } },
      { $group: { _id: "$activityId", totalExpenses: { $sum: "$amount" } } },
    ]),
  ]);

  const map = {};
  for (const s of salesAgg) {
    const id = String(s._id);
    if (!map[id])
      map[id] = { activityId: s._id, totalSales: 0, totalExpenses: 0 };
    map[id].totalSales = s.totalSales;
  }
  for (const e of expensesAgg) {
    const id = String(e._id);
    if (!map[id])
      map[id] = { activityId: e._id, totalSales: 0, totalExpenses: 0 };
    map[id].totalExpenses = e.totalExpenses;
  }

  // Enrich with activity names
  const activityIds = Object.values(map).map((m) => m.activityId);
  const activities = await Activity.find({ _id: { $in: activityIds } }).lean();
  const actMap = Object.fromEntries(
    activities.map((a) => [String(a._id), a.name]),
  );

  return Object.values(map).map((m) => ({
    activityId: m.activityId,
    name: actMap[String(m.activityId)] || null,
    totalSales: m.totalSales,
    totalExpenses: m.totalExpenses,
    net: m.totalSales - m.totalExpenses,
  }));
}

// ─── dailySummary ─────────────────────────────────────────────────────────────

async function getDailySummary(businessDate, ctx) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);

  const dateMatch = { businessDate: bd };

  const [
    salesTotalAgg,
    expTotalAgg,
    salesByMethod,
    expByMethod,
    productSales,
    expByCategory,
    session,
  ] = await Promise.all([
    Sale.aggregate(salesTotalPipeline(dateMatch)),
    Expense.aggregate([
      { $match: { status: "ACTIVE", ...dateMatch } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Sale.aggregate(salesByMethodPipeline(dateMatch)),
    Expense.aggregate(expensesByMethodPipeline(dateMatch)),
    Sale.aggregate(productSalesPipeline(dateMatch)),
    Expense.aggregate(expensesByCategoryPipeline(dateMatch)),
    CashSession.findOne({ businessDate: bd }),
  ]);

  const totalSales = salesTotalAgg[0]?.total || 0;
  const totalExpenses = expTotalAgg[0]?.total || 0;

  return {
    businessDate: bd,
    session: session || null,
    totalSales,
    totalExpenses,
    net: totalSales - totalExpenses,
    salesByMethod,
    expensesByMethod: expByMethod,
    productSales,
    expensesByCategory: expByCategory,
  };
}

// ─── rangeSummary ────────────────────────────────────────────────────────────

async function getRangeSummary({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  if (df > dt) throw new Error("dateFrom debe ser <= dateTo");

  const dateMatch = { businessDate: { $gte: df, $lte: dt } };

  const [
    salesTotalAgg,
    expTotalAgg,
    salesByMethod,
    expByMethod,
    productSales,
    expByCategory,
    activitiesSummary,
  ] = await Promise.all([
    Sale.aggregate(salesTotalPipeline(dateMatch)),
    Expense.aggregate([
      { $match: { status: "ACTIVE", ...dateMatch } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Sale.aggregate(salesByMethodPipeline(dateMatch)),
    Expense.aggregate(expensesByMethodPipeline(dateMatch)),
    Sale.aggregate(productSalesPipeline(dateMatch)),
    Expense.aggregate(expensesByCategoryPipeline(dateMatch)),
    activitiesSummaryPipeline(dateMatch),
  ]);

  const totalSales = salesTotalAgg[0]?.total || 0;
  const totalExpenses = expTotalAgg[0]?.total || 0;

  return {
    dateFrom: df,
    dateTo: dt,
    totalSales,
    totalExpenses,
    net: totalSales - totalExpenses,
    salesByMethod,
    expensesByMethod: expByMethod,
    productSales,
    expensesByCategory: expByCategory,
    activitiesSummary,
  };
}

// ─── productSalesReport ───────────────────────────────────────────────────────

async function getProductSalesReport({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  const dateMatch = { businessDate: { $gte: df, $lte: dt } };
  return Sale.aggregate(productSalesPipeline(dateMatch));
}

// ─── expenseReport ────────────────────────────────────────────────────────────

async function getExpenseReport({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  const dateMatch = { businessDate: { $gte: df, $lte: dt } };
  return Expense.aggregate(expensesByCategoryPipeline(dateMatch));
}

// ─── monthlyReportDataset ────────────────────────────────────────────────────

async function buildMonthlyReportDataset(month, year, ctx) {
  requireAuth(ctx);

  if (!month || month < 1 || month > 12)
    throw new Error("month inválido (1–12)");
  if (!year || year < 2020) throw new Error("year inválido");

  const pad = (n) => String(n).padStart(2, "0");
  const dateFrom = `${year}-${pad(month)}-01`;
  // Last day of month
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${pad(month)}-${pad(lastDay)}`;

  // Range summary
  const summary = await getRangeSummary({ dateFrom, dateTo }, ctx);

  // Daily breakdown (one summary per day that has activity)
  const datesWithActivity = await Promise.all([
    Sale.distinct("businessDate", {
      businessDate: { $gte: dateFrom, $lte: dateTo },
      status: "ACTIVE",
    }),
    Expense.distinct("businessDate", {
      businessDate: { $gte: dateFrom, $lte: dateTo },
      status: "ACTIVE",
    }),
  ]);
  const uniqueDates = [
    ...new Set([...datesWithActivity[0], ...datesWithActivity[1]]),
  ].sort();

  const dailyBreakdown = await Promise.all(
    uniqueDates.map((bd) => getDailySummary(bd, ctx)),
  );

  // Asset purchases for the period
  const assetPurchases = await Expense.find({
    businessDate: { $gte: dateFrom, $lte: dateTo },
    isAssetPurchase: true,
    status: "ACTIVE",
  }).sort({ businessDate: 1 });

  return {
    month,
    year,
    generatedAt: new Date().toISOString(),
    summary,
    dailyBreakdown,
    assetPurchases,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  requireAuth,

  // Categories
  createCategory,
  getCategories,
  toggleCategoryActive,

  // Activities
  createActivity,
  getActivities,
  toggleActivityActive,

  // CashSession
  openCashSession,
  closeCashSession,
  getCashSessionDetail,
  getCashSessions,

  // Sales
  recordSale,
  voidSale,
  refundSale,
  getSalesByDate,

  // Expenses
  recordExpense,
  voidExpense,
  getExpensesByDate,

  // Reports
  getDailySummary,
  getRangeSummary,
  getProductSalesReport,
  getExpenseReport,
  buildMonthlyReportDataset,
};
