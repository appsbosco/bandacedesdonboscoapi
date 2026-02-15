/**
 * payments - Service
 * Lógica de negocio + DB (Mongoose)
 */
const PaymentEvent = require("../../../../../models/PaymentEvent");
const Payment = require("../../../../../models/Payment");
const User = require("../../../../../models/User");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

function normalizeDate(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error("Fecha inválida");
  return d;
}

async function createPaymentEvent(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de evento de pago requeridos");
  const { name, date, description } = input;

  if (!name) throw new Error("Nombre requerido");
  const parsedDate = date ? normalizeDate(date) : null;

  const created = await PaymentEvent.create({
    name,
    date: parsedDate || date,
    description,
  });

  return created;
}

async function createPayment(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de pago requeridos");

  const { user, paymentEvent, amount, description, date } = input;

  if (!user) throw new Error("Usuario requerido");
  if (!paymentEvent) throw new Error("Evento de pago requerido");
  if (amount === undefined || amount === null)
    throw new Error("Monto requerido");

  const userDoc = await User.findById(user);
  if (!userDoc) throw new Error("User not found");

  const eventDoc = await PaymentEvent.findById(paymentEvent);
  if (!eventDoc) throw new Error("Payment event not found");

  const parsedDate = normalizeDate(date);

  const created = await Payment.create({
    user: userDoc._id,
    paymentEvent: eventDoc._id,
    amount,
    description,
    date: parsedDate,
  });

  return created;
}

async function updatePayment(paymentId, input, ctx) {
  requireAuth(ctx);

  if (!paymentId) throw new Error("paymentId requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const { amount } = input;
  if (amount === undefined || amount === null)
    throw new Error("Monto requerido");

  const updated = await Payment.findByIdAndUpdate(
    paymentId,
    { $set: { amount } },
    { new: true, runValidators: true },
  );

  if (!updated) throw new Error("Payment not found");
  return updated;
}

async function deletePayment(paymentId, ctx) {
  requireAuth(ctx);

  if (!paymentId) throw new Error("paymentId requerido");

  const deleted = await Payment.findByIdAndDelete(paymentId);
  if (!deleted) throw new Error("Payment not found");

  return deleted;
}

async function getPaymentEvents(ctx) {
  requireAuth(ctx);

  const events = await PaymentEvent.find({});
  return events;
}

async function getPaymentsByEvent(paymentEvent, ctx) {
  requireAuth(ctx);

  if (!paymentEvent) throw new Error("paymentEvent requerido");

  const payments = await Payment.find({ paymentEvent })
    .populate({
      path: "user",
      select: "name firstSurName secondSurName instrument role",
    })
    .populate({
      path: "paymentEvent",
      select: "name description date",
    });

  return payments;
}

module.exports = {
  requireAuth,
  createPaymentEvent,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentEvents,
  getPaymentsByEvent,
};
