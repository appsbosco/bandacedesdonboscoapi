/**
 * exalumnos - Service
 * Lógica de negocio + DB (Mongoose)
 */
const Exalumno = require("../../../../../models/Exalumnos");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

const INSTRUMENT_CAPS = {
  Percusión: 6,
  Mallets: 3,
};

async function enforceInstrumentCapacity(instrument) {
  const cap = INSTRUMENT_CAPS[instrument];
  if (!cap) return;

  const count = await Exalumno.countDocuments({ instrument });
  if (count >= cap) {
    // Mensajes consistentes (corrijo el de Mallets que decía Percusión)
    throw new Error(
      `El cupo para ${instrument} está lleno. No se permiten más inscripciones para ${instrument}.`,
    );
  }
}

async function addExAlumno(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de exalumno requeridos");
  if (!input.instrument) throw new Error("Instrumento requerido");

  await enforceInstrumentCapacity(input.instrument);

  const created = await Exalumno.create(input);
  return created;
}

async function getExAlumnos(ctx) {
  requireAuth(ctx);

  const exalumnos = await Exalumno.find({});
  return exalumnos;
}

module.exports = {
  requireAuth,
  addExAlumno,
  getExAlumnos,
};
