/**
 * ensembles.service.js
 *
 * Business logic for Ensemble registry and ensemble-based user operations.
 * User.bands stores canonical Spanish display names (for backward compat).
 */

const User = require("../../../../../models/User");
const { Ensemble, seedEnsembles } = require("../../../../../models/Ensemble");
const {
  MARCHING_NAME,
  keysToNames,
  keyToName,
  validateKeys,
  normalizeBandsArray,
} = require("../../../../utils/ensembleRegistry");
const { ENSEMBLE_ELIGIBLE_ROLES } = require("../ensembleRoles");

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);

function requireAdmin(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  if (!ADMIN_ROLES.has(user.role)) throw new Error("No autorizado");
  return user;
}

// ── Queries ───────────────────────────────────────────────────────────────────

async function getEnsembles(activeOnly = true) {
  // Seed on first call if collection is empty
  const count = await Ensemble.countDocuments();
  if (count === 0) await seedEnsembles();

  const filter = activeOnly ? { isActive: true } : {};
  return Ensemble.find(filter).sort({ sortOrder: 1, name: 1 });
}

async function usersPaginated(filter = {}, pagination = {}, ctx) {
  requireAdmin(ctx);
  return _paginatedQuery(filter, pagination);
}

async function ensembleMembers(ensembleKey, filter = {}, pagination = {}, ctx) {
  requireAdmin(ctx);
  // Strip any caller-supplied role filter — eligibility is enforced here
  const { role: _r, roles: _rs, ...cleanFilter } = filter;
  const merged = { ...cleanFilter, ensembleKeys: [ensembleKey], roles: ENSEMBLE_ELIGIBLE_ROLES };
  return _paginatedQuery(merged, pagination);
}

async function ensembleAvailable(ensembleKey, filter = {}, pagination = {}, ctx) {
  requireAdmin(ctx);
  const ensembleName = keyToName(ensembleKey);
  // Strip any caller-supplied role filter — eligibility is enforced here
  const { role: _r, roles: _rs, ...cleanFilter } = filter;
  const merged = { ...cleanFilter, roles: ENSEMBLE_ELIGIBLE_ROLES };
  return _paginatedQuery(merged, pagination, { excludeEnsembleName: ensembleName });
}

async function ensembleCounts(ensembleKey, ctx) {
  requireAdmin(ctx);
  const ensembleName = keyToName(ensembleKey);
  const eligibleFilter = { role: { $in: ENSEMBLE_ELIGIBLE_ROLES } };
  const [membersTotal, availableTotal] = await Promise.all([
    User.countDocuments({ ...eligibleFilter, bands: ensembleName }),
    User.countDocuments({ ...eligibleFilter, bands: { $not: { $elemMatch: { $eq: ensembleName } } } }),
  ]);
  return { membersTotal, availableTotal };
}

async function ensembleInstrumentStats(ensembleKey, ctx) {
  requireAdmin(ctx);
  const ensembleName = keyToName(ensembleKey);
  const agg = await User.aggregate([
    { $match: { bands: ensembleName, role: { $in: ENSEMBLE_ELIGIBLE_ROLES } } },
    { $group: { _id: { $ifNull: ["$instrument", "Sin instrumento"] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return agg.map((b) => ({ instrument: b._id || "Sin instrumento", count: b.count }));
}

async function _paginatedQuery(filter, pagination, options = {}) {
  const { excludeEnsembleName } = options;
  const {
    searchText,
    state,
    role,
    roles,
    instrument,
    grade,
    ensembleKeys,
    ensembleAllOf,
  } = filter;

  const {
    page = 1,
    limit = 25,
    sortBy = "firstSurName",
    sortDir = "asc",
  } = pagination;

  const mongoFilter = {};

  if (searchText) {
    const re = new RegExp(searchText.trim(), "i");
    mongoFilter.$or = [
      { name: re },
      { firstSurName: re },
      { secondSurName: re },
      { email: re },
      { carnet: re },
    ];
  }
  if (state)      mongoFilter.state      = state;
  if (roles && roles.length > 0) {
    mongoFilter.role = { $in: roles };
  } else if (role) {
    mongoFilter.role = role;
  }
  if (instrument) mongoFilter.instrument = instrument;
  if (grade)      mongoFilter.grade      = grade;

  // Ensemble OR filter: user must be in at least one of the given ensemble display names
  if (ensembleKeys && ensembleKeys.length > 0) {
    const names = ensembleKeys.map((k) => {
      try { return keyToName(k); } catch { return null; }
    }).filter(Boolean);
    if (names.length > 0) {
      mongoFilter.bands = { $in: names };
    }
  }

  // Ensemble AND filter: user must be in ALL of the given ensembles
  if (ensembleAllOf && ensembleAllOf.length > 0) {
    const names = ensembleAllOf.map((k) => {
      try { return keyToName(k); } catch { return null; }
    }).filter(Boolean);
    if (names.length > 0) {
      mongoFilter.bands = { ...mongoFilter.bands, $all: names };
    }
  }

  // Exclude filter: users NOT in a specific ensemble (for "disponibles" tab)
  if (excludeEnsembleName) {
    mongoFilter.bands = { ...mongoFilter.bands, $not: { $elemMatch: { $eq: excludeEnsembleName } } };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const safePage  = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const sortField = ["firstSurName", "name", "email", "state", "role", "instrument"].includes(sortBy)
    ? sortBy
    : "firstSurName";
  const sort = { [sortField]: sortDir === "desc" ? -1 : 1 };

  const [items, total, facets] = await Promise.all([
    User.find(mongoFilter)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .sort(sort)
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    User.countDocuments(mongoFilter),
    _computeFacets(mongoFilter),
  ]);

  return { items, total, page: safePage, limit: safeLimit, facets };
}

async function _computeFacets(baseFilter) {
  const [stateAgg, roleAgg, instrAgg, bandAgg] = await Promise.all([
    User.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$instrument", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    User.aggregate([
      { $match: baseFilter },
      { $unwind: { path: "$bands", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$bands", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return {
    byState:     stateAgg.map((b) => ({ value: b._id || "Sin estado", count: b.count })),
    byRole:      roleAgg.map((b) => ({ value: b._id || "Sin rol", count: b.count })),
    byInstrument: instrAgg.map((b) => ({ value: b._id || "Sin instrumento", count: b.count })),
    byEnsemble:  bandAgg.map((b) => ({ value: b._id, count: b.count })),
  };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

async function setUserEnsembles(userId, ensembleKeys, ctx) {
  requireAdmin(ctx);
  if (!userId) throw new Error("userId requerido");

  const invalid = validateKeys(ensembleKeys);
  if (invalid.length > 0) throw new Error(`Claves de agrupación inválidas: ${invalid.join(", ")}`);

  // Build canonical names, always including MARCHING
  const names = keysToNames(ensembleKeys);

  return User.findByIdAndUpdate(
    userId,
    { $set: { bands: names } },
    { new: true }
  ).select("-password -resetPasswordToken -resetPasswordExpires");
}

async function addUserToEnsembles(userIds, ensembleKeys, ctx) {
  requireAdmin(ctx);
  if (!userIds?.length) throw new Error("userIds requerido");
  if (!ensembleKeys?.length) throw new Error("ensembleKeys requerido");

  const invalid = validateKeys(ensembleKeys);
  if (invalid.length > 0) throw new Error(`Claves inválidas: ${invalid.join(", ")}`);

  const namesToAdd = ensembleKeys.map((k) => keyToName(k));

  let updatedCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (const userId of userIds) {
    try {
      const result = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { bands: { $each: namesToAdd } } },
        { new: false }
      );
      if (result) updatedCount++;
      else { skippedCount++; errors.push({ userId, reason: "Usuario no encontrado" }); }
    } catch (err) {
      skippedCount++;
      errors.push({ userId, reason: err.message });
    }
  }

  return { updatedCount, skippedCount, errors };
}

async function removeUserFromEnsembles(userIds, ensembleKeys, ctx) {
  requireAdmin(ctx);
  if (!userIds?.length) throw new Error("userIds requerido");
  if (!ensembleKeys?.length) throw new Error("ensembleKeys requerido");

  const invalid = validateKeys(ensembleKeys);
  if (invalid.length > 0) throw new Error(`Claves inválidas: ${invalid.join(", ")}`);

  // MARCHING cannot be removed — filter it out silently, report as skipped per user
  const safeKeys = ensembleKeys.filter((k) => k.toUpperCase() !== "MARCHING");
  const marchingAttempted = safeKeys.length < ensembleKeys.length;

  const namesToRemove = safeKeys.map((k) => keyToName(k));

  let updatedCount = 0;
  let skippedCount = marchingAttempted ? userIds.length : 0; // report marching attempts
  const errors = [];

  if (namesToRemove.length === 0) {
    // Only marching was requested — report all as skipped
    return {
      updatedCount: 0,
      skippedCount: userIds.length,
      errors: userIds.map((userId) => ({
        userId,
        reason: "No se puede remover la Banda de marcha (agrupación obligatoria)",
      })),
    };
  }

  for (const userId of userIds) {
    try {
      const result = await User.findByIdAndUpdate(
        userId,
        { $pull: { bands: { $in: namesToRemove } } },
        { new: false }
      );
      if (result) updatedCount++;
      else { skippedCount++; errors.push({ userId, reason: "Usuario no encontrado" }); }
    } catch (err) {
      skippedCount++;
      errors.push({ userId, reason: err.message });
    }
  }

  // Ensure MARCHING is still present for all updated users
  await User.updateMany(
    { _id: { $in: userIds }, bands: { $not: { $elemMatch: { $eq: MARCHING_NAME } } } },
    { $addToSet: { bands: MARCHING_NAME } }
  );

  return { updatedCount, skippedCount, errors };
}

// ── memberCount type resolver helper ─────────────────────────────────────────

async function getMemberCount(ensembleName) {
  return User.countDocuments({ bands: ensembleName });
}

module.exports = {
  getEnsembles,
  usersPaginated,
  ensembleMembers,
  ensembleAvailable,
  ensembleCounts,
  ensembleInstrumentStats,
  setUserEnsembles,
  addUserToEnsembles,
  removeUserFromEnsembles,
  getMemberCount,
};
