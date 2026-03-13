/**
 * ensembles.service.js
 *
 * INVARIANT: Every eligible user always has MARCHING_NAME ("Banda de marcha")
 * in their bands array. So the three tabs are defined as:
 *
 *   Miembros              → bands contains the current ensemble name
 *   Disponibles           → bands contains ONLY "Banda de marcha" (nothing else)
 *   En otras agrupaciones → bands has at least one entry that is neither
 *                           "Banda de marcha" nor the current ensemble name
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
  const count = await Ensemble.countDocuments();
  if (count === 0) await seedEnsembles();
  const filter = activeOnly ? { isActive: true } : {};
  return Ensemble.find(filter).sort({ sortOrder: 1, name: 1 });
}

async function usersPaginated(filter = {}, pagination = {}, ctx) {
  return _paginatedQuery(filter, pagination);
}

async function ensembleMembers(ensembleKey, filter = {}, pagination = {}, ctx) {
  requireAdmin(ctx);
  const { role: _r, roles: _rs, ...cleanFilter } = filter;
  const merged = {
    ...cleanFilter,
    ensembleKeys: [ensembleKey],
    roles: ENSEMBLE_ELIGIBLE_ROLES,
  };
  return _paginatedQuery(merged, pagination);
}

/**
 * "Disponibles" — users whose bands array contains ONLY "Banda de marcha".
 * They have no assignment to any real ensemble yet.
 */
async function ensembleAvailable(
  ensembleKey,
  filter = {},
  pagination = {},
  ctx,
) {
  requireAdmin(ctx);
  const { role: _r, roles: _rs, ...cleanFilter } = filter;
  const merged = { ...cleanFilter, roles: ENSEMBLE_ELIGIBLE_ROLES };
  // onlyMarching: bands has no entry outside of MARCHING_NAME
  return _paginatedQuery(merged, pagination, { onlyMarching: true });
}

/**
 * "En otras agrupaciones" — users who have at least one band that is:
 *   - not MARCHING_NAME
 *   - not the current ensemble
 */
async function ensembleInOther(ensembleKey, filter = {}, pagination = {}, ctx) {
  requireAdmin(ctx);
  const ensembleName = keyToName(ensembleKey);
  const { role: _r, roles: _rs, band, ...cleanFilter } = filter;
  const merged = { ...cleanFilter, roles: ENSEMBLE_ELIGIBLE_ROLES };
  return _paginatedQuery(merged, pagination, {
    inOtherMode: true,
    currentEnsembleName: ensembleName,
    bandFilter: band || null,
  });
}

/**
 * Tab counts (marching-aware).
 */
async function ensembleCounts(ensembleKey, ctx) {
  requireAdmin(ctx);
  const ensembleName = keyToName(ensembleKey);
  const base = { role: { $in: ENSEMBLE_ELIGIBLE_ROLES } };

  const [membersTotal, availableTotal, inOtherTotal] = await Promise.all([
    // In this ensemble
    User.countDocuments({ ...base, bands: ensembleName }),

    // Only marching — bands has no element other than MARCHING_NAME
    User.countDocuments({
      ...base,
      bands: { $not: { $elemMatch: { $ne: MARCHING_NAME } } },
    }),

    // In at least one other real ensemble (not marching, not current)
    User.countDocuments({
      ...base,
      $and: [
        // Not in current ensemble
        { bands: { $not: { $elemMatch: { $eq: ensembleName } } } },
        // Has at least one band that is not marching
        { bands: { $elemMatch: { $ne: MARCHING_NAME } } },
      ],
    }),
  ]);

  return { membersTotal, availableTotal, inOtherTotal };
}

async function ensembleInstrumentStats(ensembleKey, ctx) {
  requireAdmin(ctx);
  const ensembleName = keyToName(ensembleKey);
  const agg = await User.aggregate([
    { $match: { bands: ensembleName, role: { $in: ENSEMBLE_ELIGIBLE_ROLES } } },
    {
      $group: {
        _id: { $ifNull: ["$instrument", "Sin instrumento"] },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
  return agg.map((b) => ({
    instrument: b._id || "Sin instrumento",
    count: b.count,
  }));
}

// ── Core paginated query ──────────────────────────────────────────────────────

async function _paginatedQuery(filter, pagination, options = {}) {
  const {
    onlyMarching, // Disponibles: bands has ONLY marching
    inOtherMode, // En otras: has a non-marching band that isn't current
    currentEnsembleName, // name of the ensemble being managed
    bandFilter, // optional: filter inOther by specific band name
  } = options;

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

  const andClauses = [];

  // ── Text search ────────────────────────────────────────────────────────────
  if (searchText) {
    const re = new RegExp(searchText.trim(), "i");
    andClauses.push({
      $or: [
        { name: re },
        { firstSurName: re },
        { secondSurName: re },
        { email: re },
        { carnet: re },
      ],
    });
  }

  // ── Scalar filters ─────────────────────────────────────────────────────────
  const scalar = {};
  if (state) scalar.state = state;
  if (instrument) scalar.instrument = instrument;
  if (grade) scalar.grade = grade;
  if (roles?.length > 0) scalar.role = { $in: roles };
  else if (role) scalar.role = role;
  if (Object.keys(scalar).length) andClauses.push(scalar);

  // ── ensembleKeys OR filter ─────────────────────────────────────────────────
  if (ensembleKeys?.length > 0) {
    const names = ensembleKeys
      .map((k) => {
        try {
          return keyToName(k);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (names.length) andClauses.push({ bands: { $in: names } });
  }

  // ── ensembleAllOf AND filter ───────────────────────────────────────────────
  if (ensembleAllOf?.length > 0) {
    const names = ensembleAllOf
      .map((k) => {
        try {
          return keyToName(k);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    if (names.length) andClauses.push({ bands: { $all: names } });
  }

  // ── "Disponibles": bands contains nothing outside of MARCHING_NAME ─────────
  if (onlyMarching) {
    // $not $elemMatch $ne MARCHING_NAME  → no element is different from marching
    // i.e. all elements equal MARCHING_NAME (bands is ["Banda de marcha"] or [])
    andClauses.push({
      bands: { $not: { $elemMatch: { $ne: MARCHING_NAME } } },
    });
  }

  // ── "En otras agrupaciones" ────────────────────────────────────────────────
  if (inOtherMode) {
    // Not in current ensemble
    andClauses.push({
      bands: { $not: { $elemMatch: { $eq: currentEnsembleName } } },
    });
    // Has at least one band that is not marching
    andClauses.push({ bands: { $elemMatch: { $ne: MARCHING_NAME } } });
    // Optional: filter by a specific other band name
    if (bandFilter) {
      andClauses.push({ bands: bandFilter });
    }
  }

  // ── Assemble final mongo filter ────────────────────────────────────────────
  const mongoFilter =
    andClauses.length === 0
      ? {}
      : andClauses.length === 1
        ? andClauses[0]
        : { $and: andClauses };

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;
  const sortField = [
    "firstSurName",
    "name",
    "email",
    "state",
    "role",
    "instrument",
  ].includes(sortBy)
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
    byState: stateAgg.map((b) => ({
      value: b._id || "Sin estado",
      count: b.count,
    })),
    byRole: roleAgg.map((b) => ({ value: b._id || "Sin rol", count: b.count })),
    byInstrument: instrAgg.map((b) => ({
      value: b._id || "Sin instrumento",
      count: b.count,
    })),
    byEnsemble: bandAgg.map((b) => ({ value: b._id, count: b.count })),
  };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

async function setUserEnsembles(userId, ensembleKeys, ctx) {
  requireAdmin(ctx);
  if (!userId) throw new Error("userId requerido");
  const invalid = validateKeys(ensembleKeys);
  if (invalid.length > 0)
    throw new Error(`Claves de agrupación inválidas: ${invalid.join(", ")}`);
  const names = keysToNames(ensembleKeys);
  return User.findByIdAndUpdate(
    userId,
    { $set: { bands: names } },
    { new: true },
  ).select("-password -resetPasswordToken -resetPasswordExpires");
}

async function addUserToEnsembles(userIds, ensembleKeys, ctx) {
  requireAdmin(ctx);
  if (!userIds?.length) throw new Error("userIds requerido");
  if (!ensembleKeys?.length) throw new Error("ensembleKeys requerido");
  const invalid = validateKeys(ensembleKeys);
  if (invalid.length > 0)
    throw new Error(`Claves inválidas: ${invalid.join(", ")}`);
  const namesToAdd = ensembleKeys.map((k) => keyToName(k));
  let updatedCount = 0,
    skippedCount = 0;
  const errors = [];
  for (const userId of userIds) {
    try {
      const result = await User.findByIdAndUpdate(
        userId,
        { $addToSet: { bands: { $each: namesToAdd } } },
        { new: false },
      );
      if (result) updatedCount++;
      else {
        skippedCount++;
        errors.push({ userId, reason: "Usuario no encontrado" });
      }
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
  if (invalid.length > 0)
    throw new Error(`Claves inválidas: ${invalid.join(", ")}`);

  const safeKeys = ensembleKeys.filter((k) => k.toUpperCase() !== "MARCHING");
  const marchingAttempted = safeKeys.length < ensembleKeys.length;
  const namesToRemove = safeKeys.map((k) => keyToName(k));
  let updatedCount = 0;
  let skippedCount = marchingAttempted ? userIds.length : 0;
  const errors = [];

  if (namesToRemove.length === 0) {
    return {
      updatedCount: 0,
      skippedCount: userIds.length,
      errors: userIds.map((userId) => ({
        userId,
        reason:
          "No se puede remover la Banda de marcha (agrupación obligatoria)",
      })),
    };
  }

  for (const userId of userIds) {
    try {
      const result = await User.findByIdAndUpdate(
        userId,
        { $pull: { bands: { $in: namesToRemove } } },
        { new: false },
      );
      if (result) updatedCount++;
      else {
        skippedCount++;
        errors.push({ userId, reason: "Usuario no encontrado" });
      }
    } catch (err) {
      skippedCount++;
      errors.push({ userId, reason: err.message });
    }
  }

  // Ensure MARCHING is still present for all updated users
  await User.updateMany(
    {
      _id: { $in: userIds },
      bands: { $not: { $elemMatch: { $eq: MARCHING_NAME } } },
    },
    { $addToSet: { bands: MARCHING_NAME } },
  );

  return { updatedCount, skippedCount, errors };
}

async function getMemberCount(ensembleName) {
  return User.countDocuments({ bands: ensembleName });
}

module.exports = {
  getEnsembles,
  usersPaginated,
  ensembleMembers,
  ensembleAvailable,
  ensembleInOther,
  ensembleCounts,
  ensembleInstrumentStats,
  setUserEnsembles,
  addUserToEnsembles,
  removeUserFromEnsembles,
  getMemberCount,
};
