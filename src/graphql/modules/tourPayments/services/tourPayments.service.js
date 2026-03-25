/**
 * src/graphql/modules/tourPayments/services/tourPayments.service.js
 *
 * Módulo financiero completo para participantes de gira.
 *
 * Flujo:
 *   TourParticipant (importado)
 *     → createFinancialAccount
 *     → assignPaymentPlan  (genera ParticipantInstallments)
 *     → registerPayment    (distribuye en cuotas, actualiza cuenta)
 *     → calculateFinancialStatus (derivado automático)
 *
 * Todas las operaciones mantienen coherencia entre:
 *   TourPayment ↔ ParticipantInstallment ↔ ParticipantFinancialAccount
 */
"use strict";

const mongoose = require("mongoose");

const Tour = require("../../../../../models/Tour");
const TourParticipant = require("../../../../../models/TourParticipant");
const TourPaymentPlan = require("../../../../../models/TourPaymentPlan");
const ParticipantFinancialAccount = require("../../../../../models/ParticipantFinancialAccount");
const ParticipantInstallment = require("../../../../../models/ParticipantInstallment");
const TourPayment = require("../../../../../models/TourPayment");
const { canManageTourFinance } = require("../../../shared/tourAuth");

// ─── Auth guards ──────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  return user;
}

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (!canManageTourFinance(user)) {
    throw new Error(
      "No autorizado: se requiere rol Admin, Director, Subdirector o CEDES Financiero",
    );
  }
  return user;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Determina el financialStatus de una cuenta según el estado real de sus cuotas
 * y el total pagado vs el monto asignado.
 *
 * Reglas:
 *  - PAID       → totalPaid >= finalAmount y finalAmount > 0
 *  - OVERPAID   → totalPaid > finalAmount
 *  - PENDING    → totalPaid === 0
 *  - LATE       → hay cuotas LATE con remainingAmount > 0
 *  - PARTIAL    → hay cuotas PARTIAL vencidas
 *  - UP_TO_DATE → todas las cuotas vencidas están cubiertas
 */
function deriveFinancialStatus(account, installments, now = new Date()) {
  const { finalAmount, totalPaid } = account;

  if (totalPaid >= finalAmount && finalAmount > 0) {
    return totalPaid > finalAmount ? "OVERPAID" : "PAID";
  }
  if (totalPaid === 0) return "PENDING";

  const dueInstallments = installments.filter(
    (i) => i.dueDate <= now && i.status !== "WAIVED",
  );

  if (dueInstallments.length === 0) return "UP_TO_DATE";

  const hasLate = dueInstallments.some(
    (i) => i.remainingAmount > 0 && i.dueDate < now,
  );

  if (hasLate) {
    // Si todas las cuotas vencidas tienen algo pagado → PARTIAL, sino LATE
    const anyUnpaid = dueInstallments.some((i) => i.paidAmount === 0);
    return anyUnpaid ? "LATE" : "PARTIAL";
  }

  return "UP_TO_DATE";
}

/**
 * Distribuye un monto de pago entre cuotas pendientes (FIFO por order).
 * Devuelve: { distributions: [{installment, amountApplied}], unapplied }
 */
async function distributePayment(participantId, tourId, paymentAmount) {
  // Obtener cuotas no pagadas, ordenadas por order (FIFO)
  const pendingInstallments = await ParticipantInstallment.find({
    participant: participantId,
    tour: tourId,
    status: { $in: ["PENDING", "PARTIAL", "LATE"] },
  }).sort({ order: 1 });

  const distributions = [];
  let remaining = paymentAmount;

  for (const installment of pendingInstallments) {
    if (remaining <= 0) break;

    const gap = installment.remainingAmount;
    const toApply = Math.min(remaining, gap);

    installment.paidAmount += toApply;
    installment.remainingAmount = Math.max(
      0,
      installment.amount - installment.paidAmount,
    );
    installment.syncStatus();

    await installment.save();

    distributions.push({
      installment: installment._id,
      amountApplied: toApply,
    });

    remaining -= toApply;
  }

  return { distributions, unapplied: Math.max(0, remaining) };
}

/**
 * Recalcula y persiste el estado de la cuenta financiera de un participante.
 * Llamar después de cualquier cambio en pagos o cuotas.
 */
async function refreshFinancialAccount(participantId, tourId) {
  const account = await ParticipantFinancialAccount.findOne({
    participant: participantId,
    tour: tourId,
  });
  if (!account) return null;

  // Sumar todos los pagos registrados
  const paymentsAgg = await TourPayment.aggregate([
    {
      $match: {
        participant: new mongoose.Types.ObjectId(participantId),
        tour: new mongoose.Types.ObjectId(tourId),
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  account.totalPaid = paymentsAgg[0]?.total ?? 0;

  account.recalculateBalance();

  const installments = await ParticipantInstallment.find({
    participant: participantId,
    tour: tourId,
  });

  account.financialStatus = deriveFinancialStatus(account, installments);

  await account.save();
  return account;
}

// ─── populate helpers ─────────────────────────────────────────────────────────

function populatePayment(query) {
  return query
    .populate({
      path: "participant",
      populate: { path: "linkedUser", select: "name firstSurName email" },
    })
    .populate("registeredBy", "name firstSurName")
    .populate("appliedTo.installment");
}

function populateAccount(query) {
  return query
    .populate("participant")
    .populate("paymentPlan")
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");
}

function populateInstallment(query) {
  return query.populate("participant").populate("paymentPlan");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT PLAN CRUD
// ═══════════════════════════════════════════════════════════════════════════════

async function createPaymentPlan(input, ctx) {
  const admin = requireAdmin(ctx);

  if (!input?.tourId) throw new Error("ID de gira requerido");
  if (!input?.name) throw new Error("Nombre del plan requerido");
  if (!Array.isArray(input.installments) || input.installments.length === 0) {
    throw new Error("El plan debe tener al menos una cuota");
  }

  const tour = await Tour.findById(input.tourId);
  if (!tour) throw new Error("Gira no encontrada");

  // Validar cuotas
  input.installments.forEach((inst, idx) => {
    if (!inst.dueDate)
      throw new Error(`Cuota ${idx + 1}: fecha de vencimiento requerida`);
    if (inst.amount == null || inst.amount < 0)
      throw new Error(`Cuota ${idx + 1}: monto inválido`);
    if (!inst.concept) throw new Error(`Cuota ${idx + 1}: concepto requerido`);
  });

  // Normalizar orden
  const installments = input.installments.map((inst, idx) => ({
    order: Number.isInteger(inst.order) ? inst.order : idx + 1,
    dueDate: new Date(inst.dueDate),
    amount: inst.amount,
    concept: inst.concept,
  }));
  installments.sort((a, b) => a.order - b.order);

  const plan = await TourPaymentPlan.create({
    tour: input.tourId,
    name: input.name,
    currency: input.currency || "USD",
    installments,
    isDefault: input.isDefault ?? true,
    createdBy: admin._id || admin.id,
  });

  await plan.populate("tour");

  return plan;
}

async function getPaymentPlan(id, ctx) {
  requireAuth(ctx);
  const plan = await TourPaymentPlan.findById(id).populate("tour");
  if (!plan) throw new Error("Plan de pagos no encontrado");
  return plan;
}

async function getPaymentPlansByTour(tourId, ctx) {
  requireAuth(ctx);
  if (!tourId) throw new Error("ID de gira requerido");
  return TourPaymentPlan.find({ tour: tourId })
    .populate("tour")
    .sort({ createdAt: 1 });
}

async function updatePaymentPlan(id, input, ctx) {
  const admin = requireAdmin(ctx);
  if (!id) throw new Error("ID de plan requerido");

  const plan = await TourPaymentPlan.findById(id);
  if (!plan) throw new Error("Plan de pagos no encontrado");

  const allowed = { updatedBy: admin._id || admin.id };
  if (input.name !== undefined) allowed.name = input.name;
  if (input.currency !== undefined) allowed.currency = input.currency;
  if (input.isDefault !== undefined) allowed.isDefault = input.isDefault;

  if (Array.isArray(input.installments) && input.installments.length > 0) {
    allowed.installments = input.installments.map((inst, idx) => ({
      order: inst.order ?? idx + 1,
      dueDate: new Date(inst.dueDate),
      amount: inst.amount,
      concept: inst.concept,
    }));
  }

  const updated = await TourPaymentPlan.findByIdAndUpdate(id, allowed, {
    new: true,
    runValidators: true,
  }).populate("tour");

  if (!updated) throw new Error("No se pudo actualizar el plan");
  return updated;
}

async function deletePaymentPlan(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de plan requerido");

  // Verificar si hay cuentas usando este plan
  const inUse = await ParticipantFinancialAccount.countDocuments({
    paymentPlan: id,
  });
  if (inUse > 0) {
    throw new Error(
      `No se puede eliminar: el plan está asignado a ${inUse} participante(s)`,
    );
  }

  await TourPaymentPlan.findByIdAndDelete(id);
  return "Plan de pagos eliminado correctamente";
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCIAL ACCOUNT CRUD
// ═══════════════════════════════════════════════════════════════════════════════

async function createFinancialAccount(input, ctx) {
  const admin = requireAdmin(ctx);

  if (!input?.tourId) throw new Error("ID de gira requerido");
  if (!input?.participantId) throw new Error("ID de participante requerido");

  const [tour, participant] = await Promise.all([
    Tour.findById(input.tourId),
    TourParticipant.findById(input.participantId),
  ]);

  if (!tour) throw new Error("Gira no encontrada");
  if (!participant) throw new Error("Participante no encontrado");
  if (participant.tour.toString() !== input.tourId.toString()) {
    throw new Error("El participante no pertenece a esta gira");
  }

  const existing = await ParticipantFinancialAccount.findOne({
    tour: input.tourId,
    participant: input.participantId,
  });
  if (existing)
    throw new Error(
      "El participante ya tiene una cuenta financiera en esta gira",
    );

  const baseAmount = input.baseAmount ?? 0;
  const discount = input.discount ?? 0;
  const scholarship = input.scholarship ?? 0;

  const account = new ParticipantFinancialAccount({
    tour: input.tourId,
    participant: input.participantId,
    paymentPlan: input.paymentPlanId || null,
    currency: input.currency || "USD",
    baseAmount,
    discount,
    scholarship,
    createdBy: admin._id || admin.id,
  });

  account.recalculateFinalAmount();
  account.recalculateBalance();

  await account.save();
  return populateAccount(ParticipantFinancialAccount.findById(account._id));
}

async function getFinancialAccount(participantId, tourId, ctx) {
  requireAuth(ctx);
  if (!participantId) throw new Error("ID de participante requerido");
  if (!tourId) throw new Error("ID de gira requerido");

  const account = await populateAccount(
    ParticipantFinancialAccount.findOne({
      participant: participantId,
      tour: tourId,
    }),
  );
  if (!account) throw new Error("Cuenta financiera no encontrada");
  return account;
}

async function getFinancialAccountsByTour(tourId, ctx, filters = {}) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const query = { tour: tourId };
  if (filters.financialStatus) query.financialStatus = filters.financialStatus;

  return populateAccount(
    ParticipantFinancialAccount.find(query).sort({ createdAt: 1 }),
  );
}

async function updateFinancialAccount(id, input, ctx) {
  const admin = requireAdmin(ctx);
  if (!id) throw new Error("ID de cuenta requerido");

  const account = await ParticipantFinancialAccount.findById(id);
  if (!account) throw new Error("Cuenta financiera no encontrada");

  const allowed = { updatedBy: admin._id || admin.id };

  if (input.baseAmount !== undefined) allowed.baseAmount = input.baseAmount;
  if (input.discount !== undefined) allowed.discount = input.discount;
  if (input.scholarship !== undefined) allowed.scholarship = input.scholarship;
  if (input.currency !== undefined) allowed.currency = input.currency;
  if (input.paymentPlanId !== undefined)
    allowed.paymentPlan = input.paymentPlanId || null;

  // Manejar ajuste adicional
  if (input.adjustment) {
    const currentAdjustments = account.adjustments || [];
    currentAdjustments.push({
      concept: input.adjustment.concept,
      amount: input.adjustment.amount,
      appliedBy: admin._id || admin.id,
      notes: input.adjustment.notes,
    });
    allowed.adjustments = currentAdjustments;
  }

  // Aplicar los campos al objeto para recalcular
  Object.assign(account, allowed);
  account.recalculateFinalAmount();
  account.recalculateBalance();

  // Recalcular status
  const installments = await ParticipantInstallment.find({
    participant: account.participant,
    tour: account.tour,
  });
  account.financialStatus = deriveFinancialStatus(account, installments);

  await account.save();
  return populateAccount(ParticipantFinancialAccount.findById(id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Asigna un plan de pagos a un participante, generando sus cuotas individuales.
 * Si ya tiene cuotas del plan anterior, las reemplaza (solo si no hay pagos).
 */
async function assignPaymentPlan(participantId, tourId, planId, ctx) {
  const admin = requireAdmin(ctx);

  const [participant, plan, account] = await Promise.all([
    TourParticipant.findById(participantId),
    TourPaymentPlan.findById(planId),
    ParticipantFinancialAccount.findOne({
      participant: participantId,
      tour: tourId,
    }),
  ]);

  if (!participant) throw new Error("Participante no encontrado");
  if (!plan) throw new Error("Plan de pagos no encontrado");
  if (!account)
    throw new Error(
      "El participante no tiene cuenta financiera. Créala primero.",
    );

  if (plan.tour.toString() !== tourId.toString()) {
    throw new Error("El plan no pertenece a esta gira");
  }

  // No permitir reasignación si ya hay pagos registrados
  const paymentsCount = await TourPayment.countDocuments({
    participant: participantId,
    tour: tourId,
  });
  if (paymentsCount > 0) {
    throw new Error(
      "No se puede reasignar el plan: el participante ya tiene pagos registrados. " +
        "Edita las cuotas individualmente.",
    );
  }

  // Eliminar cuotas previas del participante en esta gira
  await ParticipantInstallment.deleteMany({
    participant: participantId,
    tour: tourId,
  });

  // Calcular factor de escala si el monto de la cuenta difiere del plan
  // (para ajustar cuotas proporcionalmente en caso de becas/descuentos)
  const scaleFactor =
    plan.totalAmount > 0 ? account.finalAmount / plan.totalAmount : 1;

  // Crear cuotas individuales desde las plantillas del plan
  const installmentDocs = plan.installments.map((template) => ({
    tour: tourId,
    participant: participantId,
    paymentPlan: planId,
    order: template.order,
    dueDate: template.dueDate,
    amount: Math.round(template.amount * scaleFactor * 100) / 100,
    concept: template.concept,
    paidAmount: 0,
    remainingAmount: Math.round(template.amount * scaleFactor * 100) / 100,
    status: "PENDING",
    createdBy: admin._id || admin.id,
  }));

  await ParticipantInstallment.insertMany(installmentDocs);

  // Actualizar la cuenta con la referencia al plan
  account.paymentPlan = planId;
  account.updatedBy = admin._id || admin.id;
  await account.save();

  return ParticipantInstallment.find({
    participant: participantId,
    tour: tourId,
  })
    .sort({ order: 1 })
    .populate("paymentPlan");
}

/**
 * Asigna el plan por defecto de una gira a todos los participantes
 * que tienen cuenta financiera pero no tienen cuotas asignadas.
 * Útil después de importación masiva.
 */
async function assignDefaultPlanToAll(tourId, ctx) {
  requireAdmin(ctx);

  const plan = await TourPaymentPlan.findOne({ tour: tourId, isDefault: true });
  if (!plan) throw new Error("No existe un plan por defecto para esta gira");

  const accounts = await ParticipantFinancialAccount.find({ tour: tourId });
  let assigned = 0;
  let skipped = 0;

  for (const account of accounts) {
    const hasInstallments = await ParticipantInstallment.countDocuments({
      participant: account.participant,
      tour: tourId,
    });
    if (hasInstallments > 0) {
      skipped++;
      continue;
    }

    try {
      await assignPaymentPlan(account.participant, tourId, plan._id, ctx);
      assigned++;
    } catch {
      skipped++;
    }
  }

  return { assigned, skipped, total: accounts.length };
}

async function getInstallmentsByParticipant(participantId, tourId, ctx) {
  requireAuth(ctx);
  if (!participantId) throw new Error("ID de participante requerido");

  const query = { participant: participantId };
  if (tourId) query.tour = tourId;

  return populateInstallment(
    ParticipantInstallment.find(query).sort({ order: 1 }),
  );
}

async function updateInstallment(id, input, ctx) {
  const admin = requireAdmin(ctx);
  if (!id) throw new Error("ID de cuota requerido");

  const installment = await ParticipantInstallment.findById(id);
  if (!installment) throw new Error("Cuota no encontrada");

  const allowed = { updatedBy: admin._id || admin.id };
  if (input.dueDate !== undefined) allowed.dueDate = new Date(input.dueDate);
  if (input.amount !== undefined) {
    if (input.amount < 0) throw new Error("El monto no puede ser negativo");
    allowed.amount = input.amount;
  }
  if (input.concept !== undefined) allowed.concept = input.concept;
  if (input.status !== undefined) allowed.status = input.status;

  Object.assign(installment, allowed);
  installment.syncStatus();

  await installment.save();
  await refreshFinancialAccount(installment.participant, installment.tour);

  return populateInstallment(ParticipantInstallment.findById(id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registra un pago real y distribuye automáticamente entre cuotas FIFO.
 */
async function registerPayment(input, ctx) {
  const admin = requireAdmin(ctx);

  if (!input?.tourId) throw new Error("ID de gira requerido");
  if (!input?.participantId) throw new Error("ID de participante requerido");
  if (!input?.amount || input.amount <= 0)
    throw new Error("Monto de pago inválido");

  const [tour, participant, account] = await Promise.all([
    Tour.findById(input.tourId),
    TourParticipant.findById(input.participantId),
    ParticipantFinancialAccount.findOne({
      participant: input.participantId,
      tour: input.tourId,
    }),
  ]);

  if (!tour) throw new Error("Gira no encontrada");
  if (!participant) throw new Error("Participante no encontrado");
  if (!account)
    throw new Error(
      "El participante no tiene cuenta financiera. Créala antes de registrar pagos.",
    );
  if (participant.tour.toString() !== input.tourId.toString()) {
    throw new Error("El participante no pertenece a esta gira");
  }

  // Distribuir el pago entre cuotas pendientes
  const { distributions, unapplied } = await distributePayment(
    input.participantId,
    input.tourId,
    input.amount,
  );

  // Crear el registro de pago
  const payment = await TourPayment.create({
    tour: input.tourId,
    participant: input.participantId,
    linkedUser: participant.linkedUser || null,
    amount: input.amount,
    paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
    method: input.method || "CASH",
    reference: input.reference,
    notes: input.notes,
    appliedTo: distributions,
    unappliedAmount: unapplied,
    registeredBy: admin._id || admin.id,
  });

  // Actualizar cuenta financiera
  await refreshFinancialAccount(input.participantId, input.tourId);

  return populatePayment(TourPayment.findById(payment._id));
}

async function getTourPayments(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  return populatePayment(
    TourPayment.find({ tour: tourId }).sort({ paymentDate: -1, createdAt: -1 }),
  );
}

async function getPaymentsByParticipant(participantId, tourId, ctx) {
  requireAuth(ctx);
  if (!participantId) throw new Error("ID de participante requerido");

  const query = { participant: participantId };
  if (tourId) query.tour = tourId;

  return populatePayment(
    TourPayment.find(query).sort({ paymentDate: -1, createdAt: -1 }),
  );
}

/**
 * Elimina un pago y revierte su efecto sobre las cuotas y cuenta financiera.
 * Operación delicada: solo permitida si el pago no ha sido auditado/cerrado.
 */
async function deleteTourPayment(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de pago requerido");

  const payment = await TourPayment.findById(id);
  if (!payment) throw new Error("Pago no encontrado");

  // Revertir distribución en cuotas
  for (const applied of payment.appliedTo || []) {
    const installment = await ParticipantInstallment.findById(
      applied.installment,
    );
    if (!installment) continue;

    installment.paidAmount = Math.max(
      0,
      installment.paidAmount - applied.amountApplied,
    );
    installment.syncStatus();
    await installment.save();
  }

  await TourPayment.findByIdAndDelete(id);
  await refreshFinancialAccount(payment.participant, payment.tour);

  return "Pago eliminado y cuotas revertidas correctamente";
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK OPERATIONS — para después de importación Excel
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea cuentas financieras para todos los participantes de una gira que aún
 * no tienen cuenta. Pensado para usarse justo después de importar desde Excel.
 */
async function createFinancialAccountsForAll(
  tourId,
  baseAmountInput,
  planId,
  ctx,
) {
  requireAdmin(ctx);

  const participants = await TourParticipant.find({
    tour: tourId,
    status: { $ne: "CANCELLED" },
  });

  if (participants.length === 0) {
    throw new Error("No hay participantes activos en esta gira");
  }

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const participant of participants) {
    const existing = await ParticipantFinancialAccount.findOne({
      tour: tourId,
      participant: participant._id,
    });

    if (existing) {
      skipped++;
      continue;
    }

    try {
      const account = new ParticipantFinancialAccount({
        tour: tourId,
        participant: participant._id,
        paymentPlan: planId || null,
        currency: "USD",
        baseAmount: baseAmountInput,
        discount: 0,
        scholarship: 0,
      });
      account.recalculateFinalAmount();
      account.recalculateBalance();
      await account.save();
      created++;
    } catch (err) {
      errors.push({
        participantId: participant._id.toString(),
        name: `${participant.firstName} ${participant.firstSurname}`,
        error: err.message,
      });
    }
  }

  return { created, skipped, errors, total: participants.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tabla financiera tipo Excel por gira.
 * Devuelve por cada participante: totales + estado por cuota.
 */
async function getFinancialTable(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  // Obtener el plan por defecto para las columnas de la tabla
  const defaultPlan = await TourPaymentPlan.findOne({
    tour: tourId,
    isDefault: true,
  });

  // Obtener todas las cuentas con sus participantes
  const accounts = await ParticipantFinancialAccount.find({ tour: tourId })
    .populate("participant")
    .lean();

  const rows = await Promise.all(
    accounts.map(async (account) => {
      const participant = account.participant;

      const installments = await ParticipantInstallment.find({
        participant: participant._id,
        tour: tourId,
      })
        .sort({ order: 1 })
        .lean();

      const installmentColumns = installments.map((inst) => ({
        installmentId: inst._id.toString(),
        order: inst.order,
        dueDate: inst.dueDate,
        concept: inst.concept,
        amount: inst.amount,
        paidAmount: inst.paidAmount,
        remainingAmount: inst.remainingAmount,
        status: inst.status,
      }));

      console.log("accounts", account);

      return {
        accountId: account._id.toString(),
        participantId: participant._id?.toString() || participant.toString(),
        fullName: participant.firstName
          ? `${participant.firstName} ${participant.firstSurname}`
          : "–",
        identification: participant.identification || "–",
        instrument: participant.instrument || "–",
        finalAmount: account.finalAmount,
        totalPaid: account.totalPaid,
        balance: account.balance,
        overpayment: account.overpayment,
        financialStatus: account.financialStatus,
        installments: installmentColumns,
      };
    }),
  );

  // Columnas de la tabla (basadas en el plan por defecto)
  const columns = defaultPlan
    ? defaultPlan.installments
        .sort((a, b) => a.order - b.order)
        .map((inst) => ({
          order: inst.order,
          dueDate: inst.dueDate,
          concept: inst.concept,
          amount: inst.amount,
        }))
    : [];

  return { tourId, tourName: tour.name, columns, rows };
}

/**
 * Listado general financiero de la gira.
 */
async function getFinancialSummary(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const tourObjId = new mongoose.Types.ObjectId(tourId);

  const [accounts, paymentsAgg, statusCounts] = await Promise.all([
    ParticipantFinancialAccount.countDocuments({ tour: tourId }),
    TourPayment.aggregate([
      { $match: { tour: tourObjId } },
      { $group: { _id: null, totalCollected: { $sum: "$amount" } } },
    ]),
    ParticipantFinancialAccount.aggregate([
      { $match: { tour: tourObjId } },
      { $group: { _id: "$financialStatus", count: { $sum: 1 } } },
    ]),
    // Proyección pendiente
  ]);

  const balanceAgg = await ParticipantFinancialAccount.aggregate([
    { $match: { tour: tourObjId } },
    {
      $group: {
        _id: null,
        totalAssigned: { $sum: "$finalAmount" },
        totalPaid: { $sum: "$totalPaid" },
        totalBalance: { $sum: "$balance" },
      },
    },
  ]);

  const totals = balanceAgg[0] || {
    totalAssigned: 0,
    totalPaid: 0,
    totalBalance: 0,
  };
  const statusMap = {};
  statusCounts.forEach((s) => {
    statusMap[s._id] = s.count;
  });

  return {
    tourId,
    tourName: tour.name,
    totalParticipants: accounts,
    totalAssigned: totals.totalAssigned,
    totalCollected: paymentsAgg[0]?.totalCollected ?? 0,
    totalBalance: totals.totalBalance,
    byStatus: {
      PENDING: statusMap["PENDING"] || 0,
      UP_TO_DATE: statusMap["UP_TO_DATE"] || 0,
      LATE: statusMap["LATE"] || 0,
      PARTIAL: statusMap["PARTIAL"] || 0,
      PAID: statusMap["PAID"] || 0,
      OVERPAID: statusMap["OVERPAID"] || 0,
    },
  };
}

/**
 * Flujo de pagos agrupados por fecha.
 */
async function getPaymentFlow(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tourObjId = new mongoose.Types.ObjectId(tourId);

  const flow = await TourPayment.aggregate([
    { $match: { tour: tourObjId } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$paymentDate" },
        },
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        date: "$_id",
        totalAmount: 1,
        count: 1,
        _id: 0,
      },
    },
  ]);

  // Calcular acumulado
  let cumulative = 0;
  return flow.map((day) => {
    cumulative += day.totalAmount;
    return { ...day, cumulative };
  });
}

/**
 * Participantes con estado financiero específico.
 */
async function getParticipantsByFinancialStatus(tourId, status, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const validStatuses = [
    "PENDING",
    "UP_TO_DATE",
    "LATE",
    "PARTIAL",
    "PAID",
    "OVERPAID",
  ];
  if (status && !validStatuses.includes(status)) {
    throw new Error(
      `Estado financiero inválido. Válidos: ${validStatuses.join(", ")}`,
    );
  }

  const query = { tour: tourId };
  if (status) query.financialStatus = status;

  return populateAccount(
    ParticipantFinancialAccount.find(query)
      .populate({
        path: "participant",
        select: "firstName firstSurname identification email instrument",
      })
      .sort({ financialStatus: 1, createdAt: 1 }),
  );
}

// ─── Self-service ─────────────────────────────────────────────────────────────

const {
  isPrivilegedTourViewer,
  getLinkedTourParticipantOrThrow,
  assertTourSelfServiceEnabled,
  isParentActor,
  getParentChildrenUserIds,
  assertParentCanViewChild,
} = require("../../../shared/tourAuth");

/**
 * Devuelve la cuenta financiera del participante vinculado al usuario autenticado.
 * Usuarios no-privilegiados solo ven su propia cuenta.
 * Requiere que selfServiceAccess.payments esté habilitado en la gira.
 *
 * NOTA: No usar .lean() — el field resolver TourPaymentPlan.installments
 * llama a inst.toObject() que solo existe en documentos Mongoose.
 */
async function getMyTourPaymentAccount(tourId, ctx) {
  const user = requireAuth(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const userId = user._id || user.id;

  // Verificar que el participante existe y está vinculado al usuario
  const participant = await TourParticipant.findOne({
    tour: tourId,
    linkedUser: userId,
  });

  if (!participant) {
    throw new Error(
      "Tu perfil aún no ha sido vinculado como participante de esta gira. " +
      "Contacta al administrador."
    );
  }

  // Verificar self-service (solo si el usuario no es privilegiado)
  if (!isPrivilegedTourViewer(user)) {
    const tour = await Tour.findById(tourId);
    if (!tour) throw new Error("Gira no encontrada");
    assertTourSelfServiceEnabled({ tour, moduleKey: "payments", currentUser: user });
  }

  // No usar .lean() — los field resolvers de TourPaymentPlan usan inst.toObject()
  const account = await ParticipantFinancialAccount.findOne({
    participant: participant._id,
    tour: tourId,
  }).populate("paymentPlan");

  return account || null;
}

/**
 * Devuelve la cuenta financiera de un hijo específico del padre autenticado.
 * Requiere que self-service esté habilitado y que el childUserId sea hijo del padre.
 */
async function getMyChildTourPaymentAccount(tourId, childUserId, ctx) {
  requireAuth(ctx);
  if (!isParentActor(ctx)) throw new Error("Esta consulta es exclusiva para padres de familia");
  if (!tourId) throw new Error("ID de gira requerido");
  if (!childUserId) throw new Error("ID de hijo requerido");

  // Assert the child belongs to this parent
  const childrenIds = await getParentChildrenUserIds(ctx);
  assertParentCanViewChild({ childUserId, parentChildrenIds: childrenIds });

  // Verify self-service is enabled (pass a dummy privileged=false user)
  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");
  assertTourSelfServiceEnabled({ tour, moduleKey: "payments", currentUser: { role: "Parent" } });

  // Find participant linked to the child user
  const participant = await TourParticipant.findOne({ tour: tourId, linkedUser: childUserId });
  if (!participant) return null;

  // No .lean() — field resolvers use inst.toObject()
  const account = await ParticipantFinancialAccount.findOne({
    participant: participant._id,
    tour: tourId,
  }).populate("paymentPlan");

  return account || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Auth
  requireAuth,
  requireAdmin,

  // Payment Plan
  createPaymentPlan,
  getPaymentPlan,
  getPaymentPlansByTour,
  updatePaymentPlan,
  deletePaymentPlan,

  // Financial Account
  createFinancialAccount,
  getFinancialAccount,
  getFinancialAccountsByTour,
  updateFinancialAccount,
  createFinancialAccountsForAll,

  // Installments
  assignPaymentPlan,
  assignDefaultPlanToAll,
  getInstallmentsByParticipant,
  updateInstallment,

  // Payments
  registerPayment,
  getTourPayments,
  getPaymentsByParticipant,
  deleteTourPayment,

  // Reports
  getFinancialTable,
  getFinancialSummary,
  getPaymentFlow,
  getParticipantsByFinancialStatus,

  // Internal (exported for testing)
  refreshFinancialAccount,
  deriveFinancialStatus,

  // Self-service
  getMyTourPaymentAccount,
  getMyChildTourPaymentAccount,
};
