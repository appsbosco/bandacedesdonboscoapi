/**
 * Verifica si un documento está expirado
 * @param {Date|string} expirationDate - Fecha de expiración
 * @param {Date} now - Fecha de referencia (por defecto: ahora)
 * @returns {boolean}
 */
function isExpired(expirationDate, now = new Date()) {
  if (!expirationDate) return false;

  const expDate = new Date(expirationDate);
  return expDate < now;
}

/**
 * Verifica si un documento expira antes de una fecha específica
 * @param {Date|string} expirationDate - Fecha de expiración
 * @param {Date|string} targetDate - Fecha límite
 * @returns {boolean}
 */
function expiresBefore(expirationDate, targetDate) {
  if (!expirationDate || !targetDate) return false;

  const expDate = new Date(expirationDate);
  const target = new Date(targetDate);

  return expDate < target;
}

/**
 * Verifica si un documento expira dentro de N días
 * @param {Date|string} expirationDate - Fecha de expiración
 * @param {number} days - Número de días
 * @param {Date} now - Fecha de referencia (por defecto: ahora)
 * @returns {boolean}
 */
function expiresInDays(expirationDate, days, now = new Date()) {
  if (!expirationDate) return false;

  const expDate = new Date(expirationDate);
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + days);

  return expDate <= futureDate && expDate >= now;
}

/**
 * Calcula días restantes hasta la expiración
 * @param {Date|string} expirationDate - Fecha de expiración
 * @param {Date} now - Fecha de referencia (por defecto: ahora)
 * @returns {number} - Días restantes (negativo si expirado)
 */
function daysUntilExpiration(expirationDate, now = new Date()) {
  if (!expirationDate) return null;

  const expDate = new Date(expirationDate);
  const diffTime = expDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Obtiene resumen de expiración para un conjunto de documentos
 * @param {Array} documents - Array de documentos
 * @param {Date} referenceDate - Fecha de referencia
 * @returns {Object} - Resumen con conteos
 */
function getExpirationSummary(documents, referenceDate = new Date()) {
  const summary = {
    total: documents.length,
    expired: 0,
    expiringIn30Days: 0,
    expiringIn60Days: 0,
    expiringIn90Days: 0,
    valid: 0,
    noExpirationDate: 0,
  };

  documents.forEach((doc) => {
    const expDate = doc.extracted?.expirationDate;

    if (!expDate) {
      summary.noExpirationDate++;
      return;
    }

    if (isExpired(expDate, referenceDate)) {
      summary.expired++;
    } else if (expiresInDays(expDate, 30, referenceDate)) {
      summary.expiringIn30Days++;
    } else if (expiresInDays(expDate, 60, referenceDate)) {
      summary.expiringIn60Days++;
    } else if (expiresInDays(expDate, 90, referenceDate)) {
      summary.expiringIn90Days++;
    } else {
      summary.valid++;
    }
  });

  return summary;
}

module.exports = {
  isExpired,
  expiresBefore,
  expiresInDays,
  daysUntilExpiration,
  getExpirationSummary,
};
