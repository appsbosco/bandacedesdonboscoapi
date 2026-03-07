/**
 * ensembleRegistry.js
 *
 * Canonical source-of-truth for ensemble key↔name mapping.
 * Used by service layer to normalize User.bands values.
 *
 * Canonical display names (Spanish) are what get stored in User.bands
 * for backward compatibility with existing modules.
 */

const { SEED_ENSEMBLES } = require("../../models/Ensemble");

// key → canonical name
const KEY_TO_NAME = Object.fromEntries(SEED_ENSEMBLES.map((e) => [e.key, e.name]));

// Normalize variant strings to canonical name for matching
// Maps various case/accent/whitespace variants to the canonical display name.
const VARIANT_MAP = (() => {
  const map = new Map();

  function normalize(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")   // strip accents
      .replace(/\s+/g, " ");
  }

  for (const { name, key } of SEED_ENSEMBLES) {
    // canonical name and its normalized form both point to canonical name
    map.set(normalize(name), name);
    map.set(key.toLowerCase(), name);
    // common variants
    if (name.includes("avanzada")) map.set("banda de concierto a", name);
    if (name.includes("intermedia")) map.set("banda de concierto i", name);
  }

  // Extra commonly-seen misspellings / legacy strings
  const extras = [
    ["banda marcha",          "Banda de marcha"],
    ["marching band",         "Banda de marcha"],
    ["marching",              "Banda de marcha"],
    ["big band a",            "Big Band A"],
    ["big band b",            "Big Band B"],
    ["big band c",            "Big Band C"],
    ["banda de concierto avanzado", "Banda de concierto avanzada"],
    ["banda concierto avanzada",    "Banda de concierto avanzada"],
    ["banda concierto avanzado",    "Banda de concierto avanzada"],
    ["banda de concierto intermedio","Banda de concierto intermedia"],
    ["banda concierto intermedia",   "Banda de concierto intermedia"],
    ["banda de concierto inicio",    "Banda de concierto inicial"],
    ["banda concierto inicial",      "Banda de concierto inicial"],
    ["banda concierto elemental",    "Banda de concierto elemental"],
    ["banda de concierto elemental", "Banda de concierto elemental"],
  ];
  for (const [variant, canonical] of extras) {
    map.set(normalize(variant), canonical);
  }

  return map;
})();

/**
 * Normalize a band name string to its canonical display name.
 * Returns null if no match found (unknown ensemble → keep as-is).
 */
function normalizeEnsembleName(input) {
  if (!input) return null;
  const norm = String(input)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  return VARIANT_MAP.get(norm) || null;
}

/**
 * Convert an ensemble key (e.g. "BIG_BAND_A") to its canonical display name.
 * Throws if key is invalid.
 */
function keyToName(key) {
  if (!key) throw new Error("Ensemble key requerido");
  const upper = key.toUpperCase();
  const name = KEY_TO_NAME[upper];
  if (!name) throw new Error(`Agrupación desconocida: "${key}"`);
  return name;
}

/**
 * Validate that all keys are known. Returns array of invalid keys.
 */
function validateKeys(keys) {
  return (keys || []).filter((k) => !KEY_TO_NAME[k?.toUpperCase()]);
}

/**
 * Get the canonical display name for the mandatory marching band.
 */
const MARCHING_NAME = KEY_TO_NAME["MARCHING"];

/**
 * Given a list of ensemble keys, return their canonical display names.
 * Always includes MARCHING.
 */
function keysToNames(keys) {
  const names = new Set([MARCHING_NAME]);
  for (const k of keys || []) {
    const name = KEY_TO_NAME[k?.toUpperCase()];
    if (name) names.add(name);
  }
  return Array.from(names);
}

/**
 * Normalize a raw bands array (from User.bands) to canonical display names.
 * Always includes MARCHING. Removes duplicates and unknowns.
 */
function normalizeBandsArray(bands) {
  const result = new Set([MARCHING_NAME]);
  for (const b of bands || []) {
    const canonical = normalizeEnsembleName(b);
    if (canonical) result.add(canonical);
    // If we can't recognize it, drop it (normalization pass)
  }
  return Array.from(result);
}

/**
 * Given display names in User.bands, find matching ensemble key(s).
 */
function namesToKeys(names) {
  const nameToKey = Object.fromEntries(SEED_ENSEMBLES.map((e) => [e.name, e.key]));
  return (names || []).map((n) => nameToKey[n]).filter(Boolean);
}

module.exports = {
  KEY_TO_NAME,
  MARCHING_NAME,
  normalizeEnsembleName,
  keyToName,
  keysToNames,
  validateKeys,
  normalizeBandsArray,
  namesToKeys,
};
