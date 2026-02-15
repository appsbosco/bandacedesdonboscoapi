/**
 * src/graphql/shared/dates.js
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

module.exports = { startOfDay, endOfDay };
