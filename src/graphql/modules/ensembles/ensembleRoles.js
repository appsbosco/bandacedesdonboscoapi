/**
 * Ensemble eligibility rule — single source of truth.
 *
 * Only musician-type roles may appear in ensemble membership or availability lists.
 * Staff, instructors, directors, and parents are excluded.
 *
 * Derived from MUSICIAN_ROLES in bandacedesdonboscoui/src/layouts/members/index.js.
 */
const ENSEMBLE_ELIGIBLE_ROLES = [
  "Principal de sección",
  "Integrante BCDB",
  "Asistente de sección",
];

module.exports = { ENSEMBLE_ELIGIBLE_ROLES };
