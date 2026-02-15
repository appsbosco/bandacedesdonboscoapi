/**
 * classAttendance - Service
 * Lógica de negocio + DB
 * CommonJS
 */
const User = require("../../../../../models/User");
const AttendanceClass = require("../../../../../models/ClassAttendance");

// Normaliza roles: minúsculas, trim y sin tildes
function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function requireAuth(ctx) {
  const candidate =
    (ctx && ctx.req && ctx.req.user) ||
    (ctx && (ctx.user || ctx.me || ctx.currentUser));

  if (!candidate) throw new Error("No autenticado");

  const userId =
    candidate.id || candidate._id || candidate.userId || candidate.sub;

  if (!userId) throw new Error("No autenticado");

  // Si ya viene con role, listo
  if (candidate.role) return { ...candidate, id: String(userId) };

  // Si NO viene con role, lo cargamos de DB
  const dbUser = await User.findById(userId).lean();
  if (!dbUser) throw new Error("No autenticado");
  if (!dbUser.role) throw new Error("Usuario sin rol asignado");

  return {
    ...candidate,
    id: String(dbUser._id),
    email: dbUser.email,
    role: dbUser.role,
    name: dbUser.name,
  };
}

function requireRole(currentUser, allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  const userRole = normalizeRole(currentUser && currentUser.role);
  const allowed = roles.map(normalizeRole);

  if (!userRole || !allowed.includes(userRole)) {
    // debug útil (podés quitarlo luego)
    console.log(
      "AUTHZ FAIL => userRole:",
      currentUser && currentUser.role,
      "allowed:",
      roles,
    );
    throw new Error("No autorizado");
  }
}

function normalizeDateOnly(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error("Fecha inválida");
  d.setHours(0, 0, 0, 0);
  return d;
}

async function markAttendanceAndPayment(input, ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Instructor de instrumento");

  if (!input) throw new Error("Datos requeridos");
  const { studentId, date, attendanceStatus, justification, paymentStatus } =
    input;

  if (!studentId) throw new Error("studentId requerido");
  if (!date) throw new Error("date requerido");

  const normalizedDate = normalizeDateOnly(date);

  const instructor = await User.findById(currentUser.id);
  if (!instructor) throw new Error("Instructor no existe");

  const students = instructor.students || [];
  const isAssigned = students.some((s) => String(s) === String(studentId));
  if (!isAssigned)
    throw new Error("El estudiante no está asignado a este instructor");

  let attendance = await AttendanceClass.findOne({
    student: studentId,
    instructor: currentUser.id,
    date: normalizedDate,
  });

  if (attendance) {
    attendance.attendanceStatus = attendanceStatus;
    attendance.justification = justification;
    attendance.paymentStatus = paymentStatus;
    await attendance.save();
  } else {
    attendance = await AttendanceClass.create({
      student: studentId,
      instructor: currentUser.id,
      date: normalizedDate,
      attendanceStatus,
      justification,
      paymentStatus,
    });
  }

  const populated = await AttendanceClass.findById(attendance._id)
    .populate("student")
    .populate("instructor");

  return populated || attendance;
}

async function getInstructorStudentsAttendance(date, ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Instructor de instrumento");

  if (!date) throw new Error("date requerido");

  const selectedDate = normalizeDateOnly(date);
  const nextDate = new Date(selectedDate);
  nextDate.setDate(nextDate.getDate() + 1);

  return await AttendanceClass.find({
    instructor: currentUser.id,
    date: { $gte: selectedDate, $lt: nextDate },
  })
    .populate("student")
    .populate("instructor");
}

async function getAllAttendances(ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Admin");

  return await AttendanceClass.find({})
    .populate("student")
    .populate("instructor");
}

module.exports = {
  requireAuth,
  markAttendanceAndPayment,
  getInstructorStudentsAttendance,
  getAllAttendances,
};
