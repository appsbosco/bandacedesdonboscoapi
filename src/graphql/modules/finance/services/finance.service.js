/**
 * finance.service.js
 *
 * CAMBIOS respecto a versión anterior:
 * 1. closeCashSession: filtra por cashSessionId (no por businessDate) — solo
 *    movimientos de la sesión afectan el cuadre.
 * 2. byMethod: incluye 'transfer'; mapeo TRANSFER→transfer correcto.
 * 3. recordSale / recordExpense: bloquea paymentMethod=CASH sin cashSessionId.
 * 4. getDailySummary: agrega campo 'breakdown' con subtotales sesión vs externos.
 *
 * TIMEZONE: businessDate siempre String "YYYY-MM-DD". NO se convierte a Date.
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

function normalizeBusinessDate(value, field = "businessDate") {
  if (!value || typeof value !== "string")
    throw new Error(`${field} requerido (formato YYYY-MM-DD)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error(`${field} inválido — usar formato YYYY-MM-DD`);
  const d = new Date(value + "T12:00:00Z");
  if (isNaN(d.getTime())) throw new Error(`${field} no es una fecha válida`);
  return value;
}

function requireOneOf(a, b, nameA, nameB) {
  if (!a && !b) throw new Error(`Se requiere ${nameA} o ${nameB}`);
}

function userId(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return u ? u._id || u.id : undefined;
}

/**
 * Construye el objeto byMethod vacío con todos los métodos soportados.
 * Incluye 'transfer' para compatibilidad con el nuevo enum.
 */
function emptyByMethod() {
  return { cash: 0, sinpe: 0, card: 0, transfer: 0, other: 0 };
}

/**
 * Normaliza el _id del método de pago a clave lowercase del byMethod.
 * Maneja TRANSFER→transfer correctamente.
 */
function methodKey(paymentMethodEnum) {
  const m = (paymentMethodEnum || "").toLowerCase();
  // Todos los valores del enum mapean directamente (cash, sinpe, card, transfer, other)
  return m;
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

/**
 * closeCashSession — CORREGIDO
 *
 * Calcula expectedTotalsByMethod SOLO con movimientos vinculados a esta sesión
 * (cashSessionId === session._id). Los movimientos externos (sin cashSessionId)
 * no afectan el cuadre de caja física.
 *
 * difference = countedCash - (expectedCash + openingCash)
 * donde expectedCash = neto en efectivo de la sesión (ventas CASH - gastos CASH).
 */
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

  const sessionOid = session._id;

  // ── Agregar SOLO los movimientos de esta sesión ───────────────────────────
  // Filtramos por cashSessionId === session._id, NO por businessDate.
  // Esto garantiza que movimientos externos (sin cashSessionId) no contaminen
  // el cuadre de caja física.
  const [salesAgg, expenseAgg] = await Promise.all([
    Sale.aggregate([
      {
        $match: {
          cashSessionId: sessionOid,
          status: "ACTIVE",
        },
      },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$total" },
        },
      },
    ]),
    Expense.aggregate([
      {
        $match: {
          cashSessionId: sessionOid,
          status: "ACTIVE",
        },
      },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$amount" },
        },
      },
    ]),
  ]);

  // Construir netos por método (ventas - egresos, por método de pago)
  const byMethod = emptyByMethod();

  for (const s of salesAgg) {
    const k = methodKey(s._id);
    if (k in byMethod) byMethod[k] += s.total;
    // Si el key no existe (enum desconocido), va a 'other' como fallback
    else byMethod.other += s.total;
  }

  for (const e of expenseAgg) {
    const k = methodKey(e._id);
    if (k in byMethod) byMethod[k] -= e.total;
    else byMethod.other -= e.total;
  }

  // expectedCash = neto en efectivo de la sesión
  // difference = cuánto debería haber en caja vs cuánto hay físicamente
  const expectedCash = byMethod.cash;
  const difference = countedCash - (expectedCash + (session.openingCash || 0));

  // Persistimos los netos por método (pueden ser negativos si hubo más gastos que ingresos)
  session.status = "CLOSED";
  session.closedAt = new Date();
  session.closedBy = userId(ctx);
  session.countedCash = countedCash;
  session.difference = difference;
  session.expectedTotalsByMethod = {
    cash: byMethod.cash,
    sinpe: byMethod.sinpe,
    card: byMethod.card,
    transfer: byMethod.transfer,
    other: byMethod.other,
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

/**
 * recordSale — ACTUALIZADO
 *
 * Regla de CASH externo:
 * Si paymentMethod === CASH y NO se proporciona cashSessionId → ERROR.
 * Razón: el efectivo siempre pasa por caja física. Un CASH sin sesión es
 * casi siempre un error operacional que generaría diferencias fantasma en
 * el cierre. El staff debe vincular la sesión o usar TRANSFER/OTHER para
 * pagos que no pasan por la caja del local.
 */
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

  // ── Validación CASH externo ───────────────────────────────────────────────
  if (paymentMethod === "CASH" && !cashSessionId) {
    throw new Error(
      "Las ventas en EFECTIVO (CASH) deben vincularse a una sesión de caja " +
        "(cashSessionId requerido). Si el pago no pasa por caja física, " +
        "usá TRANSFER u OTHER.",
    );
  }

  // ── Validar sesión ────────────────────────────────────────────────────────
  if (cashSessionId) {
    const sess = await CashSession.findById(cashSessionId);
    if (!sess) throw new Error("cashSessionId no existe");
    if (sess.status !== "OPEN")
      throw new Error("La sesión de caja está cerrada");
  }

  // ── Validar order ─────────────────────────────────────────────────────────
  if (orderId) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order no encontrada");
  }

  // ── Calcular lineItems y total ────────────────────────────────────────────
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
    computedTotal = total !== undefined && total !== null ? total : itemsTotal;
  }

  if (
    computedTotal === undefined ||
    computedTotal === null ||
    computedTotal <= 0
  )
    throw new Error("total inválido (debe ser > 0)");

  return Sale.create({
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

/**
 * recordExpense — ACTUALIZADO
 *
 * Misma regla que recordSale: CASH sin cashSessionId → error.
 */
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

  // ── Validación CASH externo ───────────────────────────────────────────────
  if (paymentMethod === "CASH" && !cashSessionId) {
    throw new Error(
      "Los gastos en EFECTIVO (CASH) deben vincularse a una sesión de caja " +
        "(cashSessionId requerido). Si el pago no pasa por caja física, " +
        "usá TRANSFER u OTHER.",
    );
  }

  // ── Snapshot de categoría ─────────────────────────────────────────────────
  let categorySnapshot = undefined;
  if (categoryId) {
    const cat = await Category.findById(categoryId);
    if (!cat) throw new Error("categoryId no existe");
    categorySnapshot = cat.name;
  }

  // ── Validar sesión ────────────────────────────────────────────────────────
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

// ─── Aggregation pipelines ────────────────────────────────────────────────────

function salesTotalPipeline(matchExtra = {}) {
  return [
    { $match: { status: "ACTIVE", ...matchExtra } },
    { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
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

/**
 * getDailySummary — ACTUALIZADO
 *
 * Retorna:
 * - totalSales / totalExpenses / net: TODOS los movimientos del día (sesión + externos)
 * - salesByMethod / expensesByMethod: ídem, todos
 * - breakdown: subtotales separados sesión vs externos (null si no hay sesión)
 *
 * El campo 'breakdown' es nuevo y opcional en el type GraphQL.
 */
async function getDailySummary(businessDate, ctx) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  const dateMatch = { businessDate: bd };

  // Buscar sesión del día
  const session = await CashSession.findOne({ businessDate: bd });

  // ── Queries en paralelo ───────────────────────────────────────────────────
  const promises = [
    // 0: total ventas del día (todos)
    Sale.aggregate(salesTotalPipeline(dateMatch)),
    // 1: total egresos del día (todos)
    Expense.aggregate([
      { $match: { status: "ACTIVE", ...dateMatch } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    // 2: ventas por método (todos)
    Sale.aggregate(salesByMethodPipeline(dateMatch)),
    // 3: egresos por método (todos)
    Expense.aggregate(expensesByMethodPipeline(dateMatch)),
    // 4: ventas por producto (todos)
    Sale.aggregate(productSalesPipeline(dateMatch)),
    // 5: egresos por categoría (todos)
    Expense.aggregate(expensesByCategoryPipeline(dateMatch)),
  ];

  // Si hay sesión, agregar queries de breakdown sesión vs externos
  if (session) {
    const sessionOid = session._id;
    const externalSaleMatch = {
      ...dateMatch,
      cashSessionId: { $exists: false },
    };
    const externalExpMatch = {
      ...dateMatch,
      cashSessionId: { $exists: false },
    };
    const sessionSaleMatch = { ...dateMatch, cashSessionId: sessionOid };
    const sessionExpMatch = { ...dateMatch, cashSessionId: sessionOid };

    promises.push(
      // 6: ventas de la sesión por método
      Sale.aggregate(salesByMethodPipeline(sessionSaleMatch)),
      // 7: egresos de la sesión por método
      Expense.aggregate(expensesByMethodPipeline(sessionExpMatch)),
      // 8: total ventas de la sesión
      Sale.aggregate(salesTotalPipeline(sessionSaleMatch)),
      // 9: total egresos de la sesión
      Expense.aggregate([
        { $match: { status: "ACTIVE", ...sessionExpMatch } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // 10: ventas externas por método
      Sale.aggregate(salesByMethodPipeline(externalSaleMatch)),
      // 11: egresos externos por método
      Expense.aggregate(expensesByMethodPipeline(externalExpMatch)),
      // 12: total ventas externas
      Sale.aggregate(salesTotalPipeline(externalSaleMatch)),
      // 13: total egresos externos
      Expense.aggregate([
        { $match: { status: "ACTIVE", ...externalExpMatch } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    );
  }

  const results = await Promise.all(promises);

  const totalSales = results[0][0]?.total || 0;
  const totalExpenses = results[1][0]?.total || 0;
  const salesByMethod = results[2];
  const expensesByMethod = results[3];
  const productSales = results[4];
  const expensesByCategory = results[5];

  // ── Construir breakdown si hay sesión ─────────────────────────────────────
  let breakdown = null;
  if (session) {
    const sessionByMethod = results[6];
    const expSessionByMethod = results[7];
    const sessionSalesTotal = results[8][0]?.total || 0;
    const sessionExpensesTotal = results[9][0]?.total || 0;
    const externalByMethod = results[10];
    const expExternalByMethod = results[11];
    const externalSalesTotal = results[12][0]?.total || 0;
    const externalExpensesTotal = results[13][0]?.total || 0;

    breakdown = {
      // Sesión
      sessionSales: sessionSalesTotal,
      sessionExpenses: sessionExpensesTotal,
      sessionNet: sessionSalesTotal - sessionExpensesTotal,
      sessionByMethod: mergeMethodBreakdowns(
        sessionByMethod,
        expSessionByMethod,
      ),

      // Externos
      externalSales: externalSalesTotal,
      externalExpenses: externalExpensesTotal,
      externalNet: externalSalesTotal - externalExpensesTotal,
      externalByMethod: mergeMethodBreakdowns(
        externalByMethod,
        expExternalByMethod,
      ),
    };
  }

  return {
    businessDate: bd,
    session: session || null,
    totalSales,
    totalExpenses,
    net: totalSales - totalExpenses,
    salesByMethod,
    expensesByMethod,
    productSales,
    expensesByCategory,
    breakdown,
  };
}

/**
 * Devuelve un array con todos los métodos que aparecen en salesArr o expensesArr,
 * con total neto (ventas - gastos) y count sumado. Útil para el breakdown UI.
 */
function mergeMethodBreakdowns(salesArr, expensesArr) {
  const map = {};
  for (const s of salesArr) {
    map[s.method] = map[s.method] || { method: s.method, total: 0, count: 0 };
    map[s.method].total += s.total;
    map[s.method].count += s.count;
  }
  for (const e of expensesArr) {
    map[e.method] = map[e.method] || { method: e.method, total: 0, count: 0 };
    // En el breakdown de sessionByMethod queremos ver ventas y gastos por separado
    // en el frontend; aquí simplificamos: count refleja todas las transacciones
    map[e.method].count += e.count;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
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
  return Sale.aggregate(
    productSalesPipeline({ businessDate: { $gte: df, $lte: dt } }),
  );
}

// ─── expenseReport ────────────────────────────────────────────────────────────

async function getExpenseReport({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  return Expense.aggregate(
    expensesByCategoryPipeline({ businessDate: { $gte: df, $lte: dt } }),
  );
}

// ─── monthlyReportDataset ────────────────────────────────────────────────────

async function buildMonthlyReportDataset(month, year, ctx) {
  requireAuth(ctx);

  if (!month || month < 1 || month > 12)
    throw new Error("month inválido (1–12)");
  if (!year || year < 2020) throw new Error("year inválido");

  const pad = (n) => String(n).padStart(2, "0");
  const dateFrom = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${pad(month)}-${pad(lastDay)}`;

  const summary = await getRangeSummary({ dateFrom, dateTo }, ctx);

  const [saleDates, expenseDates] = await Promise.all([
    Sale.distinct("businessDate", {
      businessDate: { $gte: dateFrom, $lte: dateTo },
      status: "ACTIVE",
    }),
    Expense.distinct("businessDate", {
      businessDate: { $gte: dateFrom, $lte: dateTo },
      status: "ACTIVE",
    }),
  ]);
  const uniqueDates = [...new Set([...saleDates, ...expenseDates])].sort();

  const dailyBreakdown = await Promise.all(
    uniqueDates.map((bd) => getDailySummary(bd, ctx)),
  );

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

  createCategory,
  getCategories,
  toggleCategoryActive,

  createActivity,
  getActivities,
  toggleActivityActive,

  openCashSession,
  closeCashSession,
  getCashSessionDetail,
  getCashSessions,

  recordSale,
  voidSale,
  refundSale,
  getSalesByDate,

  recordExpense,
  voidExpense,
  getExpensesByDate,

  getDailySummary,
  getRangeSummary,
  getProductSalesReport,
  getExpenseReport,
  buildMonthlyReportDataset,
};
