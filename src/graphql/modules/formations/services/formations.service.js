/**
 * formations.service.js
 *
 * Domain rules:
 * - Source of truth = users with bands: MARCHING_NAME, not attendance.
 * - One global `columns` value, not per-section.
 * - 5 zones in depth order (vertical):
 *     FRENTE_ESPECIAL → BLOQUE_FRENTE → PERCUSION → BLOQUE_ATRAS → FINAL
 * - displayName = user.name + user.firstSurName only (no secondSurName, no instrument).
 * - excludedUserIds: users manually removed from a specific formation.
 */

const mongoose = require("mongoose");
const Formation = require("../../../../../models/Formation");
const FormationTemplate = require("../../../../../models/FormationTemplate");
const User = require("../../../../../models/User");
const { MARCHING_NAME } = require("../../../../utils/ensembleRegistry");
const { error } = require("../../../shared/errors");

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);

// Roles that may update step-4 fields (slots, notes, zoneMemberCounts) only
const FORMATION_EDITOR_ROLES = new Set([
  "Admin",
  "Director",
  "Subdirector",
  "Principal de sección",
]);

// ── Auth ──────────────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  return user;
}

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (!ADMIN_ROLES.has(user.role)) throw new Error("No autorizado");
  return user;
}

function requireFormationEditor(ctx) {
  const user = requireAuth(ctx);
  if (!FORMATION_EDITOR_ROLES.has(user.role)) throw new Error("No autorizado");
  return user;
}

// ── Default instrument → section map ─────────────────────────────────────────
// Keys are lowercase and accent-stripped for case-insensitive matching.
// Sections match the 5-zone parade model:
//   FRENTE_ESPECIAL: DANZA, DRUM_MAJOR
//   BLOQUE_FRENTE/ATRAS: TROMBONES, FLAUTAS, CLARINETES, SAXOFONES_ALTO,
//                        SAXOFON_TENOR, MELOFONOS, SAXOFON_BARITONO,
//                        EUFONIOS, TROMPETAS, TUBAS, MALLETS
//   PERCUSION: PERCUSION
//   FINAL: COLOR_GUARD

const DEFAULT_INSTRUMENT_MAP = {
  // DRUM_MAJOR
  "drum major": "DRUM_MAJOR",
  "director de marcha": "DRUM_MAJOR",
  mayor: "DRUM_MAJOR",

  // DANZA
  danza: "DANZA",
  dance: "DANZA",
  bailarina: "DANZA",
  bailarin: "DANZA",
  baile: "DANZA",

  // FLAUTAS
  flauta: "FLAUTAS",
  "flauta traversa": "FLAUTAS",
  flute: "FLAUTAS",
  piccolo: "FLAUTAS",
  "flauta piccolo": "FLAUTAS",

  // CLARINETES
  clarinete: "CLARINETES",
  "clarinete bajo": "CLARINETES",
  "bass clarinet": "CLARINETES",
  clarinet: "CLARINETES",

  // SAXOFONES_ALTO
  "saxofon alto": "SAXOFONES_ALTO",
  "sax alto": "SAXOFONES_ALTO",
  "saxo alto": "SAXOFONES_ALTO",
  "alto saxophone": "SAXOFONES_ALTO",
  "alto sax": "SAXOFONES_ALTO",
  "saxophone alto": "SAXOFONES_ALTO",

  // SAXOFON_TENOR
  "saxofon tenor": "SAXOFON_TENOR",
  "sax tenor": "SAXOFON_TENOR",
  "saxo tenor": "SAXOFON_TENOR",
  "tenor saxophone": "SAXOFON_TENOR",
  "tenor sax": "SAXOFON_TENOR",

  // SAXOFON_BARITONO
  "saxofon baritono": "SAXOFON_BARITONO",
  "sax baritono": "SAXOFON_BARITONO",
  "saxo baritono": "SAXOFON_BARITONO",
  "baritone saxophone": "SAXOFON_BARITONO",
  "bari sax": "SAXOFON_BARITONO",
  bari: "SAXOFON_BARITONO",

  // Generic saxophone → SAXOFONES_ALTO (most common in parade bands)
  saxofon: "SAXOFONES_ALTO",
  saxo: "SAXOFONES_ALTO",
  saxophone: "SAXOFONES_ALTO",
  sax: "SAXOFONES_ALTO",

  // MELOFONOS (mellofones — brass instruments used in marching bands)
  melofono: "MELOFONOS",
  mellophone: "MELOFONOS",
  mello: "MELOFONOS",
  melofonos: "MELOFONOS",
  // French horn / corno mapped to MELOFONOS (marching equivalent)
  corno: "MELOFONOS",
  "corno frances": "MELOFONOS",
  "french horn": "MELOFONOS",
  horn: "MELOFONOS",

  // TROMPETAS
  trompeta: "TROMPETAS",
  trumpet: "TROMPETAS",
  "trompeta en si bemol": "TROMPETAS",
  corneta: "TROMPETAS",
  cornet: "TROMPETAS",

  // TROMBONES
  trombon: "TROMBONES",
  trombone: "TROMBONES",
  "trombon bajo": "TROMBONES",
  "bass trombone": "TROMBONES",

  // TUBAS
  tuba: "TUBAS",
  sousafon: "TUBAS",
  sousaphone: "TUBAS",
  "tuba en si bemol": "TUBAS",
  contra: "TUBAS",
  contrabajo: "TUBAS",

  // EUFONIOS
  eufonio: "EUFONIOS",
  euphonium: "EUFONIOS",
  baritono: "EUFONIOS",
  baritone: "EUFONIOS",

  // MALLETS (front/back blocks, not percussion zone)
  marimba: "MALLETS",
  xilofono: "MALLETS",
  vibrafono: "MALLETS",
  metalofono: "MALLETS",
  glockenspiel: "MALLETS",
  "campanas tubulares": "MALLETS",
  campanas: "MALLETS",
  xylophone: "MALLETS",
  vibraphone: "MALLETS",
  mallet: "MALLETS",
  mallets: "MALLETS",

  // PERCUSION
  percusion: "PERCUSION",
  percussion: "PERCUSION",
  bombo: "PERCUSION",
  "bass drum": "PERCUSION",
  tarola: "PERCUSION",
  snare: "PERCUSION",
  "snare drum": "PERCUSION",
  tenor: "PERCUSION",
  tenores: "PERCUSION",
  "tenor drum": "PERCUSION",
  platillos: "PERCUSION",
  cymbals: "PERCUSION",
  bateria: "PERCUSION",
  drums: "PERCUSION",

  // COLOR_GUARD
  "color guard": "COLOR_GUARD",
  "guardia de color": "COLOR_GUARD",
  bandera: "COLOR_GUARD",
  sable: "COLOR_GUARD",
  sabre: "COLOR_GUARD",
  rifle: "COLOR_GUARD",
  flag: "COLOR_GUARD",
};

function normalizeKey(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // strip accents
}

function buildInstrumentMap(overrides = []) {
  const map = { ...DEFAULT_INSTRUMENT_MAP };
  for (const { instrument, section } of overrides) {
    map[normalizeKey(instrument)] = section;
  }
  return map;
}

// ── Queries ───────────────────────────────────────────────────────────────────

async function getFormations(filter = {}, ctx) {
  requireAuth(ctx);
  const query = {};
  if (filter.year) {
    const start = new Date(Date.UTC(filter.year, 0, 1));
    const end = new Date(Date.UTC(filter.year + 1, 0, 1));
    query.date = { $gte: start, $lt: end };
  }
  if (filter.search) query.name = { $regex: filter.search, $options: "i" };
  return Formation.find(query)
    .sort({ date: -1 })
    .populate("createdBy", "name firstSurName")
    .lean();
}

async function getFormation(id, ctx) {
  requireAuth(ctx);
  return Formation.findById(id)
    .populate("createdBy", "name firstSurName")
    .lean();
}

async function getFormationTemplates(ctx) {
  requireAuth(ctx);
  return FormationTemplate.find()
    .sort({ name: 1 })
    .populate("createdBy", "name firstSurName")
    .lean();
}

async function getFormationTemplate(id, ctx) {
  requireAuth(ctx);
  return FormationTemplate.findById(id)
    .populate("createdBy", "name firstSurName")
    .lean();
}

/**
 * Load active marching band members grouped by their parade section.
 * displayName = name + firstSurName only (no secondSurName, no instrument).
 */
async function getUsersBySection(
  excludedIds = [],
  instrumentMappings = [],
  ctx,
) {
  requireAuth(ctx);

  const instrMap = buildInstrumentMap(instrumentMappings);

  const excludedObjectIds = excludedIds
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  const userQuery = { bands: MARCHING_NAME };
  if (excludedObjectIds.length) userQuery._id = { $nin: excludedObjectIds };

  const users = await User.find(userQuery)
    .select("name firstSurName instrument avatar")
    .sort({ firstSurName: 1, name: 1 })
    .lean();

  const bySection = {};
  const unmapped = [];

  for (const user of users) {
    const key = normalizeKey(user.instrument || "");
    const section = instrMap[key];

    const firstName =
      String(user.name || "")
        .trim()
        .split(/\s+/)[0] || "";

    // Display name: nombre + primer apellido only
    const displayName = [firstName, user.firstSurName]
      .filter(Boolean)
      .join(" ");

    const member = {
      userId: user._id.toString(),
      name: displayName,
      instrument: user.instrument || null,
      avatar: user.avatar || null,
    };

    if (!section) {
      unmapped.push(member);
    } else {
      if (!bySection[section]) bySection[section] = [];
      bySection[section].push(member);
    }
  }

  const sections = Object.entries(bySection).map(([section, members]) => ({
    section,
    count: members.length,
    members,
  }));

  return { sections, unmapped };
}

// ── Mutations — Formations ────────────────────────────────────────────────────

async function createFormation(input, ctx) {
  const user = requireAdmin(ctx);
  const formation = new Formation({
    ...input,
    date: new Date(input.date),
    createdBy: user._id || user.id,
  });
  await formation.save();
  return Formation.findById(formation._id)
    .populate("createdBy", "name firstSurName")
    .lean();
}

async function updateFormation(id, input, ctx) {
  const user = requireFormationEditor(ctx);
  const isAdmin = ADMIN_ROLES.has(user.role);

  const formation = await Formation.findById(id);
  if (!formation) throw new Error("Formación no encontrada");

  if (input.expectedUpdatedAt != null) {
    const currentUpdatedAt = formation.updatedAt?.toISOString?.();
    if (currentUpdatedAt !== input.expectedUpdatedAt) {
      throw error(
        "CONFLICT",
        "Otro usuario guardó cambios mientras usted estaba editando. Se recomienda recargar para evitar perder su trabajo.",
      );
    }
  }

  if (isAdmin) {
    // Full update — admins can modify all structural fields
    if (input.name !== undefined) formation.name = input.name;
    if (input.columns !== undefined) formation.columns = input.columns;
    if (input.excludedUserIds !== undefined)
      formation.excludedUserIds = input.excludedUserIds;
    if (input.zoneOrders !== undefined) formation.zoneOrders = input.zoneOrders;
    if (input.zoneColumns !== undefined)
      formation.zoneColumns = input.zoneColumns;
    if (input.zoneMemberCounts !== undefined)
      formation.zoneMemberCounts = input.zoneMemberCounts;
  }

  // Both admins and principals can persist step-4 changes
  if (input.slots !== undefined) formation.slots = input.slots;
  if (input.notes !== undefined) formation.notes = input.notes;

  await formation.save();
  return Formation.findById(id)
    .populate("createdBy", "name firstSurName")
    .lean();
}

async function deleteFormation(id, ctx) {
  requireAdmin(ctx);
  if (!(await Formation.findById(id)))
    throw new Error("Formación no encontrada");
  await Formation.findByIdAndDelete(id);
  return "Formación eliminada correctamente";
}

// ── Mutations — Templates ─────────────────────────────────────────────────────

async function createFormationTemplate(input, ctx) {
  const user = requireAdmin(ctx);
  const template = new FormationTemplate({
    ...input,
    createdBy: user._id || user.id,
  });
  await template.save();
  return FormationTemplate.findById(template._id)
    .populate("createdBy", "name firstSurName")
    .lean();
}

async function updateFormationTemplate(id, input, ctx) {
  requireAdmin(ctx);
  const template = await FormationTemplate.findById(id);
  if (!template) throw new Error("Plantilla no encontrada");

  if (input.name !== undefined) template.name = input.name;
  if (input.defaultColumns !== undefined)
    template.defaultColumns = input.defaultColumns;
  if (input.notes !== undefined) template.notes = input.notes;
  if (input.zoneOrders !== undefined) template.zoneOrders = input.zoneOrders;
  if (input.zoneColumns !== undefined) template.zoneColumns = input.zoneColumns;
  if (input.instrumentMappings !== undefined)
    template.instrumentMappings = input.instrumentMappings;

  await template.save();
  return FormationTemplate.findById(id)
    .populate("createdBy", "name firstSurName")
    .lean();
}

async function deleteFormationTemplate(id, ctx) {
  requireAdmin(ctx);
  if (!(await FormationTemplate.findById(id)))
    throw new Error("Plantilla no encontrada");
  await FormationTemplate.findByIdAndDelete(id);
  return "Plantilla eliminada correctamente";
}

module.exports = {
  getFormations,
  getFormation,
  getFormationTemplates,
  getFormationTemplate,
  getUsersBySection,
  createFormation,
  updateFormation,
  deleteFormation,
  createFormationTemplate,
  updateFormationTemplate,
  deleteFormationTemplate,
};
