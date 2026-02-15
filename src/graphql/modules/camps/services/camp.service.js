/**
 * camps - Service
 * Lógica de negocio + DB (Mongoose)
 */
const ColorGuardCampRegistration = require("../../../../../models/ColorGuardCamp");

/**
 * Soft auth helper (preparado para activarse cuando el proyecto fije ctx.user/ctx.me/ctx.currentUser)
 */
function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

async function createColorGuardCampRegistration(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de registro requeridos");

  try {
    const created = await ColorGuardCampRegistration.create(input);
    return created;
  } catch (err) {
    // Mensaje consistente + útil
    const msg =
      (err && err.message) || "No se pudo crear el registro del campamento";
    throw new Error(msg);
  }
}

async function getColorGuardCampRegistrations(ctx) {
  requireAuth(ctx);

  try {
    const registrations = await ColorGuardCampRegistration.find({});
    return registrations;
  } catch (err) {
    const msg =
      (err && err.message) || "No se pudo listar los registros del campamento";
    throw new Error(msg);
  }
}

module.exports = {
  requireAuth,
  createColorGuardCampRegistration,
  getColorGuardCampRegistrations,
};
