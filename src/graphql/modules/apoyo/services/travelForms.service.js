/**
 * apoyo - Service (travelForms.service.js)
 * Lógica de negocio + DB (Mongoose)
 */

const Apoyo = require("../../../../../models/Apoyo");

// Helper preparado para auth (soft)
function requireAuth(ctx) {
  const me = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // TODO: Activar cuando tu proyecto estandarice el user en ctx
  // if (!me) throw new Error("No autorizado");

  return me;
}

async function addApoyo(input, ctx) {
  requireAuth(ctx);

  if (!input || typeof input !== "object") {
    throw new Error("Invalid apoyo input");
  }

  try {
    const apoyo = new Apoyo(input);
    const saved = await apoyo.save();
    return saved;
  } catch (error) {
    throw new Error(error.message || "Failed to add apoyo");
  }
}

async function getApoyo(ctx) {
  requireAuth(ctx);

  try {
    // Popula children si el schema lo define como ref
    const apoyos = await Apoyo.find({}).populate("children");
    return apoyos;
  } catch (error) {
    throw new Error(error.message || "Failed to fetch apoyo");
  }
}

module.exports = {
  requireAuth,
  addApoyo,
  getApoyo,
};
