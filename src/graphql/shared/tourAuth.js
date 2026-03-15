/**
 * src/graphql/shared/tourAuth.js
 *
 * Helpers de autorización centralizados para el módulo de giras.
 * Usados por tour.service.js y sub-módulos (tourPayments, tourDocuments, etc.)
 */

const TourParticipant = require("../../../models/TourParticipant");
const Parent = require("../../../models/Parents");

// ─── Roles privilegiados (admin-level) ───────────────────────────────────────
// Mantener sincronizado con los roles reales del sistema.
const PRIVILEGED_ROLES = new Set(["Admin", "Director", "Subdirector"]);

/**
 * Returns true if the user has admin-level access to tours.
 * Staff/Admin roles get full administrative view.
 */
function isPrivilegedTourViewer(user) {
  if (!user) return false;
  return PRIVILEGED_ROLES.has(user.role);
}

/**
 * Finds and returns the TourParticipant linked to the current user for a given tour.
 * Throws a descriptive error if not found.
 *
 * @param {string} userId   - ObjectId of the authenticated User
 * @param {string} tourId   - ObjectId of the Tour
 * @returns {Promise<TourParticipant>}
 */
async function getLinkedTourParticipantOrThrow({ userId, tourId }) {
  if (!userId || !tourId) {
    throw new Error("Se requiere userId y tourId para buscar el participante vinculado");
  }

  const participant = await TourParticipant.findOne({
    tour: tourId,
    linkedUser: userId,
  }).populate("tour", "name startDate endDate selfServiceAccess");

  if (!participant) {
    throw new Error(
      "Tu perfil aún no ha sido vinculado como participante de esta gira. " +
      "Contacta al administrador para que vincule tu cuenta."
    );
  }

  return participant;
}

/**
 * Asserts that a given self-service module is enabled for the tour.
 * No-op if the current user is privileged (admin).
 *
 * @param {object} tour         - Tour document (must have selfServiceAccess)
 * @param {string} moduleKey    - "documents" | "payments" | "rooms" | "itinerary" | "flights"
 * @param {object} currentUser  - Authenticated user
 */
function assertTourSelfServiceEnabled({ tour, moduleKey, currentUser }) {
  // Admin always passes
  if (isPrivilegedTourViewer(currentUser)) return;

  const ssa = tour?.selfServiceAccess;

  if (!ssa?.enabled) {
    throw new Error(
      "El acceso self-service a esta gira no está habilitado. " +
      "Consulta con el administrador."
    );
  }

  if (ssa[moduleKey] === false) {
    throw new Error(
      `El módulo "${moduleKey}" no está habilitado para acceso self-service en esta gira.`
    );
  }
}

/**
 * Asserts that the current user can use the imports module.
 * Only Admin/privileged roles can use imports — no self-service.
 */
function assertCanUseTourImports({ currentUser }) {
  if (!isPrivilegedTourViewer(currentUser)) {
    throw new Error(
      "La importación de participantes es exclusiva para administradores. " +
      "No autorizado."
    );
  }
}

// ─── Parent helpers ───────────────────────────────────────────────────────────

/**
 * Returns true if the authenticated actor is a Parent (not a User).
 */
function isParentActor(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  return user?.entityType === "Parent";
}

/**
 * Returns the array of child User IDs for the authenticated parent.
 * Throws if the parent is not found.
 */
async function getParentChildrenUserIds(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  const parentId = user?._id || user?.id;
  if (!parentId) throw new Error("No autenticado como padre");

  const parent = await Parent.findById(parentId).select("children").lean();
  if (!parent) throw new Error("Padre no encontrado");

  return (parent.children || []).map((id) => id.toString());
}

/**
 * Asserts that childUserId belongs to the authenticated parent.
 * Throws if the child is not in the parent's children list.
 */
function assertParentCanViewChild({ childUserId, parentChildrenIds }) {
  const allowed = new Set(parentChildrenIds.map((id) => id.toString()));
  if (!allowed.has(childUserId.toString())) {
    throw new Error("No tienes permiso para ver la información de ese participante");
  }
}

module.exports = {
  isPrivilegedTourViewer,
  getLinkedTourParticipantOrThrow,
  assertTourSelfServiceEnabled,
  assertCanUseTourImports,
  isParentActor,
  getParentChildrenUserIds,
  assertParentCanViewChild,
  PRIVILEGED_ROLES,
};
