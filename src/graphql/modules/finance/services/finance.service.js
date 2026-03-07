/**
 * finance.service.js — v2
 *
 * Cambios respecto a v1:
 * 1. Multi-caja: openCashSession acepta cashBoxId; unique por {cashBoxId, businessDate}
 * 2. Banco: recordBankEntry, voidBankEntry, transferCashToBank, transferBankToCash
 * 3. Inventario: WAC costeo, recordInventoryConsumption, recordDonationInKind, shrinkage
 * 4. Expense: soporta expenseType, inventoryItemId (genera InventoryMovement automáticamente)
 * 5. Donaciones monetarias en Sale (donationType: MONETARY)
 * 6. Reportes ampliados: dailySummary, rangeSummary, monthlyReportDataset, activityPnL,
 *    cashSessionReport, bankReport, inventoryRangeReport
 *
 * TIMEZONE: businessDate siempre String "YYYY-MM-DD". NO se convierte a Date.
 * COSTEO: WAC (Weighted Average Cost) calculado al momento del consumo.
 * TRANSACCIONES: operaciones multi-colección usan mongoose session/transaction.
 */

const mongoose = require("mongoose");

const CashSession = require("../../../../../models/CashSession");
const CashBox = require("../../../../../models/CashBox");
const Sale = require("../../../../../models/Sale");
const Expense = require("../../../../../models/Expense");
const Category = require("../../../../../models/Category");
const Activity = require("../../../../../models/Activity");
const FinanceAccount = require("../../../../../models/FinanceAccount");
const BankEntry = require("../../../../../models/BankEntry");
const InventoryItem = require("../../../../../models/InventoryItem");
const InventoryMovement = require("../../../../../models/InventoryMovement");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  if (!u) throw new Error("No autenticado");
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

function emptyByMethod() {
  return { cash: 0, sinpe: 0, card: 0, transfer: 0, other: 0 };
}

function methodKey(paymentMethodEnum) {
  return (paymentMethodEnum || "").toLowerCase();
}

// ─── Categories ──────────────────────────────────────────────────────────────

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

// ─── Activities ───────────────────────────────────────────────────────────────

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

// ─── CashBox ──────────────────────────────────────────────────────────────────

async function createCashBox(
  { name, code, description, isDefault = false },
  ctx,
) {
  requireAuth(ctx);
  if (!name) throw new Error("name requerido");
  // Si se marca como default, desmarcar los demás
  if (isDefault) {
    await CashBox.updateMany({ isDefault: true }, { isDefault: false });
  }
  return CashBox.create({
    name,
    code,
    description,
    isDefault,
    createdBy: userId(ctx),
  });
}

async function getCashBoxes({ onlyActive } = {}, ctx) {
  requireAuth(ctx);
  const q = onlyActive === true ? { isActive: true } : {};
  return CashBox.find(q).sort({ name: 1 });
}

async function toggleCashBoxActive(id, ctx) {
  requireAuth(ctx);
  const box = await CashBox.findById(id);
  if (!box) throw new Error("CashBox no existe");
  box.isActive = !box.isActive;
  return box.save();
}

// ─── FinanceAccount ───────────────────────────────────────────────────────────

async function createFinanceAccount(input, ctx) {
  requireAuth(ctx);
  const {
    name,
    code,
    type,
    cashBoxId,
    bankName,
    accountNumber,
    currency = "CRC",
    openingBalance = 0,
    openingBalanceDate,
    notes,
  } = input;
  if (!name) throw new Error("name requerido");
  if (!type) throw new Error("type requerido");
  if (type === "CASH_BOX" && !cashBoxId)
    throw new Error("cashBoxId requerido para tipo CASH_BOX");
  return FinanceAccount.create({
    name,
    code,
    type,
    cashBoxId: cashBoxId || undefined,
    bankName,
    accountNumber,
    currency,
    openingBalance,
    openingBalanceDate,
    notes,
    createdBy: userId(ctx),
  });
}

async function getFinanceAccounts({ onlyActive, type } = {}, ctx) {
  requireAuth(ctx);
  const q = {};
  if (onlyActive === true) q.isActive = true;
  if (type) q.type = type;
  return FinanceAccount.find(q).sort({ name: 1 });
}

async function toggleFinanceAccountActive(id, ctx) {
  requireAuth(ctx);
  const acc = await FinanceAccount.findById(id);
  if (!acc) throw new Error("FinanceAccount no existe");
  acc.isActive = !acc.isActive;
  return acc.save();
}

// ─── CashSession ──────────────────────────────────────────────────────────────

/**
 * openCashSession — v2
 *
 * Acepta cashBoxId opcional. Si se provee, valida que no exista ya una sesión
 * abierta para esa caja en ese día. Si no se provee, comportamiento legacy
 * (caja null, un único slot por businessDate cuando cashBoxId=null).
 */
async function openCashSession(
  { businessDate, cashBoxId, openingCash, notes },
  ctx,
) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);

  // Resolver caja: si se da cashBoxId, validar que exista y esté activa
  let cashBox = null;
  if (cashBoxId) {
    cashBox = await CashBox.findById(cashBoxId);
    if (!cashBox) throw new Error("CashBox no existe");
    if (!cashBox.isActive) throw new Error("CashBox está inactiva");
  }

  // Buscar sesión existente para {cashBoxId, businessDate}
  const existsQuery = cashBoxId
    ? { cashBoxId, businessDate: bd }
    : { cashBoxId: null, businessDate: bd };

  const exists = await CashSession.findOne(existsQuery);
  if (exists) {
    const boxName = cashBox ? ` (${cashBox.name})` : "";
    if (exists.status === "OPEN")
      throw new Error(`Ya existe una caja abierta para ${bd}${boxName}`);
    throw new Error(
      `Ya existe una sesión cerrada para ${bd}${boxName}. No se puede reabrir.`,
    );
  }

  return CashSession.create({
    businessDate: bd,
    cashBoxId: cashBoxId || null,
    cashBoxSnapshot: cashBox ? cashBox.name : null,
    openingCash: openingCash ?? 0,
    notes,
    createdBy: userId(ctx),
    openedAt: new Date(),
  });
}

/**
 * closeCashSession — v2
 *
 * Lógica core sin cambios: filtra por cashSessionId específico.
 * Los movimientos externos NO afectan el cuadre.
 */
async function closeCashSession(
  { businessDate, cashSessionId, countedCash, notes },
  ctx,
) {
  requireAuth(ctx);
  requireOneOf(businessDate, cashSessionId, "businessDate", "cashSessionId");
  if (countedCash === undefined || countedCash === null)
    throw new Error("countedCash requerido");

  let session;
  if (cashSessionId) {
    session = await CashSession.findById(cashSessionId);
  } else {
    // Legacy: busca la primera sesión del día (puede haber varias con multi-caja)
    // Si hay múltiples, se recomienda usar cashSessionId explícito
    const bd = normalizeBusinessDate(businessDate);
    const sessions = await CashSession.find({
      businessDate: bd,
      status: "OPEN",
    });
    if (sessions.length > 1) {
      throw new Error(
        `Hay ${sessions.length} sesiones abiertas el ${bd}. Use cashSessionId para especificar cuál cerrar.`,
      );
    }
    session = sessions[0] || (await CashSession.findOne({ businessDate: bd }));
  }

  if (!session) throw new Error("Sesión de caja no encontrada");
  if (session.status === "CLOSED") throw new Error("La sesión ya está cerrada");

  const sessionOid = session._id;

  const [salesAgg, expenseAgg] = await Promise.all([
    Sale.aggregate([
      { $match: { cashSessionId: sessionOid, status: "ACTIVE" } },
      { $group: { _id: "$paymentMethod", total: { $sum: "$total" } } },
    ]),
    Expense.aggregate([
      {
        $match: {
          cashSessionId: sessionOid,
          status: "ACTIVE",
          // TRANSFER_OUT no es un gasto real, pero sí mueve efectivo fuera de la caja
          // Se incluye en el cuadre porque el dinero salió físicamente
        },
      },
      { $group: { _id: "$paymentMethod", total: { $sum: "$amount" } } },
    ]),
  ]);

  const byMethod = emptyByMethod();

  for (const s of salesAgg) {
    const k = methodKey(s._id);
    if (k in byMethod) byMethod[k] += s.total;
    else byMethod.other += s.total;
  }
  for (const e of expenseAgg) {
    const k = methodKey(e._id);
    if (k in byMethod) byMethod[k] -= e.total;
    else byMethod.other -= e.total;
  }

  const expectedCash = byMethod.cash;
  const difference = countedCash - (expectedCash + (session.openingCash || 0));

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
  // Legacy: devuelve la primera sesión del día
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
  }).sort({ businessDate: 1, cashBoxSnapshot: 1 });
}

async function getCashSessionsByDate(businessDate, ctx) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  return CashSession.find({ businessDate: bd }).sort({ openedAt: 1 });
}

// ─── Sales ────────────────────────────────────────────────────────────────────

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
    donationType,
    donorName,
  } = input;

  const bd = normalizeBusinessDate(businessDate);
  if (!paymentMethod) throw new Error("paymentMethod requerido");

  const resolvedScope = input.scope ?? (cashSessionId ? "SESSION" : "EXTERNAL");
  let resolvedSessionId;

  if (resolvedScope === "EXTERNAL") {
    resolvedSessionId = undefined;
  } else {
    if (!cashSessionId)
      throw new Error("Ventas SESSION requieren cashSessionId.");
    const sess = await CashSession.findById(cashSessionId);
    if (!sess) throw new Error("cashSessionId no existe");
    if (sess.status !== "OPEN")
      throw new Error("La sesión de caja está cerrada");
    if (sess.businessDate !== bd)
      throw new Error(
        `businessDate (${bd}) no coincide con la sesión (${sess.businessDate})`,
      );
    resolvedSessionId = sess._id;
  }

  let computedItems = [];
  let computedTotal = total;

  if (lineItems.length > 0) {
    computedItems = lineItems.map((li) => {
      if (!li.nameSnapshot)
        throw new Error("nameSnapshot requerido en cada item");
      if (li.quantity < 1) throw new Error("quantity debe ser >= 1");
      if (li.unitPriceSnapshot < 0)
        throw new Error("unitPriceSnapshot inválido");
      return { ...li, subtotal: li.unitPriceSnapshot * li.quantity };
    });
    const itemsTotal = computedItems.reduce((a, i) => a + i.subtotal, 0);
    computedTotal = total !== undefined && total !== null ? total : itemsTotal;
  }

  if (!computedTotal || computedTotal <= 0)
    throw new Error("total inválido (debe ser > 0)");

  // Determinar source
  let resolvedSource = source;
  if (donationType === "MONETARY") resolvedSource = "DONATION";
  else if (orderId) resolvedSource = "ORDER";

  return Sale.create({
    businessDate: bd,
    cashSessionId: resolvedSessionId,
    scope: resolvedScope,
    activityId: activityId || undefined,
    orderId: orderId || undefined,
    paymentMethod,
    source: resolvedSource,
    donationType: donationType || null,
    donorName: donorName || undefined,
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
  return Sale.find({ businessDate: normalizeBusinessDate(businessDate) }).sort({
    createdAt: -1,
  });
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

/**
 * recordExpense — v2
 *
 * Si expenseType === "INVENTORY_PURCHASE", crea también un InventoryMovement de tipo PURCHASE.
 * Si expenseType === "ASSET_PURCHASE", establece isAssetPurchase=true (compatibilidad).
 * Usa transacción MongoDB cuando hay operación de inventario.
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
    assetDescription,
    purpose,
    expenseType: rawExpenseType,
    inventoryItemId,
    inventoryQuantity,
    inventoryUnitCost,
  } = input;

  const bd = normalizeBusinessDate(businessDate);
  if (!concept) throw new Error("concept requerido");
  if (!amount || amount <= 0) throw new Error("amount inválido (debe ser > 0)");
  if (!paymentMethod) throw new Error("paymentMethod requerido");

  // Inferir expenseType
  let expenseType = rawExpenseType || "REGULAR";
  if (isAssetPurchase && expenseType === "REGULAR")
    expenseType = "ASSET_PURCHASE";
  if (inventoryItemId && expenseType === "REGULAR")
    expenseType = "INVENTORY_PURCHASE";

  // Validar inventario si aplica
  if (expenseType === "INVENTORY_PURCHASE") {
    if (!inventoryItemId)
      throw new Error("inventoryItemId requerido para INVENTORY_PURCHASE");
    if (!inventoryQuantity || inventoryQuantity <= 0)
      throw new Error("inventoryQuantity requerido y > 0");
    const item = await InventoryItem.findById(inventoryItemId);
    if (!item) throw new Error("InventoryItem no existe");
  }

  const resolvedScope = input.scope ?? (cashSessionId ? "SESSION" : "EXTERNAL");
  let resolvedSessionId;

  if (resolvedScope === "EXTERNAL") {
    resolvedSessionId = undefined;
  } else {
    if (!cashSessionId)
      throw new Error("Gastos SESSION requieren cashSessionId.");
    const sess = await CashSession.findById(cashSessionId);
    if (!sess) throw new Error("cashSessionId no existe");
    if (sess.status !== "OPEN")
      throw new Error("La sesión de caja está cerrada");
    if (sess.businessDate !== bd)
      throw new Error(
        `businessDate (${bd}) no coincide con la sesión (${sess.businessDate})`,
      );
    resolvedSessionId = sess._id;
  }

  let categorySnapshot;
  if (categoryId) {
    const cat = await Category.findById(categoryId).select("name").lean();
    if (!cat) throw new Error("Categoría no existe");
    categorySnapshot = cat.name;
  }

  const expenseData = {
    businessDate: bd,
    cashSessionId: resolvedSessionId,
    scope: resolvedScope,
    activityId: activityId || undefined,
    categoryId: categoryId || undefined,
    categorySnapshot,
    concept,
    detail,
    amount,
    paymentMethod,
    expenseType,
    isAssetPurchase: expenseType === "ASSET_PURCHASE",
    assetDescription,
    purpose,
    vendor,
    receiptUrl,
    inventoryItemId: inventoryItemId || undefined,
    inventoryQuantity: inventoryQuantity || undefined,
    inventoryUnitCost:
      inventoryUnitCost !== undefined
        ? inventoryUnitCost
        : amount / (inventoryQuantity || 1),
    createdBy: userId(ctx),
  };

  // Si es compra de inventario, usamos transacción para crear ambos documentos
  if (expenseType === "INVENTORY_PURCHASE" && inventoryItemId) {
    const mongoSession = await mongoose.startSession();
    let expense;
    try {
      await mongoSession.withTransaction(async () => {
        const [createdExpense] = await Expense.create([expenseData], {
          session: mongoSession,
        });
        expense = createdExpense;

        const unitCost = expenseData.inventoryUnitCost;
        const totalCost = unitCost * inventoryQuantity;

        await InventoryMovement.create(
          [
            {
              businessDate: bd,
              itemId: inventoryItemId,
              type: "PURCHASE",
              quantity: inventoryQuantity,
              unitCostSnapshot: unitCost,
              totalCostSnapshot: totalCost,
              concept: concept,
              detail,
              activityId: activityId || undefined,
              expenseId: createdExpense._id,
              cashSessionId: resolvedSessionId,
              vendor,
              createdBy: userId(ctx),
            },
          ],
          { session: mongoSession },
        );
      });
    } finally {
      await mongoSession.endSession();
    }
    return expense;
  }

  return Expense.create(expenseData);
}

async function voidExpense(expenseId, reason, ctx) {
  requireAuth(ctx);
  if (!reason) throw new Error("reason requerido");
  const expense = await Expense.findById(expenseId);
  if (!expense) throw new Error("Egreso no encontrado");
  if (expense.status !== "ACTIVE")
    throw new Error("Solo se pueden anular egresos ACTIVE");

  // Si el gasto tenía un InventoryMovement asociado, anularlo también
  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      expense.status = "VOIDED";
      expense.voidReason = reason;
      expense.voidedAt = new Date();
      expense.voidedBy = userId(ctx);
      await expense.save({ session: mongoSession });

      if (expense.expenseType === "INVENTORY_PURCHASE") {
        await InventoryMovement.updateMany(
          { expenseId: expense._id, status: "ACTIVE" },
          {
            status: "VOIDED",
            voidReason: `Anulado junto con egreso ${expenseId}: ${reason}`,
            voidedAt: new Date(),
            voidedBy: userId(ctx),
          },
          { session: mongoSession },
        );
      }
    });
  } finally {
    await mongoSession.endSession();
  }
  return expense;
}

async function getExpensesByDate(businessDate, ctx) {
  requireAuth(ctx);

  const bd = normalizeBusinessDate(businessDate);
  const expenses = await Expense.find({ businessDate: bd }).sort({
    createdAt: -1,
  });

  return Array.isArray(expenses) ? expenses : [];
}
// ─── Banco ────────────────────────────────────────────────────────────────────

async function recordBankEntry(input, ctx) {
  requireAuth(ctx);
  const {
    businessDate,
    accountId,
    type,
    direction,
    amount,
    concept,
    detail,
    reference,
    activityId,
    expenseId,
    saleId,
  } = input;
  const bd = normalizeBusinessDate(businessDate);
  if (!amount || amount <= 0) throw new Error("amount inválido");
  if (!concept) throw new Error("concept requerido");
  const account = await FinanceAccount.findById(accountId);
  if (!account) throw new Error("FinanceAccount no existe");
  if (account.type !== "BANK")
    throw new Error(
      "Solo se puede registrar movimientos en cuentas de tipo BANK",
    );
  if (!account.isActive) throw new Error("Cuenta bancaria inactiva");

  return BankEntry.create({
    businessDate: bd,
    accountId,
    type,
    direction,
    amount,
    concept,
    detail,
    reference,
    activityId: activityId || undefined,
    expenseId: expenseId || undefined,
    saleId: saleId || undefined,
    createdBy: userId(ctx),
  });
}

async function voidBankEntry(entryId, reason, ctx) {
  requireAuth(ctx);
  if (!reason) throw new Error("reason requerido");
  const entry = await BankEntry.findById(entryId);
  if (!entry) throw new Error("BankEntry no encontrado");
  if (entry.status !== "ACTIVE")
    throw new Error("Solo se pueden anular entradas ACTIVE");
  entry.status = "VOIDED";
  entry.voidReason = reason;
  entry.voidedAt = new Date();
  entry.voidedBy = userId(ctx);
  return entry.save();
}

/**
 * transferCashToBank — v2
 *
 * Crea:
 * 1. Expense { expenseType: TRANSFER_OUT, scope: SESSION, paymentMethod: CASH }
 * 2. BankEntry { type: DEPOSIT, direction: CREDIT }
 * Con transferPairId cruzado entre ambos para que los reportes los excluyan del
 * doble conteo (no es un gasto real ni un ingreso real; es movimiento interno).
 */
async function transferCashToBank(
  { cashSessionId, accountId, amount, concept, businessDate },
  ctx,
) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  if (!amount || amount <= 0) throw new Error("amount inválido");

  const sess = await CashSession.findById(cashSessionId);
  if (!sess) throw new Error("CashSession no existe");
  if (sess.status !== "OPEN")
    throw new Error("La sesión de caja debe estar OPEN");

  const account = await FinanceAccount.findById(accountId);
  if (!account) throw new Error("FinanceAccount no existe");
  if (account.type !== "BANK")
    throw new Error("La cuenta destino debe ser de tipo BANK");

  const transferConcept =
    concept || `Depósito a banco desde caja ${sess.cashBoxSnapshot || ""}`;

  const mongoSession = await mongoose.startSession();
  let expense, bankEntry;
  try {
    await mongoSession.withTransaction(async () => {
      [expense] = await Expense.create(
        [
          {
            businessDate: bd,
            cashSessionId: sess._id,
            scope: "SESSION",
            paymentMethod: "CASH",
            concept: transferConcept,
            amount,
            expenseType: "TRANSFER_OUT",
            isAssetPurchase: false,
            status: "ACTIVE",
            createdBy: userId(ctx),
          },
        ],
        { session: mongoSession },
      );

      [bankEntry] = await BankEntry.create(
        [
          {
            businessDate: bd,
            accountId,
            type: "DEPOSIT",
            direction: "CREDIT",
            amount,
            concept: transferConcept,
            transferPairId: expense._id,
            transferPairCollection: "Expense",
            status: "ACTIVE",
            createdBy: userId(ctx),
          },
        ],
        { session: mongoSession },
      );

      // Registrar el transferPairId en el expense
      expense.transferPairId = bankEntry._id;
      expense.transferPairCollection = "BankEntry";
      await expense.save({ session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }

  return { expense, bankEntry, sale: null };
}

/**
 * transferBankToCash — v2
 *
 * Crea:
 * 1. BankEntry { type: WITHDRAWAL, direction: DEBIT }
 * 2. Sale { scope: SESSION, source: BANK_INCOME, paymentMethod: CASH }
 *    (Representa entrada de efectivo a la caja desde banco)
 */
async function transferBankToCash(
  { accountId, cashSessionId, amount, concept, businessDate },
  ctx,
) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  if (!amount || amount <= 0) throw new Error("amount inválido");

  const account = await FinanceAccount.findById(accountId);
  if (!account) throw new Error("FinanceAccount no existe");
  if (account.type !== "BANK")
    throw new Error("La cuenta origen debe ser de tipo BANK");

  const sess = await CashSession.findById(cashSessionId);
  if (!sess) throw new Error("CashSession no existe");
  if (sess.status !== "OPEN")
    throw new Error("La sesión de caja debe estar OPEN");

  const transferConcept =
    concept || `Retiro de banco a caja ${sess.cashBoxSnapshot || ""}`;

  const mongoSession = await mongoose.startSession();
  let sale, bankEntry;
  try {
    await mongoSession.withTransaction(async () => {
      [sale] = await Sale.create(
        [
          {
            businessDate: bd,
            cashSessionId: sess._id,
            scope: "SESSION",
            paymentMethod: "CASH",
            source: "BANK_INCOME",
            total: amount,
            concept: transferConcept,
            status: "ACTIVE",
            createdBy: userId(ctx),
          },
        ],
        { session: mongoSession },
      );

      [bankEntry] = await BankEntry.create(
        [
          {
            businessDate: bd,
            accountId,
            type: "WITHDRAWAL",
            direction: "DEBIT",
            amount,
            concept: transferConcept,
            transferPairId: sale._id,
            transferPairCollection: "Sale",
            status: "ACTIVE",
            createdBy: userId(ctx),
          },
        ],
        { session: mongoSession },
      );

      sale.transferPairId = bankEntry._id;
      sale.transferPairCollection = "BankEntry";
      await sale.save({ session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }

  return { sale, bankEntry, expense: null };
}

// ─── Inventario ───────────────────────────────────────────────────────────────

async function createInventoryItem(input, ctx) {
  requireAuth(ctx);
  const {
    name,
    code,
    description,
    unit = "unidad",
    productId,
    minStockAlert = 0,
  } = input;
  if (!name) throw new Error("name requerido");
  return InventoryItem.create({
    name,
    code,
    description,
    unit,
    productId,
    minStockAlert,
    createdBy: userId(ctx),
  });
}

async function getInventoryItems({ onlyActive } = {}, ctx) {
  requireAuth(ctx);
  const q = onlyActive === true ? { isActive: true } : {};
  return InventoryItem.find(q).sort({ name: 1 });
}

async function toggleInventoryItemActive(id, ctx) {
  requireAuth(ctx);
  const item = await InventoryItem.findById(id);
  if (!item) throw new Error("InventoryItem no existe");
  item.isActive = !item.isActive;
  return item.save();
}

/**
 * calculateWAC — Costo promedio ponderado de un ítem basado en compras ACTIVAS.
 *
 * Considera solo movimientos PURCHASE y DONATION_IN_KIND activos para el cálculo.
 * Los consumos previos ya redujeron el stock pero no cambian el WAC histórico
 * (simplificación adecuada para este nivel de operación).
 */
async function calculateWAC(itemId) {
  const agg = await InventoryMovement.aggregate([
    {
      $match: {
        itemId: new mongoose.Types.ObjectId(String(itemId)),
        type: { $in: ["PURCHASE", "DONATION_IN_KIND"] },
        status: "ACTIVE",
      },
    },
    {
      $group: {
        _id: null,
        totalQty: { $sum: "$quantity" },
        totalCost: { $sum: "$totalCostSnapshot" },
      },
    },
  ]);
  if (!agg.length || agg[0].totalQty === 0) return 0;
  return agg[0].totalCost / agg[0].totalQty;
}

/**
 * calculateCurrentStock — Stock actual de un ítem.
 * Entradas: PURCHASE, DONATION_IN_KIND, ADJUSTMENT_IN
 * Salidas: CONSUMPTION, ADJUSTMENT_OUT, SHRINKAGE, SALE_OUT
 */
async function calculateCurrentStock(itemId) {
  const agg = await InventoryMovement.aggregate([
    {
      $match: {
        itemId: new mongoose.Types.ObjectId(String(itemId)),
        status: "ACTIVE",
      },
    },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$quantity" },
      },
    },
  ]);

  const INBOUND = new Set(["PURCHASE", "DONATION_IN_KIND", "ADJUSTMENT_IN"]);
  const OUTBOUND = new Set([
    "CONSUMPTION",
    "ADJUSTMENT_OUT",
    "SHRINKAGE",
    "SALE_OUT",
  ]);

  let stock = 0;
  for (const row of agg) {
    if (INBOUND.has(row._id)) stock += row.total;
    if (OUTBOUND.has(row._id)) stock -= row.total;
  }
  return stock;
}

/**
 * recordInventoryConsumption — v2
 *
 * Registra el consumo de inventario por una actividad.
 * Calcula el WAC automáticamente al momento del consumo y lo fija en
 * `unitCostSnapshot` / `totalCostSnapshot`.
 */
async function recordInventoryConsumption(input, ctx) {
  requireAuth(ctx);
  const {
    businessDate,
    itemId,
    quantity,
    activityId,
    concept,
    detail,
    cashSessionId,
  } = input;
  const bd = normalizeBusinessDate(businessDate);
  if (!quantity || quantity <= 0)
    throw new Error("quantity inválido (debe ser > 0)");

  const item = await InventoryItem.findById(itemId);
  if (!item) throw new Error("InventoryItem no existe");

  // Validar stock disponible
  const currentStock = await calculateCurrentStock(itemId);
  if (currentStock < quantity) {
    throw new Error(
      `Stock insuficiente para ${item.name}: disponible ${currentStock.toFixed(2)}, solicitado ${quantity}`,
    );
  }

  // Calcular WAC al momento del consumo
  const wac = await calculateWAC(itemId);
  const totalCost = wac * quantity;

  let resolvedSessionId;
  if (cashSessionId) {
    const sess = await CashSession.findById(cashSessionId);
    if (!sess) throw new Error("cashSessionId no existe");
    resolvedSessionId = sess._id;
  }

  return InventoryMovement.create({
    businessDate: bd,
    itemId,
    type: "CONSUMPTION",
    quantity,
    unitCostSnapshot: wac,
    totalCostSnapshot: totalCost,
    concept: concept || `Consumo de ${item.name}`,
    detail,
    activityId: activityId || undefined,
    cashSessionId: resolvedSessionId,
    createdBy: userId(ctx),
  });
}

/**
 * recordDonationInKind — v2
 *
 * Registra entrada de stock sin salida de dinero.
 * `estimatedValue` es la valoración del ítem donado (opcional, para reportes).
 */
async function recordDonationInKind(input, ctx) {
  requireAuth(ctx);
  const {
    businessDate,
    itemId,
    quantity,
    estimatedValue,
    donorName,
    activityId,
    concept,
    detail,
  } = input;
  const bd = normalizeBusinessDate(businessDate);
  if (!quantity || quantity <= 0) throw new Error("quantity inválido");

  const item = await InventoryItem.findById(itemId);
  if (!item) throw new Error("InventoryItem no existe");

  const unitEstimate = estimatedValue ? estimatedValue / quantity : 0;

  return InventoryMovement.create({
    businessDate: bd,
    itemId,
    type: "DONATION_IN_KIND",
    quantity,
    unitCostSnapshot: unitEstimate,
    totalCostSnapshot: estimatedValue || 0,
    estimatedValue: estimatedValue || 0,
    concept:
      concept ||
      `Donación en especie: ${item.name}${donorName ? ` de ${donorName}` : ""}`,
    detail,
    activityId: activityId || undefined,
    createdBy: userId(ctx),
  });
}

async function recordInventoryShrinkage(
  { itemId, quantity, businessDate, concept, detail },
  ctx,
) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  const item = await InventoryItem.findById(itemId);
  if (!item) throw new Error("InventoryItem no existe");
  const currentStock = await calculateCurrentStock(itemId);
  if (currentStock < quantity)
    throw new Error(`Stock insuficiente: ${currentStock}`);
  const wac = await calculateWAC(itemId);
  return InventoryMovement.create({
    businessDate: bd,
    itemId,
    type: "SHRINKAGE",
    quantity,
    unitCostSnapshot: wac,
    totalCostSnapshot: wac * quantity,
    concept: concept || `Merma de ${item.name}`,
    detail,
    createdBy: userId(ctx),
  });
}

async function voidInventoryMovement(movementId, reason, ctx) {
  requireAuth(ctx);
  if (!reason) throw new Error("reason requerido");
  const mv = await InventoryMovement.findById(movementId);
  if (!mv) throw new Error("InventoryMovement no encontrado");
  if (mv.status !== "ACTIVE")
    throw new Error("Solo se pueden anular movimientos ACTIVE");
  mv.status = "VOIDED";
  mv.voidReason = reason;
  mv.voidedAt = new Date();
  mv.voidedBy = userId(ctx);
  return mv.save();
}

async function getInventoryMovements(
  { itemId, dateFrom, dateTo, type } = {},
  ctx,
) {
  requireAuth(ctx);
  const q = {};
  if (itemId) q.itemId = itemId;
  if (type) q.type = type;
  if (dateFrom || dateTo) {
    q.businessDate = {};
    if (dateFrom)
      q.businessDate.$gte = normalizeBusinessDate(dateFrom, "dateFrom");
    if (dateTo) q.businessDate.$lte = normalizeBusinessDate(dateTo, "dateTo");
  }
  return InventoryMovement.find(q).sort({ businessDate: -1, createdAt: -1 });
}

async function getInventoryStock(ctx) {
  requireAuth(ctx);
  const items = await InventoryItem.find({ isActive: true }).lean();
  return Promise.all(
    items.map(async (item) => {
      const [stock, avgCost] = await Promise.all([
        calculateCurrentStock(item._id),
        calculateWAC(item._id),
      ]);
      return {
        item: {
          ...item,
          id: String(item._id),
          currentStock: stock,
          averageCost: avgCost,
        },
        currentStock: stock,
        averageCost: avgCost,
        totalValue: stock * avgCost,
      };
    }),
  );
}

// ─── Pipeline helpers ─────────────────────────────────────────────────────────

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

function expensesTotalPipeline(matchExtra = {}) {
  return [
    { $match: { status: "ACTIVE", ...matchExtra } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
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
  const [salesAgg, expensesAgg, inventoryAgg] = await Promise.all([
    Sale.aggregate([
      { $match: { status: "ACTIVE", activityId: { $ne: null }, ...dateMatch } },
      { $group: { _id: "$activityId", totalSales: { $sum: "$total" } } },
    ]),
    Expense.aggregate([
      {
        $match: {
          status: "ACTIVE",
          activityId: { $ne: null },
          expenseType: { $nin: ["TRANSFER_OUT"] }, // Excluir transferencias internas
          ...dateMatch,
        },
      },
      { $group: { _id: "$activityId", totalExpenses: { $sum: "$amount" } } },
    ]),
    InventoryMovement.aggregate([
      {
        $match: {
          status: "ACTIVE",
          type: "CONSUMPTION",
          activityId: { $ne: null },
          ...dateMatch,
        },
      },
      {
        $group: {
          _id: "$activityId",
          totalInventoryCost: { $sum: "$totalCostSnapshot" },
        },
      },
    ]),
  ]);

  const map = {};
  for (const s of salesAgg) {
    const id = String(s._id);
    if (!map[id])
      map[id] = {
        activityId: s._id,
        totalSales: 0,
        totalExpenses: 0,
        inventoryCostConsumed: 0,
        totalDonations: 0,
      };
    map[id].totalSales = s.totalSales;
  }
  for (const e of expensesAgg) {
    const id = String(e._id);
    if (!map[id])
      map[id] = {
        activityId: e._id,
        totalSales: 0,
        totalExpenses: 0,
        inventoryCostConsumed: 0,
        totalDonations: 0,
      };
    map[id].totalExpenses = e.totalExpenses;
  }
  for (const inv of inventoryAgg) {
    const id = String(inv._id);
    if (!map[id])
      map[id] = {
        activityId: inv._id,
        totalSales: 0,
        totalExpenses: 0,
        inventoryCostConsumed: 0,
        totalDonations: 0,
      };
    map[id].inventoryCostConsumed = inv.totalInventoryCost;
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
    inventoryCostConsumed: m.inventoryCostConsumed,
    totalDonations: m.totalDonations,
    net: m.totalSales - m.totalExpenses - m.inventoryCostConsumed,
  }));
}

// ─── dailySummary ─────────────────────────────────────────────────────────────

/**
 * getDailySummary — v2
 *
 * DEFINICIÓN DE TOTALES:
 * - totalSales: todas las ventas ACTIVAS del día (incluyendo donaciones monetarias),
 *   EXCLUYENDO sales de tipo BANK_INCOME (son transfers internas, no ingresos reales).
 * - totalExpenses: todos los gastos ACTIVOS del día,
 *   EXCLUYENDO expenseType=TRANSFER_OUT (son transfers internas, no gastos reales).
 * - net: totalSales - totalExpenses
 *
 * El campo `cashBoxBreakdown` desglosa por cada caja/sesión del día.
 * El campo `bankSummary` muestra movimientos bancarios del día.
 */
async function getDailySummary(businessDate, ctx) {
  requireAuth(ctx);
  const bd = normalizeBusinessDate(businessDate);
  const dateMatch = { businessDate: bd };

  // Excluir transfers internas de los totales para evitar doble conteo
  const realSalesMatch = { ...dateMatch, source: { $ne: "BANK_INCOME" } };
  const realExpensesMatch = {
    ...dateMatch,
    expenseType: { $ne: "TRANSFER_OUT" },
  };

  const sessions = await CashSession.find({ businessDate: bd });

  const promises = [
    Sale.aggregate(salesTotalPipeline(realSalesMatch)), // 0
    Expense.aggregate(expensesTotalPipeline(realExpensesMatch)), // 1
    Sale.aggregate(salesByMethodPipeline(realSalesMatch)), // 2
    Expense.aggregate(expensesByMethodPipeline(realExpensesMatch)), // 3
    Sale.aggregate(productSalesPipeline(dateMatch)), // 4
    Expense.aggregate(expensesByCategoryPipeline(realExpensesMatch)), // 5
    // Donaciones monetarias del día
    Sale.aggregate(
      salesTotalPipeline({ ...dateMatch, donationType: "MONETARY" }),
    ), // 6
    Sale.aggregate([
      {
        $match: {
          status: "ACTIVE",
          businessDate: bd,
          donationType: "MONETARY",
        },
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]), // 7
    // Donaciones en especie
    InventoryMovement.aggregate([
      {
        $match: {
          status: "ACTIVE",
          businessDate: bd,
          type: "DONATION_IN_KIND",
        },
      },
      { $group: { _id: null, total: { $sum: "$totalCostSnapshot" } } },
    ]), // 8
    // Activos del día
    Expense.find({
      businessDate: bd,
      expenseType: "ASSET_PURCHASE",
      status: "ACTIVE",
    }), // 9
    // Consumo de inventario del día
    InventoryMovement.aggregate([
      { $match: { status: "ACTIVE", businessDate: bd, type: "CONSUMPTION" } },
      {
        $group: {
          _id: "$itemId",
          totalQuantity: { $sum: "$quantity" },
          totalCost: { $sum: "$totalCostSnapshot" },
        },
      },
    ]), // 10
    // Donaciones en especie del día (documentos)
    InventoryMovement.find({
      businessDate: bd,
      type: "DONATION_IN_KIND",
      status: "ACTIVE",
    }), // 11
    // Movimientos bancarios del día
    FinanceAccount.find({ type: "BANK", isActive: true }), // 12
  ];

  const results = await Promise.all(promises);

  const totalSales = results[0][0]?.total || 0;
  const totalExpenses = results[1][0]?.total || 0;
  const salesByMethod = results[2];
  const expensesByMethod = results[3];
  const productSales = results[4];
  const expensesByCategory = results[5];
  const donationsMonetary = results[6][0]?.total || 0;
  const donationsMonetaryCount = results[7][0]?.count || 0;
  const donationsInKindEstimated = results[8][0]?.total || 0;
  const assetPurchases = results[9];
  const inventoryConsumptionRaw = results[10];
  const inKindDonations = results[11];
  const bankAccounts = results[12];

  // Enriquecer consumption con nombres de ítem
  const itemIds = inventoryConsumptionRaw.map((r) => r._id).filter(Boolean);
  const items = await InventoryItem.find({ _id: { $in: itemIds } }).lean();
  const itemMap = Object.fromEntries(items.map((i) => [String(i._id), i.name]));
  const inventoryConsumption = inventoryConsumptionRaw.map((r) => ({
    itemId: r._id,
    itemName: itemMap[String(r._id)] || "Desconocido",
    totalQuantity: r.totalQuantity,
    totalCost: r.totalCost,
  }));

  // ── Breakdown sesión vs externos ──────────────────────────────────────────
  let breakdown = null;
  if (sessions.length > 0) {
    const allSessionIds = sessions.map((s) => s._id);
    const externalSaleMatch = {
      ...realSalesMatch,
      $or: [
        { scope: "EXTERNAL" },
        { scope: { $exists: false }, cashSessionId: { $exists: false } },
      ],
    };
    const externalExpMatch = {
      ...realExpensesMatch,
      $or: [
        { scope: "EXTERNAL" },
        { scope: { $exists: false }, cashSessionId: { $exists: false } },
      ],
    };
    const sessionSaleMatch = {
      ...realSalesMatch,
      cashSessionId: { $in: allSessionIds },
    };
    const sessionExpMatch = {
      ...realExpensesMatch,
      cashSessionId: { $in: allSessionIds },
    };

    const [
      ssByMethod,
      seByMethod,
      ssTotal,
      seTotal,
      exsByMethod,
      exeByMethod,
      exsTotal,
      exeTotal,
    ] = await Promise.all([
      Sale.aggregate(salesByMethodPipeline(sessionSaleMatch)),
      Expense.aggregate(expensesByMethodPipeline(sessionExpMatch)),
      Sale.aggregate(salesTotalPipeline(sessionSaleMatch)),
      Expense.aggregate(expensesTotalPipeline(sessionExpMatch)),
      Sale.aggregate(salesByMethodPipeline(externalSaleMatch)),
      Expense.aggregate(expensesByMethodPipeline(externalExpMatch)),
      Sale.aggregate(salesTotalPipeline(externalSaleMatch)),
      Expense.aggregate(expensesTotalPipeline(externalExpMatch)),
    ]);

    const sessionSalesTotal = ssTotal[0]?.total || 0;
    const sessionExpensesTotal = seTotal[0]?.total || 0;
    const externalSalesTotal = exsTotal[0]?.total || 0;
    const externalExpensesTotal = exeTotal[0]?.total || 0;

    breakdown = {
      sessionSales: sessionSalesTotal,
      sessionExpenses: sessionExpensesTotal,
      sessionNet: sessionSalesTotal - sessionExpensesTotal,
      sessionByMethod: mergeMethodBreakdowns(ssByMethod, seByMethod),
      externalSales: externalSalesTotal,
      externalExpenses: externalExpensesTotal,
      externalNet: externalSalesTotal - externalExpensesTotal,
      externalByMethod: mergeMethodBreakdowns(exsByMethod, exeByMethod),
    };
  }

  // ── Desglose por caja ──────────────────────────────────────────────────────
  const cashBoxBreakdown = await Promise.all(
    sessions.map(async (sess) => {
      const sOid = sess._id;
      const [sessSales, sessExp, sessSalesMeth, sessExpMeth] =
        await Promise.all([
          Sale.aggregate(
            salesTotalPipeline({
              cashSessionId: sOid,
              source: { $ne: "BANK_INCOME" },
            }),
          ),
          Expense.aggregate(
            expensesTotalPipeline({
              cashSessionId: sOid,
              expenseType: { $ne: "TRANSFER_OUT" },
            }),
          ),
          Sale.aggregate(
            salesByMethodPipeline({
              cashSessionId: sOid,
              source: { $ne: "BANK_INCOME" },
            }),
          ),
          Expense.aggregate(
            expensesByMethodPipeline({
              cashSessionId: sOid,
              expenseType: { $ne: "TRANSFER_OUT" },
            }),
          ),
        ]);
      const st = sessSales[0]?.total || 0;
      const et = sessExp[0]?.total || 0;
      return {
        cashBoxId: sess.cashBoxId,
        cashBoxName: sess.cashBoxSnapshot || "Caja sin nombre",
        session: sess,
        sessionSales: st,
        sessionExpenses: et,
        sessionNet: st - et,
        sessionByMethod: mergeMethodBreakdowns(sessSalesMeth, sessExpMeth),
      };
    }),
  );

  // ── Movimientos bancarios del día ──────────────────────────────────────────
  const bankSummary = await Promise.all(
    bankAccounts.map(async (acc) => {
      const entries = await BankEntry.find({
        accountId: acc._id,
        businessDate: bd,
        status: "ACTIVE",
      });
      const credits = entries
        .filter((e) => e.direction === "CREDIT")
        .reduce((s, e) => s + e.amount, 0);
      const debits = entries
        .filter((e) => e.direction === "DEBIT")
        .reduce((s, e) => s + e.amount, 0);
      return {
        accountId: acc._id,
        accountName: acc.name,
        openingBalance: acc.openingBalance,
        credits,
        debits,
        closingBalance: acc.openingBalance + credits - debits,
        movements: entries,
      };
    }),
  );

  return {
    businessDate: bd,
    totalSales,
    totalExpenses,
    net: totalSales - totalExpenses,
    salesByMethod,
    expensesByMethod,
    productSales,
    expensesByCategory,
    breakdown,
    cashBoxBreakdown,
    bankSummary,
    donations: {
      monetary: donationsMonetary,
      inKindEstimated: donationsInKindEstimated,
      count: donationsMonetaryCount,
    },
    assetPurchases,
    inventoryConsumption,
    inKindDonations,
  };
}

function mergeMethodBreakdowns(salesArr, expensesArr) {
  const map = {};
  for (const s of salesArr) {
    map[s.method] = map[s.method] || { method: s.method, total: 0, count: 0 };
    map[s.method].total += s.total;
    map[s.method].count += s.count;
  }
  for (const e of expensesArr) {
    map[e.method] = map[e.method] || { method: e.method, total: 0, count: 0 };
    map[e.method].count += e.count;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

// ─── rangeSummary ─────────────────────────────────────────────────────────────

async function getRangeSummary({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  if (df > dt) throw new Error("dateFrom debe ser <= dateTo");

  const dateMatch = { businessDate: { $gte: df, $lte: dt } };
  const realSalesMatch = { ...dateMatch, source: { $ne: "BANK_INCOME" } };
  const realExpensesMatch = {
    ...dateMatch,
    expenseType: { $ne: "TRANSFER_OUT" },
  };

  const [
    salesTotalAgg,
    expTotalAgg,
    salesByMethod,
    expByMethod,
    productSales,
    expByCategory,
    activitiesSummary,
    donationsMonAgg,
    donationsInKindAgg,
    inventoryConsAgg,
  ] = await Promise.all([
    Sale.aggregate(salesTotalPipeline(realSalesMatch)),
    Expense.aggregate(expensesTotalPipeline(realExpensesMatch)),
    Sale.aggregate(salesByMethodPipeline(realSalesMatch)),
    Expense.aggregate(expensesByMethodPipeline(realExpensesMatch)),
    Sale.aggregate(productSalesPipeline(dateMatch)),
    Expense.aggregate(expensesByCategoryPipeline(realExpensesMatch)),
    activitiesSummaryPipeline(dateMatch),
    Sale.aggregate(
      salesTotalPipeline({ ...dateMatch, donationType: "MONETARY" }),
    ),
    InventoryMovement.aggregate([
      { $match: { status: "ACTIVE", type: "DONATION_IN_KIND", ...dateMatch } },
      { $group: { _id: null, total: { $sum: "$totalCostSnapshot" } } },
    ]),
    InventoryMovement.aggregate([
      { $match: { status: "ACTIVE", type: "CONSUMPTION", ...dateMatch } },
      {
        $group: {
          _id: "$itemId",
          totalQuantity: { $sum: "$quantity" },
          totalCost: { $sum: "$totalCostSnapshot" },
        },
      },
    ]),
  ]);

  const totalSales = salesTotalAgg[0]?.total || 0;
  const totalExpenses = expTotalAgg[0]?.total || 0;

  const itemIds = inventoryConsAgg.map((r) => r._id).filter(Boolean);
  const items = await InventoryItem.find({ _id: { $in: itemIds } }).lean();
  const itemMap = Object.fromEntries(items.map((i) => [String(i._id), i.name]));
  const inventoryConsumption = inventoryConsAgg.map((r) => ({
    itemId: r._id,
    itemName: itemMap[String(r._id)] || "Desconocido",
    totalQuantity: r.totalQuantity,
    totalCost: r.totalCost,
  }));

  const assetExpenses = await Expense.find({
    ...dateMatch,
    expenseType: "ASSET_PURCHASE",
    status: "ACTIVE",
  });
  const totalAssetPurchases = assetExpenses.reduce((s, e) => s + e.amount, 0);

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
    donations: {
      monetary: donationsMonAgg[0]?.total || 0,
      inKindEstimated: donationsInKindAgg[0]?.total || 0,
      count: 0,
    },
    inventoryConsumption,
    totalAssetPurchases,
  };
}

// ─── Reports ──────────────────────────────────────────────────────────────────

async function getProductSalesReport({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  return Sale.aggregate(
    productSalesPipeline({ businessDate: { $gte: df, $lte: dt } }),
  );
}

async function getExpenseReport({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  return Expense.aggregate(
    expensesByCategoryPipeline({
      businessDate: { $gte: df, $lte: dt },
      expenseType: { $ne: "TRANSFER_OUT" },
    }),
  );
}

/**
 * getActivityPnLReport — P&L real por actividad
 *
 * Net = totalSales - totalExpenses - inventoryCostConsumed
 * (El inventario consumido es costo diferido, no aparece como Expense directo
 * si la compra fue en otro día/actividad)
 */
async function getActivityPnLReport({ activityId, dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  const dateMatch = { businessDate: { $gte: df, $lte: dt } };
  const aOid = new mongoose.Types.ObjectId(String(activityId));

  const [
    salesAgg,
    salesByMeth,
    expensesAgg,
    expByCategory,
    inventoryAgg,
    inventoryDetail,
    donationsMonAgg,
    donationsInKindAgg,
  ] = await Promise.all([
    Sale.aggregate(
      salesTotalPipeline({
        ...dateMatch,
        activityId: aOid,
        source: { $ne: "BANK_INCOME" },
      }),
    ),
    Sale.aggregate(salesByMethodPipeline({ ...dateMatch, activityId: aOid })),
    Expense.aggregate(
      expensesTotalPipeline({
        ...dateMatch,
        activityId: aOid,
        expenseType: { $ne: "TRANSFER_OUT" },
      }),
    ),
    Expense.aggregate(
      expensesByCategoryPipeline({ ...dateMatch, activityId: aOid }),
    ),
    InventoryMovement.aggregate([
      {
        $match: {
          status: "ACTIVE",
          type: "CONSUMPTION",
          activityId: aOid,
          ...dateMatch,
        },
      },
      { $group: { _id: null, total: { $sum: "$totalCostSnapshot" } } },
    ]),
    InventoryMovement.aggregate([
      {
        $match: {
          status: "ACTIVE",
          type: "CONSUMPTION",
          activityId: aOid,
          ...dateMatch,
        },
      },
      {
        $group: {
          _id: "$itemId",
          totalQuantity: { $sum: "$quantity" },
          totalCost: { $sum: "$totalCostSnapshot" },
        },
      },
    ]),
    Sale.aggregate(
      salesTotalPipeline({
        ...dateMatch,
        activityId: aOid,
        donationType: "MONETARY",
      }),
    ),
    InventoryMovement.aggregate([
      {
        $match: {
          status: "ACTIVE",
          type: "DONATION_IN_KIND",
          activityId: aOid,
          ...dateMatch,
        },
      },
      { $group: { _id: null, total: { $sum: "$totalCostSnapshot" } } },
    ]),
  ]);

  const activity = await Activity.findById(activityId).lean();
  const totalSales = salesAgg[0]?.total || 0;
  const totalExpenses = expensesAgg[0]?.total || 0;
  const inventoryCostConsumed = inventoryAgg[0]?.total || 0;
  const donationsMonetary = donationsMonAgg[0]?.total || 0;
  const donationsInKind = donationsInKindAgg[0]?.total || 0;

  const itemIds = inventoryDetail.map((r) => r._id).filter(Boolean);
  const items = await InventoryItem.find({ _id: { $in: itemIds } }).lean();
  const itemMap = Object.fromEntries(items.map((i) => [String(i._id), i.name]));
  const invDetail = inventoryDetail.map((r) => ({
    itemId: r._id,
    itemName: itemMap[String(r._id)] || "Desconocido",
    totalQuantity: r.totalQuantity,
    totalCost: r.totalCost,
  }));

  return {
    activityId,
    activityName: activity?.name || null,
    dateFrom: df,
    dateTo: dt,
    totalSales,
    totalExpenses,
    inventoryCostConsumed,
    donationsMonetary,
    donationsInKindEstimated: donationsInKind,
    net: totalSales - totalExpenses - inventoryCostConsumed,
    salesByMethod: salesByMeth,
    expensesByCategory: expByCategory,
    inventoryDetail: invDetail,
  };
}

async function getCashSessionReport(cashSessionId, ctx) {
  requireAuth(ctx);
  const session = await CashSession.findById(cashSessionId);
  if (!session) throw new Error("Sesión no encontrada");
  const [sales, expenses] = await Promise.all([
    Sale.find({ cashSessionId: session._id, status: "ACTIVE" }).sort({
      createdAt: 1,
    }),
    Expense.find({ cashSessionId: session._id, status: "ACTIVE" }).sort({
      createdAt: 1,
    }),
  ]);
  const totalSales = sales.reduce((s, x) => s + x.total, 0);
  const totalExpenses = expenses
    .filter((e) => e.expenseType !== "TRANSFER_OUT")
    .reduce((s, x) => s + x.amount, 0);
  return {
    session,
    sales,
    expenses,
    expectedTotalsByMethod: session.expectedTotalsByMethod || {},
    totalSales,
    totalExpenses,
    net: totalSales - totalExpenses,
  };
}

async function getBankReport({ accountId, dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  const account = await FinanceAccount.findById(accountId);
  if (!account) throw new Error("FinanceAccount no encontrada");

  const movements = await BankEntry.find({
    accountId,
    businessDate: { $gte: df, $lte: dt },
    status: "ACTIVE",
  }).sort({ businessDate: 1, createdAt: 1 });

  // Saldo anterior al período (todos los movimientos anteriores a dateFrom)
  const priorAgg = await BankEntry.aggregate([
    {
      $match: {
        accountId: new mongoose.Types.ObjectId(String(accountId)),
        businessDate: { $lt: df },
        status: "ACTIVE",
      },
    },
    {
      $group: {
        _id: null,
        credits: {
          $sum: { $cond: [{ $eq: ["$direction", "CREDIT"] }, "$amount", 0] },
        },
        debits: {
          $sum: { $cond: [{ $eq: ["$direction", "DEBIT"] }, "$amount", 0] },
        },
      },
    },
  ]);
  const priorBalance =
    (account.openingBalance || 0) +
    (priorAgg[0]?.credits || 0) -
    (priorAgg[0]?.debits || 0);

  const credits = movements
    .filter((e) => e.direction === "CREDIT")
    .reduce((s, e) => s + e.amount, 0);
  const debits = movements
    .filter((e) => e.direction === "DEBIT")
    .reduce((s, e) => s + e.amount, 0);

  // byType simplificado para el resumen
  const byTypeMap = {};
  for (const m of movements) {
    const key = `${m.type}_${m.direction}`;
    byTypeMap[key] = byTypeMap[key] || { method: key, total: 0, count: 0 };
    byTypeMap[key].total += m.amount;
    byTypeMap[key].count += 1;
  }

  return {
    account,
    dateFrom: df,
    dateTo: dt,
    openingBalance: priorBalance,
    totalCredits: credits,
    totalDebits: debits,
    closingBalance: priorBalance + credits - debits,
    movements,
    byType: Object.values(byTypeMap),
  };
}

async function getInventoryRangeReport({ dateFrom, dateTo }, ctx) {
  requireAuth(ctx);
  const df = normalizeBusinessDate(dateFrom, "dateFrom");
  const dt = normalizeBusinessDate(dateTo, "dateTo");
  const dateMatch = { businessDate: { $gte: df, $lte: dt } };

  const [
    purchases,
    consumptions,
    donations,
    shrinkages,
    costByActivity,
    stockEntries,
  ] = await Promise.all([
    InventoryMovement.find({
      ...dateMatch,
      type: "PURCHASE",
      status: "ACTIVE",
    }).sort({ businessDate: 1 }),
    InventoryMovement.find({
      ...dateMatch,
      type: "CONSUMPTION",
      status: "ACTIVE",
    }).sort({ businessDate: 1 }),
    InventoryMovement.find({
      ...dateMatch,
      type: "DONATION_IN_KIND",
      status: "ACTIVE",
    }).sort({ businessDate: 1 }),
    InventoryMovement.find({
      ...dateMatch,
      type: "SHRINKAGE",
      status: "ACTIVE",
    }).sort({ businessDate: 1 }),
    activitiesSummaryPipeline(dateMatch),
    getInventoryStock(ctx),
  ]);

  return {
    dateFrom: df,
    dateTo: dt,
    purchases,
    consumptions,
    donations,
    shrinkages,
    costConsumedByActivity: costByActivity,
    currentStock: stockEntries,
  };
}

async function buildMonthlyReportDataset(month, year, ctx) {
  requireAuth(ctx);
  if (!month || month < 1 || month > 12)
    throw new Error("month inválido (1–12)");
  if (!year || year < 2020) throw new Error("year inválido");

  const pad = (n) => String(n).padStart(2, "0");
  const dateFrom = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${pad(month)}-${pad(lastDay)}`;
  const dateMatch = { businessDate: { $gte: dateFrom, $lte: dateTo } };

  const [summary, inventoryReport] = await Promise.all([
    getRangeSummary({ dateFrom, dateTo }, ctx),
    getInventoryRangeReport({ dateFrom, dateTo }, ctx),
  ]);

  const [saleDates, expenseDates, bankMovements] = await Promise.all([
    Sale.distinct("businessDate", { ...dateMatch, status: "ACTIVE" }),
    Expense.distinct("businessDate", { ...dateMatch, status: "ACTIVE" }),
    BankEntry.find({
      businessDate: dateMatch.businessDate,
      status: "ACTIVE",
    }).sort({ businessDate: 1 }),
  ]);

  const uniqueDates = [...new Set([...saleDates, ...expenseDates])].sort();
  const dailyBreakdown = await Promise.all(
    uniqueDates.map((bd) => getDailySummary(bd, ctx)),
  );

  const assetPurchases = await Expense.find({
    ...dateMatch,
    expenseType: "ASSET_PURCHASE",
    status: "ACTIVE",
  }).sort({ businessDate: 1 });

  return {
    month,
    year,
    generatedAt: new Date().toISOString(),
    summary,
    dailyBreakdown,
    assetPurchases,
    bankMovements,
    inventoryReport,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  requireAuth,

  // Catalogues
  createCategory,
  getCategories,
  toggleCategoryActive,
  createActivity,
  getActivities,
  toggleActivityActive,
  createCashBox,
  getCashBoxes,
  toggleCashBoxActive,
  createFinanceAccount,
  getFinanceAccounts,
  toggleFinanceAccountActive,

  // CashSession
  openCashSession,
  closeCashSession,
  getCashSessionDetail,
  getCashSessions,
  getCashSessionsByDate,

  // Sales
  recordSale,
  voidSale,
  refundSale,
  getSalesByDate,

  // Expenses
  recordExpense,
  voidExpense,
  getExpensesByDate,

  // Bank
  recordBankEntry,
  voidBankEntry,
  transferCashToBank,
  transferBankToCash,
  getBankReport,

  // Inventory
  createInventoryItem,
  getInventoryItems,
  toggleInventoryItemActive,
  recordInventoryConsumption,
  recordDonationInKind,
  recordInventoryShrinkage,
  voidInventoryMovement,
  getInventoryMovements,
  getInventoryStock,
  calculateWAC,
  calculateCurrentStock,

  // Reports
  getDailySummary,
  getRangeSummary,
  getProductSalesReport,
  getExpenseReport,
  getActivityPnLReport,
  getCashSessionReport,
  getBankReport,
  getInventoryRangeReport,
  buildMonthlyReportDataset,
};
