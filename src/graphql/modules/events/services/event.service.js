/**
 * events - Service
 * Lógica de negocio + DB (Mongoose)
 */
const Event = require("../../../../../models/Events");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

async function createEvent(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de evento requeridos");

  const created = await Event.create(input);
  return created;
}

async function updateEvent(id, input, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de evento requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const exists = await Event.findById(id);
  if (!exists) throw new Error("Este evento no existe");

  const updated = await Event.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  });

  if (!updated) throw new Error("Este evento no existe");
  return updated;
}

async function deleteEvent(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de evento requerido");

  const deleted = await Event.findByIdAndDelete(id);
  if (!deleted) throw new Error("Este evento no existe");

  return "Evento eliminado correctamente";
}

async function getEvent(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de evento requerido");

  const event = await Event.findById(id);
  if (!event) throw new Error("Este evento no existe");

  return event;
}

async function getEvents(ctx) {
  requireAuth(ctx);

  const events = await Event.find({});
  return events;
}

module.exports = {
  requireAuth,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  getEvents,
};
