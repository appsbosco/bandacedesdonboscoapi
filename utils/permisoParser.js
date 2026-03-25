'use strict';

const MONTH_MAP = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

function parseSpanishDate(str) {
  if (!str) return null;
  const s = str.trim();
  const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    let [, d, m, y] = slash;
    if (y.length === 2) y = parseInt(y) > 50 ? '19' + y : '20' + y;
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return isNaN(date.getTime()) ? null : date;
  }
  const textual = s.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})/i);
  if (textual) {
    const [, d, monthStr, y] = textual;
    const m = MONTH_MAP[monthStr.toLowerCase()];
    if (m !== undefined) {
      const date = new Date(parseInt(y), m, parseInt(d));
      return isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

/**
 * Template-based field extraction for Costa Rican exit permits (permisos de salida).
 * Returns { fullName, documentNumber, expirationDate, destination, authorizerName,
 *           ocrConfidence, reasonCodes, ocrText }
 */
function parsePermisoSalida(ocrText) {
  const text = ocrText || '';
  const flat = text.split('\n').map(l => l.trim()).filter(Boolean).join(' ');

  const result = {
    fullName: null,
    documentNumber: null,
    expirationDate: null,
    destination: null,
    authorizerName: null,
    ocrConfidence: 0,
    reasonCodes: [],
    ocrText: text,
  };

  // Full name of minor
  const namePatterns = [
    /(?:menor[:\s]+|nombre[:\s]+|a\s+favor\s+de[:\s]+|autorizando?\s+(?:a|al|la)[:\s]+)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s']{3,60}?)(?=[,\n]|cédula|pasaporte|para|con|$)/i,
    /(?:AUTORIZO[:\s]+(?:a|al)[:\s]+)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s']{3,60}?)(?=[,\n]|cédula|para|$)/i,
  ];
  for (const p of namePatterns) {
    const m = flat.match(p);
    if (m) { result.fullName = m[1].trim(); break; }
  }

  // Document number
  const idPatterns = [
    /(?:cédula|cedula|pasaporte|identificaci[oó]n|n[°º]?\s*documento)[:\s#]*(\d[\d\-]{4,14})/i,
  ];
  for (const p of idPatterns) {
    const m = flat.match(p);
    if (m) { result.documentNumber = m[1].replace(/-/g, ''); break; }
  }

  // Expiration date
  const datePhrases = [
    /(?:vence|vencimiento|vigencia|válido\s+hasta|expira)[:\s]+([^\n,]{3,30})/i,
  ];
  for (const p of datePhrases) {
    const m = flat.match(p);
    if (m) { result.expirationDate = parseSpanishDate(m[1].trim()); break; }
  }

  // Destination
  const destPatterns = [
    /(?:destino|viajar?\s+a|salida\s+(?:a|hacia|para)|viaje\s+a)[:\s]+([A-ZÁÉÍÓÚÑa-záéíóúñ\s,\.]{2,60}?)(?=[\n,]|por|en|con|$)/i,
  ];
  for (const p of destPatterns) {
    const m = flat.match(p);
    if (m) { result.destination = m[1].trim(); break; }
  }

  // Authorizer
  const authPatterns = [
    /(?:autoriza[:\s]+|firmante[:\s]+|padre[:\s]+|madre[:\s]+|tutor[:\s]+)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s']{3,60}?)(?=[,\n]|cédula|$)/i,
  ];
  for (const p of authPatterns) {
    const m = flat.match(p);
    if (m) { result.authorizerName = m[1].trim(); break; }
  }

  const found = [result.fullName, result.documentNumber, result.expirationDate].filter(Boolean).length;
  result.ocrConfidence = found / 3;

  if (!result.fullName)        result.reasonCodes.push('NAME_NOT_FOUND');
  if (!result.documentNumber)  result.reasonCodes.push('ID_NOT_FOUND');
  if (!result.expirationDate)  result.reasonCodes.push('DATE_NOT_FOUND');

  return result;
}

module.exports = { parsePermisoSalida };
