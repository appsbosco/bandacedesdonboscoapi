/**
 * presentations - Service
 * Lógica de negocio + DB (Mongoose)
 */
const PerformanceAttendance = require("../../../../../models/PerformanceAttendance");
const Hotel = require("../../../../../models/Hotel");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

/**
 * PerformanceAttendance
 */
async function createPerformanceAttendance(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de asistencia requeridos");

  const created = await PerformanceAttendance.create(input);

  const populated = await PerformanceAttendance.findById(created._id)
    .populate("user")
    .populate("hotel")
    .populate("event");

  return populated || created;
}

async function updatePerformanceAttendance(id, input, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de asistencia requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const exists = await PerformanceAttendance.findById(id);
  if (!exists) throw new Error("Registro de asistencia no existe");

  const updated = await PerformanceAttendance.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  })
    .populate("user")
    .populate("hotel")
    .populate("event");

  if (!updated) throw new Error("Registro de asistencia no existe");
  return updated;
}

async function deletePerformanceAttendance(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de asistencia requerido");

  const deleted = await PerformanceAttendance.findByIdAndDelete(id);
  if (!deleted) throw new Error("Registro de asistencia no existe");

  return "Performance Attendance deleted successfully!";
}

async function getPerformanceAttendanceByEvent(event, ctx) {
  requireAuth(ctx);

  if (!event) throw new Error("event requerido");

  const records = await PerformanceAttendance.find({ event })
    .populate("user")
    .populate("hotel")
    .populate("event");

  return records;
}

/**
 * Hotel
 */
async function createHotel(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de hotel requeridos");

  const created = await Hotel.create(input);
  return created;
}

async function updateHotel(id, input, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de hotel requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const exists = await Hotel.findById(id);
  if (!exists) throw new Error("Hotel no existe");

  const updated = await Hotel.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  });

  if (!updated) throw new Error("Hotel no existe");
  return updated;
}

async function deleteHotel(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de hotel requerido");

  const deleted = await Hotel.findByIdAndDelete(id);
  if (!deleted) throw new Error("Hotel no existe");

  return "Hotel deleted successfully!";
}

async function getHotel(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de hotel requerido");

  const hotel = await Hotel.findById(id);
  if (!hotel) throw new Error("Hotel no existe");

  return hotel;
}

async function getHotels(ctx) {
  requireAuth(ctx);

  const hotels = await Hotel.find({});
  return hotels;
}

module.exports = {
  requireAuth,

  // PerformanceAttendance
  createPerformanceAttendance,
  updatePerformanceAttendance,
  deletePerformanceAttendance,
  getPerformanceAttendanceByEvent,

  // Hotel
  createHotel,
  updateHotel,
  deleteHotel,
  getHotel,
  getHotels,
};
