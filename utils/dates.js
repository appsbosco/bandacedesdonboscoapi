const CR_OFFSET_HOURS = 6; // Costa Rica = UTC-6 (UTC = CR + 6)

function normalizeDateToStartOfDayCR(dateInput) {
  // Caso 1: viene "YYYY-MM-DD" (date-only). Interpretarlo como día CR.
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, d] = dateInput.split("-").map(Number);
    // CR 00:00 -> UTC 06:00
    return new Date(Date.UTC(y, m - 1, d, CR_OFFSET_HOURS, 0, 0, 0));
  }

  // Caso 2: viene con hora (ISO o Date). Determinar qué día es en CR.
  const dt = new Date(dateInput); // UTC timestamp real
  const crMs = dt.getTime() - CR_OFFSET_HOURS * 60 * 60 * 1000; // "hora CR" en ms
  const cr = new Date(crMs);

  // Tomar el Y-M-D "en CR" (usando getters UTC porque cr ya está corrido)
  const y = cr.getUTCFullYear();
  const m = cr.getUTCMonth(); // 0-based
  const d = cr.getUTCDate();

  return new Date(Date.UTC(y, m, d, CR_OFFSET_HOURS, 0, 0, 0));
}

module.exports = {
  normalizeDateToStartOfDayCR,
};
