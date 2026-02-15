/**
 * attendance - Service
 * Lógica de negocio + DB (Mongoose)
 */
const Attendance = require("../../../../../models/Attendance");
const User = require("../../../../../models/User");

/**
 * Soft auth helper (preparado para activarse cuando el proyecto fije ctx.user/ctx.me/ctx.currentUser)
 */
function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

async function createAttendance(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de asistencia requeridos");
  if (!input.user) throw new Error("Usuario requerido para la asistencia");
  // if (typeof input.attended !== "boolean") {
  //   throw new Error("El campo 'attended' debe ser boolean");
  // }

  if (typeof input.attended !== "string" || !input.attended.trim()) {
    throw new Error("El campo 'attended' debe ser un string válido");
  }

  const user = await User.findById(input.user);
  if (!user) throw new Error("Usuario no existe");

  const created = await Attendance.create({
    user: user._id,
    date: input.date,
    attended: input.attended,
  });

  const attendance = await Attendance.findById(created._id).populate("user");
  return attendance || created;
}

async function updateAttendance(id, input, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de asistencia requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const exists = await Attendance.findById(id);
  if (!exists) throw new Error("Registro de asistencia no existe");

  // Validación mínima si intentan cambiar el usuario
  if (input.user) {
    const user = await User.findById(input.user);
    if (!user) throw new Error("Usuario no existe");
  }

  const updated = await Attendance.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  }).populate("user");

  if (!updated) throw new Error("Registro de asistencia no existe");
  return updated;
}

async function deleteAttendance(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de asistencia requerido");

  const deleted = await Attendance.findByIdAndDelete(id);
  if (!deleted) throw new Error("Registro de asistencia no existe");

  return "Registro de asistencia eliminado correctamente";
}

async function getAttendance(id, ctx) {
  requireAuth(ctx);

  if (!id) throw new Error("ID de asistencia requerido");

  const attendance = await Attendance.findById(id).populate("user");
  if (!attendance) throw new Error("Registro de asistencia no existe");

  return attendance;
}

async function getAttendanceByUser(userId, ctx) {
  requireAuth(ctx);

  if (!userId) throw new Error("ID de usuario requerido");

  // (Opcional) validar existencia del usuario para mensajes consistentes
  const user = await User.findById(userId);
  if (!user) throw new Error("Usuario no existe");

  const attendanceRecords = await Attendance.find({ user: userId }).populate(
    "user",
  );
  return attendanceRecords;
}

async function getAllAttendance(ctx) {
  requireAuth(ctx);

  const attendanceRecords = await Attendance.find({}).populate("user");
  return attendanceRecords;
}

module.exports = {
  requireAuth,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendance,
  getAttendanceByUser,
  getAllAttendance,
};
