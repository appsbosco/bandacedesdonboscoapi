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

// Asignar alumno a instructor (el instructor se auto-asigna)
async function assignStudentToInstructor(studentId, ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Instructor de instrumento");

  const student = await User.findById(studentId).lean();
  if (!student) throw new Error("Alumno no encontrado");

  const normalizedStudentRole = normalizeRole(student.role);
  console.log("sTUDENT ROLE:", normalizedStudentRole);
  if (
    normalizedStudentRole !== "integrante bcdb" &&
    normalizedStudentRole !== "principal de seccion" &&
    normalizedStudentRole !== "asistente de seccion" &&
    normalizedStudentRole !== "exalumno"
  )
    throw new Error("El usuario no tiene rol de Alumno");

  // Evitar duplicados
  await User.findByIdAndUpdate(
    currentUser.id,
    { $addToSet: { students: studentId } },
    { new: true },
  );

  // Asignar instructor al alumno
  await User.findByIdAndUpdate(studentId, { instructor: currentUser.id });

  return true;
}

// Desasignar alumno de instructor
async function removeStudentFromInstructor(studentId, ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Instructor de instrumento");

  const instructor = await User.findById(currentUser.id);
  if (!instructor) throw new Error("Instructor no encontrado");

  const isAssigned = instructor.students.some(
    (s) => String(s) === String(studentId),
  );
  if (!isAssigned)
    throw new Error("El alumno no está asignado a este instructor");

  await User.findByIdAndUpdate(currentUser.id, {
    $pull: { students: studentId },
  });

  // Limpiar referencia del alumno
  await User.findByIdAndUpdate(studentId, { $unset: { instructor: "" } });

  return true;
}

// Eliminar alumno completamente (Admin) — borra también su asistencia
async function deleteStudent(studentId, ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Admin");

  const student = await User.findById(studentId).lean();
  if (!student) throw new Error("Alumno no encontrado");

  // Quitar de todos los instructores que lo tengan
  await User.updateMany(
    { students: studentId },
    { $pull: { students: studentId } },
  );

  // Borrar todas sus asistencias
  await AttendanceClass.deleteMany({ student: studentId });

  // Borrar usuario
  await User.findByIdAndDelete(studentId);

  return true;
}

// Alumnos sin instructor asignado (sin clases)
async function getStudentsWithoutInstructor(ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Admin");

  return await User.find({
    role: { $regex: /^alumno$/i },
    $or: [{ instructor: null }, { instructor: { $exists: false } }],
  }).lean();
}

// Asistencia general de un alumno (Admin)
async function getStudentAttendanceSummary(studentId, ctx) {
  const currentUser = await requireAuth(ctx);
  requireRole(currentUser, "Admin");

  const attendances = await AttendanceClass.find({ student: studentId })
    .populate("student")
    .populate("instructor")
    .sort({ date: -1 });

  const total = attendances.length;
  const present = attendances.filter(
    (a) => a.attendanceStatus === "Presente",
  ).length;
  const justifiedAbsence = attendances.filter(
    (a) => a.attendanceStatus === "Ausencia Justificada",
  ).length;
  const unjustifiedAbsence = attendances.filter(
    (a) => a.attendanceStatus === "Ausencia No Justificada",
  ).length;

  return {
    studentId,
    total,
    present,
    justifiedAbsence,
    unjustifiedAbsence,
    attendanceRate: total > 0 ? ((present / total) * 100).toFixed(2) : "0.00",
    records: attendances,
  };
}

module.exports = {
  requireAuth,
  markAttendanceAndPayment,
  getInstructorStudentsAttendance,
  getAllAttendances,
  assignStudentToInstructor,
  removeStudentFromInstructor,
  deleteStudent,
  getStudentsWithoutInstructor,
  getStudentAttendanceSummary,
};
