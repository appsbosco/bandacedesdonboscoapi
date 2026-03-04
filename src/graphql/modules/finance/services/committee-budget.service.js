/**
 * committee-budget.service.js
 *
 * Servicio de control presupuestario por comités del STAFF.
 *
 * Responsabilidades:
 * 1.  Seedear / gestionar el catálogo de comités con sus porcentajes.
 * 2.  Registrar el saldo inicial único y distribuirlo entre comités.
 * 3.  Calcular la utilidad neta de una actividad (reutilizando lógica existente).
 * 4.  Liquidar (distribuir) la utilidad de una actividad entre comités.
 * 5.  Registrar gastos con cargo a un comité específico.
 * 6.  Consultar el ledger (estado de cuenta) de cada comité.
 * 7.  Consultar el resumen global de todos los presupuestos.
 * 8.  Actualizar la configuración de porcentajes (validando que sumen 100%).
 *
 * INTEGRACIÓN con el módulo existente:
 * - Reutiliza Sale, Expense, InventoryMovement para calcular utilidad.
 * - Reutiliza Activity para identificar actividades.
 * - Reutiliza la función requireAuth del finance.service original.
 * - Llama a recordExpense del finance.service para gastos que también afectan caja.
 * - businessDate siempre String "YYYY-MM-DD" (misma convención).
 * - Excluye TRANSFER_OUT y BANK_INCOME de cálculos de utilidad.
 * - Respeta status ACTIVE/VOIDED en todos los modelos.
 */

"use strict";

const mongoose = require("mongoose");

// Modelos existentes del módulo de finanzas
const Sale = require("../../../../../models/Sale");
const Expense = require("../../../../../models/Expense");
const Activity = require("../../../../../models/Activity");
const InventoryMovement = require("../../../../../models/InventoryMovement");

// Nuevos modelos del módulo de comités
const Committee = require("../../../../../models/Committee");
const CommitteeLedgerEntry = require("../../../../../models/CommitteeLedgerEntry");
const BudgetInitialization = require("../../../../../models/BudgetInitialization");
const ActivitySettlement = require("../../../../../models/ActivitySettlement");

// ─── Helpers reutilizados del módulo existente ────────────────────────────────

function requireAuth(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  // if (!u) throw new Error("No autenticado");
  return u;
}

function userId(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return u ? u._id || u.id : undefined;
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

// ─── Seed de comités ──────────────────────────────────────────────────────────

/**
 * Datos predeterminados de los 6 comités del STAFF.
 * Solo se usan en seedCommittees — en producción los porcentajes vienen de la DB.
 */
const DEFAULT_COMMITTEES = [
  {
    name: "Operativa",
    slug: "operativa",
    distributionPercentage: 50,
    description: "Comité de operaciones generales",
    displayOrder: 1,
  },
  {
    name: "Ventas",
    slug: "ventas",
    distributionPercentage: 20,
    description: "Comité de ventas y comercialización",
    displayOrder: 2,
  },
  {
    name: "Becas",
    slug: "becas",
    distributionPercentage: 10,
    description: "Comité de becas y asistencia",
    displayOrder: 3,
  },
  {
    name: "Giras",
    slug: "giras",
    distributionPercentage: 10,
    description: "Comité de giras y viajes",
    displayOrder: 4,
  },
  {
    name: "Visuales",
    slug: "visuales",
    distributionPercentage: 5,
    description: "Comité de producción visual",
    displayOrder: 5,
  },
  {
    name: "Pastoral",
    slug: "pastoral",
    distributionPercentage: 5,
    description: "Comité pastoral y espiritual",
    displayOrder: 6,
  },
];

/**
 * seedCommittees — Crea los comités por defecto si no existen todavía.
 * Idempotente: si ya existen, no hace nada.
 * Se puede llamar en el bootstrap del servidor.
 */
async function seedCommittees(ctx) {
  requireAuth(ctx);
  const existing = await Committee.find({}).lean();
  if (existing.length > 0) {
    return existing; // Ya sembrado
  }

  const created = await Committee.insertMany(
    DEFAULT_COMMITTEES.map((c) => ({ ...c, createdBy: userId(ctx) })),
  );
  return created;
}

/**
 * createCommittee — Crea un comité nuevo.
 * Valida que los porcentajes de todos los activos sigan sumando <= 100.
 * El admin debe ajustar los demás antes de añadir uno nuevo si la suma ya es 100.
 */
async function createCommittee(
  { name, slug, distributionPercentage, description, displayOrder },
  ctx,
) {
  requireAuth(ctx);
  if (!name) throw new Error("name requerido");
  if (!slug) throw new Error("slug requerido");
  if (
    distributionPercentage === undefined ||
    distributionPercentage === null ||
    distributionPercentage < 0
  )
    throw new Error("distributionPercentage requerido (>= 0)");

  const total = await _sumActivePercentages();
  if (total + distributionPercentage > 100) {
    throw new Error(
      `La suma de porcentajes quedaría en ${total + distributionPercentage}%. ` +
        `Ajusta los porcentajes existentes primero. Total actual: ${total}%`,
    );
  }

  return Committee.create({
    name,
    slug: slug.toLowerCase().trim(),
    distributionPercentage,
    description,
    displayOrder: displayOrder ?? 99,
    createdBy: userId(ctx),
  });
}

/**
 * getCommittees — Lista todos los comités (activos por defecto).
 */
async function getCommittees({ onlyActive = true } = {}, ctx) {
  requireAuth(ctx);
  const q = onlyActive ? { isActive: true } : {};
  return Committee.find(q).sort({ displayOrder: 1, name: 1 });
}

/**
 * getCommitteeDistributionConfig — Devuelve la configuración de porcentajes actual.
 * Incluye la suma total para validación en UI.
 */
async function getCommitteeDistributionConfig(ctx) {
  requireAuth(ctx);
  const committees = await Committee.find({ isActive: true })
    .sort({ displayOrder: 1 })
    .lean();
  const totalPercentage = committees.reduce(
    (s, c) => s + (c.distributionPercentage || 0),
    0,
  );
  const isValid = Math.abs(totalPercentage - 100) < 0.01; // Tolerancia de 0.01%
  return {
    committees: committees.map((c) => ({
      ...c,
      id: String(c._id),
    })),
    totalPercentage,
    isValid,
  };
}

/**
 * updateCommitteeDistributionConfig — Actualiza los porcentajes de TODOS los comités
 * en una sola operación atómica. Valida que la suma total sea exactamente 100%.
 *
 * Input: array de { committeeId, percentage }
 */
async function updateCommitteeDistributionConfig(updates, ctx) {
  requireAuth(ctx);

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error("updates debe ser un array no vacío");
  }

  // Validar que cada porcentaje sea >= 0
  for (const u of updates) {
    if (!u.committeeId) throw new Error("Cada update requiere committeeId");
    if (u.percentage < 0 || u.percentage > 100)
      throw new Error(
        `Porcentaje inválido para comité ${u.committeeId}: ${u.percentage}`,
      );
  }

  // Calcular suma total de los nuevos porcentajes (solo comités incluidos en updates)
  const totalInUpdates = updates.reduce((s, u) => s + (u.percentage || 0), 0);

  // Sumar los porcentajes de comités activos NO incluidos en este update
  const updatedIds = updates.map((u) => u.committeeId);
  const remaining = await Committee.find({
    isActive: true,
    _id: { $nin: updatedIds },
  }).lean();
  const totalRemaining = remaining.reduce(
    (s, c) => s + (c.distributionPercentage || 0),
    0,
  );

  const grandTotal = totalInUpdates + totalRemaining;
  if (Math.abs(grandTotal - 100) > 0.01) {
    throw new Error(
      `Los porcentajes deben sumar exactamente 100%. Suma actual: ${grandTotal.toFixed(2)}%`,
    );
  }

  // Aplicar updates en paralelo
  const mongoSession = await mongoose.startSession();
  let result = [];
  try {
    await mongoSession.withTransaction(async () => {
      const promises = updates.map(({ committeeId, percentage }) =>
        Committee.findByIdAndUpdate(
          committeeId,
          { distributionPercentage: percentage, updatedBy: userId(ctx) },
          { new: true, session: mongoSession },
        ),
      );
      result = await Promise.all(promises);
    });
  } finally {
    await mongoSession.endSession();
  }

  // Retornar la configuración actualizada
  return getCommitteeDistributionConfig(ctx);
}

// ─── Saldo inicial ────────────────────────────────────────────────────────────

/**
 * initializeCommitteeBudgets — Registra el saldo inicial único del sistema.
 *
 * REGLAS:
 * 1. Solo se puede llamar una vez (un solo BudgetInitialization ACTIVE).
 * 2. Los porcentajes de los comités activos deben sumar exactamente 100%.
 * 3. Crea automáticamente un CommitteeLedgerEntry de tipo INITIAL_ALLOCATION
 *    por cada comité activo.
 * 4. Todo en una sola transacción MongoDB.
 */
async function initializeCommitteeBudgets(
  { totalAmount, businessDate, description, notes },
  ctx,
) {
  requireAuth(ctx);

  const bd = normalizeBusinessDate(businessDate);
  if (!totalAmount || totalAmount <= 0)
    throw new Error("totalAmount inválido (debe ser > 0)");

  // Verificar que no exista ya un saldo inicial activo
  const existing = await BudgetInitialization.findOne({ status: "ACTIVE" });
  if (existing) {
    throw new Error(
      "Ya existe un saldo inicial activo registrado el " +
        existing.businessDate +
        ". No se puede registrar un segundo saldo inicial. " +
        "Si necesitas corregirlo, debes anular el existente primero.",
    );
  }

  // Obtener comités activos y validar porcentajes
  const committees = await Committee.find({ isActive: true })
    .sort({ displayOrder: 1 })
    .lean();
  if (committees.length === 0) {
    throw new Error(
      "No hay comités activos. Ejecuta seedCommittees primero o crea los comités.",
    );
  }

  const totalPercentage = committees.reduce(
    (s, c) => s + (c.distributionPercentage || 0),
    0,
  );
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(
      `Los porcentajes de los comités activos deben sumar 100%. Suma actual: ${totalPercentage.toFixed(2)}%. ` +
        "Ajusta los porcentajes con updateCommitteeDistributionConfig antes de inicializar.",
    );
  }

  // Calcular distribución
  const distributions = _calculateDistributions(committees, totalAmount);

  const mongoSession = await mongoose.startSession();
  let initialization;
  try {
    await mongoSession.withTransaction(async () => {
      // 1. Crear el documento de inicialización (sin distributionSnapshot por ahora)
      [initialization] = await BudgetInitialization.create(
        [
          {
            totalAmount,
            businessDate: bd,
            description:
              description || "Saldo inicial del sistema de presupuestos",
            notes,
            status: "ACTIVE",
            createdBy: userId(ctx),
          },
        ],
        { session: mongoSession },
      );

      // 2. Crear los ledger entries y recolectar sus IDs
      const distributionSnapshot = [];
      for (const dist of distributions) {
        // Calcular saldo previo del comité (en este punto es 0 para todos)
        const previousBalance = 0;
        const runningBalance = previousBalance + dist.amount;

        const [entry] = await CommitteeLedgerEntry.create(
          [
            {
              committeeId: dist.committeeId,
              committeeNameSnapshot: dist.committeeName,
              entryType: "INITIAL_ALLOCATION",
              businessDate: bd,
              creditAmount: dist.amount,
              debitAmount: 0,
              runningBalance,
              percentageSnapshot: dist.percentage,
              description: `Asignación inicial: ${dist.committeeName} (${dist.percentage}% de ₡${totalAmount.toLocaleString("es-CR")})`,
              budgetInitializationId: initialization._id,
              status: "ACTIVE",
              createdBy: userId(ctx),
            },
          ],
          { session: mongoSession },
        );

        distributionSnapshot.push({
          committeeId: dist.committeeId,
          committeeName: dist.committeeName,
          committeeSlug: dist.committeeSlug,
          percentage: dist.percentage,
          amount: dist.amount,
          ledgerEntryId: entry._id,
        });
      }

      // 3. Actualizar el initialization con el snapshot completo
      initialization.distributionSnapshot = distributionSnapshot;
      await initialization.save({ session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }

  return initialization;
}

/**
 * getBudgetInitialization — Obtiene el saldo inicial activo.
 */
async function getBudgetInitialization(ctx) {
  requireAuth(ctx);
  return BudgetInitialization.findOne({ status: "ACTIVE" });
}

// ─── Utilidad de actividades ──────────────────────────────────────────────────

/**
 * calculateActivityProfit — Calcula la utilidad neta de una actividad.
 *
 * Reutiliza exactamente la misma lógica que getActivityPnLReport del módulo existente:
 * - Suma ventas ACTIVE (excluyendo BANK_INCOME = transfers internas)
 * - Suma gastos ACTIVE (excluyendo TRANSFER_OUT = transfers internas)
 * - Suma costo de inventario consumido ACTIVE
 * - net = totalSales - totalExpenses - inventoryCostConsumed
 *
 * Si se pasan dateFrom/dateTo, filtra por rango. Si no, usa toda la historia.
 */
async function calculateActivityProfit(
  { activityId, dateFrom, dateTo } = {},
  ctx,
) {
  requireAuth(ctx);
  if (!activityId) throw new Error("activityId requerido");

  const aOid = new mongoose.Types.ObjectId(String(activityId));
  const dateMatch = {};
  if (dateFrom || dateTo) {
    dateMatch.businessDate = {};
    if (dateFrom)
      dateMatch.businessDate.$gte = normalizeBusinessDate(dateFrom, "dateFrom");
    if (dateTo)
      dateMatch.businessDate.$lte = normalizeBusinessDate(dateTo, "dateTo");
  }

  const [salesAgg, expensesAgg, inventoryAgg] = await Promise.all([
    Sale.aggregate([
      {
        $match: {
          status: "ACTIVE",
          activityId: aOid,
          source: { $ne: "BANK_INCOME" }, // Excluir transfers internas
          ...dateMatch,
        },
      },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Expense.aggregate([
      {
        $match: {
          status: "ACTIVE",
          activityId: aOid,
          expenseType: { $ne: "TRANSFER_OUT" }, // Excluir transfers internas
          ...dateMatch,
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
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
      { $group: { _id: null, total: { $sum: "$totalCostSnapshot" } } },
    ]),
  ]);

  const activity = await Activity.findById(activityId).lean();
  if (!activity) throw new Error("Actividad no encontrada");

  // Verificar si ya fue liquidada
  const settlement = await ActivitySettlement.findOne({
    activityId: aOid,
    status: "ACTIVE",
  }).lean();

  const totalSales = salesAgg[0]?.total || 0;
  const totalExpenses = expensesAgg[0]?.total || 0;
  const inventoryCostConsumed = inventoryAgg[0]?.total || 0;
  const netProfit = totalSales - totalExpenses - inventoryCostConsumed;

  return {
    activityId,
    activityName: activity.name,
    totalSales,
    totalExpenses,
    inventoryCostConsumed,
    netProfit,
    isAlreadySettled: !!settlement,
    settlementId: settlement ? String(settlement._id) : null,
    settlementDate: settlement ? settlement.businessDate : null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  };
}

/**
 * getActivitiesPendingSettlement — Lista actividades que tienen ventas o gastos
 * pero que aún no han sido liquidadas (distribuidas entre comités).
 *
 * Reutiliza Sale y Expense igual que el módulo existente.
 */
async function getActivitiesPendingSettlement({ dateFrom, dateTo } = {}, ctx) {
  requireAuth(ctx);

  const dateMatch = {};
  if (dateFrom || dateTo) {
    dateMatch.businessDate = {};
    if (dateFrom)
      dateMatch.businessDate.$gte = normalizeBusinessDate(dateFrom, "dateFrom");
    if (dateTo)
      dateMatch.businessDate.$lte = normalizeBusinessDate(dateTo, "dateTo");
  }

  // Obtener IDs de actividades que ya fueron liquidadas
  const settled = await ActivitySettlement.find({ status: "ACTIVE" })
    .select("activityId")
    .lean();
  const settledIds = settled.map((s) => String(s.activityId));

  // Actividades con movimientos financieros
  const [salesIds, expenseIds] = await Promise.all([
    Sale.distinct("activityId", {
      status: "ACTIVE",
      activityId: { $ne: null },
      source: { $ne: "BANK_INCOME" },
      ...dateMatch,
    }),
    Expense.distinct("activityId", {
      status: "ACTIVE",
      activityId: { $ne: null },
      expenseType: { $ne: "TRANSFER_OUT" },
      ...dateMatch,
    }),
  ]);

  // Unión de IDs únicos
  const allIds = [
    ...new Set([...salesIds.map(String), ...expenseIds.map(String)]),
  ].filter((id) => !settledIds.includes(id));

  if (allIds.length === 0) return [];

  // Calcular profit para cada actividad pendiente
  const activities = await Activity.find({
    _id: { $in: allIds },
    isActive: true,
  }).lean();

  const results = await Promise.all(
    activities.map((act) =>
      calculateActivityProfit(
        { activityId: String(act._id), dateFrom, dateTo },
        ctx,
      ),
    ),
  );

  return results.filter((r) => !r.isAlreadySettled);
}

/**
 * distributeActivityProfit — Liquida la utilidad de una actividad y la distribuye
 * entre los comités según sus porcentajes actuales.
 *
 * REGLAS:
 * 1. La actividad no debe haber sido liquidada antes (ActivitySettlement ACTIVE).
 * 2. Los porcentajes de comités activos deben sumar 100%.
 * 3. Si netProfit <= 0, se puede registrar de todas formas con monto 0 por comité
 *    (para marcar la actividad como "revisada"). El parámetro `forceIfZero`
 *    controla este comportamiento.
 * 4. Todo en transacción MongoDB.
 */
async function distributeActivityProfit(
  { activityId, businessDate, dateFrom, dateTo, notes, forceIfZero = false },
  ctx,
) {
  requireAuth(ctx);

  const bd = normalizeBusinessDate(businessDate);
  if (!activityId) throw new Error("activityId requerido");

  const aOid = new mongoose.Types.ObjectId(String(activityId));

  // Verificar que no exista ya un settlement activo para esta actividad
  const existingSettlement = await ActivitySettlement.findOne({
    activityId: aOid,
    status: "ACTIVE",
  });
  if (existingSettlement) {
    throw new Error(
      `La actividad ya fue liquidada el ${existingSettlement.businessDate} ` +
        `(settlement ID: ${existingSettlement._id}). ` +
        "No se puede distribuir la utilidad dos veces.",
    );
  }

  // Calcular utilidad actual de la actividad
  const profitData = await calculateActivityProfit(
    { activityId, dateFrom, dateTo },
    ctx,
  );

  if (profitData.netProfit <= 0 && !forceIfZero) {
    throw new Error(
      `La utilidad neta de la actividad "${profitData.activityName}" es ` +
        `₡${profitData.netProfit.toLocaleString("es-CR")} (≤ 0). ` +
        "No hay utilidad positiva para distribuir. " +
        "Usa forceIfZero=true si deseas marcar la actividad como revisada de todas formas.",
    );
  }

  // Obtener comités activos y validar porcentajes
  const committees = await Committee.find({ isActive: true })
    .sort({ displayOrder: 1 })
    .lean();
  const totalPercentage = committees.reduce(
    (s, c) => s + (c.distributionPercentage || 0),
    0,
  );
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(
      `Los porcentajes de comités no suman 100% (actual: ${totalPercentage.toFixed(2)}%). ` +
        "Ajusta la configuración antes de distribuir.",
    );
  }

  const amountToDistribute = Math.max(0, profitData.netProfit);
  const distributions = _calculateDistributions(committees, amountToDistribute);

  const mongoSession = await mongoose.startSession();
  let settlement;
  try {
    await mongoSession.withTransaction(async () => {
      // 1. Crear el ActivitySettlement
      [settlement] = await ActivitySettlement.create(
        [
          {
            activityId: aOid,
            activityNameSnapshot: profitData.activityName,
            businessDate: bd,
            totalSales: profitData.totalSales,
            totalExpenses: profitData.totalExpenses,
            inventoryCostConsumed: profitData.inventoryCostConsumed,
            netProfit: profitData.netProfit,
            calculatedFromDate: dateFrom || null,
            calculatedToDate: dateTo || null,
            totalDistributed: amountToDistribute,
            notes,
            status: "ACTIVE",
            createdBy: userId(ctx),
          },
        ],
        { session: mongoSession },
      );

      // 2. Crear CommitteeLedgerEntry por cada comité
      const distributionSnapshot = [];
      for (const dist of distributions) {
        // Calcular saldo actual del comité para el runningBalance
        const currentBalance = await _getCommitteeBalance(
          dist.committeeId,
          mongoSession,
        );
        const runningBalance = currentBalance + dist.amount;

        const [entry] = await CommitteeLedgerEntry.create(
          [
            {
              committeeId: dist.committeeId,
              committeeNameSnapshot: dist.committeeName,
              entryType: "UTILITY_DISTRIBUTION",
              businessDate: bd,
              creditAmount: dist.amount,
              debitAmount: 0,
              runningBalance,
              percentageSnapshot: dist.percentage,
              description:
                `Distribución de utilidad: actividad "${profitData.activityName}" ` +
                `(${dist.percentage}% de ₡${amountToDistribute.toLocaleString("es-CR")})`,
              activitySettlementId: settlement._id,
              activityId: aOid,
              status: "ACTIVE",
              createdBy: userId(ctx),
            },
          ],
          { session: mongoSession },
        );

        distributionSnapshot.push({
          committeeId: dist.committeeId,
          committeeName: dist.committeeName,
          committeeSlug: dist.committeeSlug,
          percentage: dist.percentage,
          amount: dist.amount,
          ledgerEntryId: entry._id,
        });
      }

      // 3. Actualizar el settlement con el snapshot completo
      settlement.distributionSnapshot = distributionSnapshot;
      await settlement.save({ session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }

  return settlement;
}

// ─── Gastos con cargo a comité ────────────────────────────────────────────────

/**
 * recordCommitteeExpense — Registra un gasto que rebaja el presupuesto de un comité.
 *
 * DISEÑO DELIBERADO:
 * Este servicio NO crea un Expense en la colección de Expense directamente.
 * En cambio, PUEDE recibir un expenseId de un Expense ya existente (creado con
 * el flujo normal de recordExpense) para vincularlo al comité.
 *
 * Alternativamente, si se pasa expenseData completo, crea el Expense primero
 * y luego el CommitteeLedgerEntry, todo en una transacción.
 *
 * Esto permite dos flujos:
 *
 * FLUJO A — Gasto de caja que también afecta presupuesto del comité:
 *   1. Registrar el gasto en caja con recordExpense (flujo existente)
 *   2. Luego llamar recordCommitteeExpense con el expenseId para vincularlo.
 *
 * FLUJO B — Gasto presupuestario puro (no pasa por caja, ej: compromisos):
 *   1. Llamar recordCommitteeExpense con expenseData completo.
 *   2. Crea Expense + CommitteeLedgerEntry en una sola operación.
 *
 * VALIDACIÓN DE SALDO NEGATIVO:
 * Si allowNegativeBalance=false (default), lanza error si el gasto dejaría el
 * comité en negativo. Si allowNegativeBalance=true, permite el negativo pero
 * registra una advertencia en el ledger entry.
 */
async function recordCommitteeExpense(
  {
    committeeId,
    expenseId, // Opción A: vincular Expense existente
    expenseData, // Opción B: crear Expense nuevo (input de recordExpense)
    businessDate,
    amount,
    concept,
    notes,
    activityId,
    allowNegativeBalance = false,
  },
  ctx,
) {
  requireAuth(ctx);

  if (!committeeId) throw new Error("committeeId requerido");
  if (!amount || amount <= 0) throw new Error("amount inválido (debe ser > 0)");
  if (!concept) throw new Error("concept requerido");

  const bd = normalizeBusinessDate(businessDate);

  // Validar que el comité exista y esté activo
  const committee = await Committee.findById(committeeId).lean();
  if (!committee) throw new Error("Comité no encontrado");
  if (!committee.isActive) throw new Error("El comité está inactivo");

  // Validar el expenseId si se proveyó
  let resolvedExpenseId = expenseId;
  if (expenseId) {
    const Expense = require("../../../../../models/Expense");
    const expense = await Expense.findById(expenseId).lean();
    if (!expense) throw new Error("Expense no encontrado");
    if (expense.status !== "ACTIVE")
      throw new Error("Solo se puede vincular un Expense ACTIVE al comité");

    // Si no se pasó amount explícito, usar el del Expense
    // (el amount del ledger puede diferir del Expense si es un pago parcial)
  }

  // Verificar saldo disponible
  const currentBalance = await _getCommitteeBalance(committeeId);
  const projectedBalance = currentBalance - amount;

  if (projectedBalance < 0 && !allowNegativeBalance) {
    throw new Error(
      `El comité "${committee.name}" no tiene saldo suficiente. ` +
        `Saldo actual: ₡${currentBalance.toLocaleString("es-CR")}, ` +
        `Monto del gasto: ₡${amount.toLocaleString("es-CR")}, ` +
        `Saldo resultante: ₡${projectedBalance.toLocaleString("es-CR")}. ` +
        "Usa allowNegativeBalance=true si deseas continuar de todas formas.",
    );
  }

  const mongoSession = await mongoose.startSession();
  let ledgerEntry;
  try {
    await mongoSession.withTransaction(async () => {
      // Opción B: crear el Expense primero si se proveyó expenseData
      if (!resolvedExpenseId && expenseData) {
        const Expense = require("../../../../../models/Expense");
        const CashSession = require("../../../../../models/CashSession");
        const Category = require("../../../../../models/Category");

        let categorySnapshot;
        if (expenseData.categoryId) {
          const cat = await Category.findById(expenseData.categoryId)
            .select("name")
            .lean();
          if (!cat) throw new Error("Categoría no existe");
          categorySnapshot = cat.name;
        }

        let resolvedSessionId;
        if (expenseData.cashSessionId) {
          const sess = await CashSession.findById(expenseData.cashSessionId);
          if (!sess) throw new Error("cashSessionId no existe");
          resolvedSessionId = sess._id;
        }

        const [createdExpense] = await Expense.create(
          [
            {
              businessDate: bd,
              cashSessionId: resolvedSessionId,
              scope: expenseData.cashSessionId ? "SESSION" : "EXTERNAL",
              activityId: activityId || expenseData.activityId || undefined,
              categoryId: expenseData.categoryId || undefined,
              categorySnapshot,
              concept,
              detail: expenseData.detail,
              amount,
              paymentMethod: expenseData.paymentMethod || "CASH",
              expenseType: expenseData.expenseType || "REGULAR",
              isAssetPurchase: expenseData.isAssetPurchase || false,
              vendor: expenseData.vendor,
              receiptUrl: expenseData.receiptUrl,
              status: "ACTIVE",
              createdBy: userId(ctx),
            },
          ],
          { session: mongoSession },
        );
        resolvedExpenseId = createdExpense._id;
      }

      const runningBalance = projectedBalance;
      const warningFlag = projectedBalance < 0 ? " ⚠️ SALDO NEGATIVO" : "";

      [ledgerEntry] = await CommitteeLedgerEntry.create(
        [
          {
            committeeId,
            committeeNameSnapshot: committee.name,
            entryType: "EXPENSE_DEBIT",
            businessDate: bd,
            creditAmount: 0,
            debitAmount: amount,
            runningBalance,
            percentageSnapshot: committee.distributionPercentage,
            description: `${concept}${warningFlag}`,
            notes,
            activityId: activityId || undefined,
            expenseId: resolvedExpenseId || undefined,
            status: "ACTIVE",
            createdBy: userId(ctx),
          },
        ],
        { session: mongoSession },
      );
    });
  } finally {
    await mongoSession.endSession();
  }

  return ledgerEntry;
}

// ─── Consultas de ledger y estado de cuenta ───────────────────────────────────

/**
 * getCommitteeLedger — Estado de cuenta detallado de un comité.
 * Incluye todos los movimientos ordenados por fecha de creación.
 */
async function getCommitteeLedger(
  { committeeId, dateFrom, dateTo, entryType } = {},
  ctx,
) {
  requireAuth(ctx);
  if (!committeeId) throw new Error("committeeId requerido");

  const q = { committeeId, status: "ACTIVE" };
  if (dateFrom || dateTo) {
    q.businessDate = {};
    if (dateFrom)
      q.businessDate.$gte = normalizeBusinessDate(dateFrom, "dateFrom");
    if (dateTo) q.businessDate.$lte = normalizeBusinessDate(dateTo, "dateTo");
  }
  if (entryType) q.entryType = entryType;

  const entries = await CommitteeLedgerEntry.find(q)
    .sort({ createdAt: 1 })
    .lean();

  const committee = await Committee.findById(committeeId).lean();
  const currentBalance = await _getCommitteeBalance(committeeId);

  // Calcular totales
  const totalCredits = entries.reduce((s, e) => s + (e.creditAmount || 0), 0);
  const totalDebits = entries.reduce((s, e) => s + (e.debitAmount || 0), 0);

  return {
    committee: { ...committee, id: String(committee._id) },
    entries: entries.map((e) => ({ ...e, id: String(e._id) })),
    currentBalance,
    totalCredits,
    totalDebits,
    entryCount: entries.length,
  };
}

/**
 * getCommitteeBudgetSummary — Resumen del presupuesto de un comité específico.
 */
async function getCommitteeBudgetSummary({ committeeId }, ctx) {
  requireAuth(ctx);
  if (!committeeId) throw new Error("committeeId requerido");

  const committee = await Committee.findById(committeeId).lean();
  if (!committee) throw new Error("Comité no encontrado");

  const entries = await CommitteeLedgerEntry.find({
    committeeId,
    status: "ACTIVE",
  }).lean();

  const initialAllocation = entries
    .filter((e) => e.entryType === "INITIAL_ALLOCATION")
    .reduce((s, e) => s + e.creditAmount, 0);

  const utilityDistributions = entries
    .filter((e) => e.entryType === "UTILITY_DISTRIBUTION")
    .reduce((s, e) => s + e.creditAmount, 0);

  const manualCredits = entries
    .filter((e) => e.entryType === "MANUAL_CREDIT")
    .reduce((s, e) => s + e.creditAmount, 0);

  const expenseDebits = entries
    .filter((e) => e.entryType === "EXPENSE_DEBIT")
    .reduce((s, e) => s + e.debitAmount, 0);

  const manualDebits = entries
    .filter((e) => e.entryType === "MANUAL_DEBIT")
    .reduce((s, e) => s + e.debitAmount, 0);

  const totalCredits = initialAllocation + utilityDistributions + manualCredits;
  const totalDebits = expenseDebits + manualDebits;
  const currentBalance = totalCredits - totalDebits;

  return {
    committee: { ...committee, id: String(committee._id) },
    initialAllocation,
    utilityDistributions,
    manualCredits,
    totalCredits,
    expenseDebits,
    manualDebits,
    totalDebits,
    currentBalance,
    entryCount: entries.length,
    distributionPercentage: committee.distributionPercentage,
  };
}

/**
 * getAllCommitteeBudgets — Resumen de presupuesto de todos los comités activos.
 * Ideal para el panel de control general.
 */
async function getAllCommitteeBudgets(ctx) {
  requireAuth(ctx);

  const committees = await Committee.find({ isActive: true })
    .sort({ displayOrder: 1 })
    .lean();

  const summaries = await Promise.all(
    committees.map((c) =>
      getCommitteeBudgetSummary({ committeeId: String(c._id) }, ctx),
    ),
  );

  const totalBudget = summaries.reduce((s, c) => s + c.totalCredits, 0);
  const totalExpended = summaries.reduce((s, c) => s + c.totalDebits, 0);
  const totalAvailable = summaries.reduce((s, c) => s + c.currentBalance, 0);

  // Verificar si existe saldo inicial activo
  const initialization = await BudgetInitialization.findOne({
    status: "ACTIVE",
  }).lean();

  return {
    committees: summaries,
    totalBudget,
    totalExpended,
    totalAvailable,
    isInitialized: !!initialization,
    initialization: initialization
      ? { ...initialization, id: String(initialization._id) }
      : null,
  };
}

/**
 * getActivitySettlement — Obtiene el settlement de una actividad (si existe).
 */
async function getActivitySettlement({ activityId }, ctx) {
  requireAuth(ctx);
  if (!activityId) throw new Error("activityId requerido");
  return ActivitySettlement.findOne({
    activityId: new mongoose.Types.ObjectId(String(activityId)),
    status: "ACTIVE",
  }).lean();
}

/**
 * getAllActivitySettlements — Lista todos los settlements.
 */
async function getAllActivitySettlements({ dateFrom, dateTo } = {}, ctx) {
  requireAuth(ctx);
  const q = { status: "ACTIVE" };
  if (dateFrom || dateTo) {
    q.businessDate = {};
    if (dateFrom)
      q.businessDate.$gte = normalizeBusinessDate(dateFrom, "dateFrom");
    if (dateTo) q.businessDate.$lte = normalizeBusinessDate(dateTo, "dateTo");
  }
  return ActivitySettlement.find(q).sort({ businessDate: -1 }).lean();
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * _getCommitteeBalance — Calcula el saldo actual de un comité sumando el ledger.
 * Si se pasa mongoSession, lo usa para participar en la transacción activa.
 */
async function _getCommitteeBalance(committeeId, mongoSession = null) {
  const q = CommitteeLedgerEntry.aggregate([
    {
      $match: {
        committeeId: new mongoose.Types.ObjectId(String(committeeId)),
        status: "ACTIVE",
      },
    },
    {
      $group: {
        _id: null,
        totalCredits: { $sum: "$creditAmount" },
        totalDebits: { $sum: "$debitAmount" },
      },
    },
  ]);
  if (mongoSession) q.session(mongoSession);

  const result = await q;
  if (!result.length) return 0;
  return (result[0].totalCredits || 0) - (result[0].totalDebits || 0);
}

/**
 * _calculateDistributions — Calcula los montos por comité dado un total.
 * Usa la fórmula de "redondeo al último centavo" para evitar pérdidas por redondeo.
 */
function _calculateDistributions(committees, totalAmount) {
  if (totalAmount === 0) {
    return committees.map((c) => ({
      committeeId: c._id,
      committeeName: c.name,
      committeeSlug: c.slug,
      percentage: c.distributionPercentage,
      amount: 0,
    }));
  }

  let remaining = totalAmount;
  const distributions = committees.map((c, idx) => {
    let amount;
    if (idx === committees.length - 1) {
      // El último comité recibe el remanente para evitar pérdida por redondeo
      amount = remaining;
    } else {
      amount =
        Math.round(totalAmount * (c.distributionPercentage / 100) * 100) / 100;
      remaining -= amount;
    }
    return {
      committeeId: c._id,
      committeeName: c.name,
      committeeSlug: c.slug,
      percentage: c.distributionPercentage,
      amount,
    };
  });

  return distributions;
}

/**
 * _sumActivePercentages — Suma los porcentajes de los comités activos.
 */
async function _sumActivePercentages() {
  const result = await Committee.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: null, total: { $sum: "$distributionPercentage" } } },
  ]);
  return result[0]?.total || 0;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Comités
  seedCommittees,
  createCommittee,
  getCommittees,
  getCommitteeDistributionConfig,
  updateCommitteeDistributionConfig,

  // Saldo inicial
  initializeCommitteeBudgets,
  getBudgetInitialization,

  // Utilidad de actividades
  calculateActivityProfit,
  getActivitiesPendingSettlement,
  distributeActivityProfit,
  getActivitySettlement,
  getAllActivitySettlements,

  // Gastos por comité
  recordCommitteeExpense,

  // Consultas
  getCommitteeLedger,
  getCommitteeBudgetSummary,
  getAllCommitteeBudgets,

  // Helpers exportados para uso en otros servicios
  _getCommitteeBalance,
  _calculateDistributions,
};
