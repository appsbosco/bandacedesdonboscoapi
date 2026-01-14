/**
 * Validador de MRZ (Machine Readable Zone) para pasaportes
 * Basado en ICAO Doc 9303
 */

const MRZ_WEIGHTS = [7, 3, 1];

/**
 * Convierte un caracter MRZ a su valor numérico
 */
function mrzCharValue(char) {
  if (char >= "0" && char <= "9") {
    return parseInt(char, 10);
  }
  if (char >= "A" && char <= "Z") {
    return char.charCodeAt(0) - "A".charCodeAt(0) + 10;
  }
  if (char === "<") {
    return 0;
  }
  return 0;
}

/**
 * Calcula el check digit para una cadena MRZ
 * @param {string} str - Cadena a validar
 * @returns {number} - Check digit esperado (0-9)
 */
function calculateCheckDigit(str) {
  let sum = 0;

  for (let i = 0; i < str.length; i++) {
    const weight = MRZ_WEIGHTS[i % 3];
    const value = mrzCharValue(str[i]);
    sum += value * weight;
  }

  return sum % 10;
}

/**
 * Valida un check digit
 * @param {string} data - Datos a validar
 * @param {string|number} checkDigit - Check digit a comparar
 * @returns {boolean}
 */
function validateCheckDigit(data, checkDigit) {
  if (!data || checkDigit === undefined) return false;

  const expected = calculateCheckDigit(data);
  const actual = parseInt(checkDigit, 10);

  return expected === actual;
}

/**
 * Estructura de un MRZ TD3 (pasaporte)
 * Línea 1: 44 caracteres
 * Línea 2: 44 caracteres
 */
function parseMRZTD3(mrzText) {
  // Limpiar y normalizar
  const lines = mrzText
    .toUpperCase()
    .replace(/\s/g, "")
    .split("\n")
    .filter((line) => line.length > 0);

  if (lines.length !== 2) {
    return {
      valid: false,
      error: "MRZ debe tener exactamente 2 líneas",
    };
  }

  const line1 = lines[0];
  const line2 = lines[1];

  if (line1.length !== 44 || line2.length !== 44) {
    return {
      valid: false,
      error: "Cada línea MRZ debe tener 44 caracteres",
    };
  }

  try {
    // Línea 1: Tipo, País emisor, Apellido, Nombre
    const documentType = line1.substring(0, 2);
    const issuingCountry = line1.substring(2, 5);
    const nameSection = line1.substring(5, 44);
    const nameParts = nameSection.split("<<");
    const surname = nameParts[0]?.replace(/</g, " ").trim();
    const givenNames = nameParts[1]?.replace(/</g, " ").trim();

    // Línea 2: Número de pasaporte, nacionalidad, fecha de nacimiento, sexo, fecha de expiración
    const passportNumber = line2.substring(0, 9).replace(/</g, "");
    const passportCheckDigit = line2[9];
    const nationality = line2.substring(10, 13);
    const dateOfBirth = line2.substring(13, 19);
    const dobCheckDigit = line2[19];
    const sex = line2[20];
    const expirationDate = line2.substring(21, 27);
    const expCheckDigit = line2[27];
    const personalNumber = line2.substring(28, 42).replace(/</g, "");
    const personalCheckDigit = line2[42];
    const finalCheckDigit = line2[43];

    // Validar check digits
    const passportValid = validateCheckDigit(
      line2.substring(0, 9),
      passportCheckDigit
    );
    const dobValid = validateCheckDigit(dateOfBirth, dobCheckDigit);
    const expValid = validateCheckDigit(expirationDate, expCheckDigit);
    const personalValid =
      personalNumber.length > 0
        ? validateCheckDigit(line2.substring(28, 42), personalCheckDigit)
        : true; // Personal number es opcional

    // Check digit final (toda la línea 2 excepto el último dígito)
    const compositeData =
      line2.substring(0, 10) +
      line2.substring(13, 20) +
      line2.substring(21, 43);
    const finalValid = validateCheckDigit(compositeData, finalCheckDigit);

    const allValid =
      passportValid && dobValid && expValid && personalValid && finalValid;

    return {
      valid: allValid,
      documentType,
      issuingCountry,
      surname,
      givenNames,
      passportNumber,
      nationality,
      dateOfBirth: parseMRZDate(dateOfBirth),
      sex: sex !== "<" ? sex : null,
      expirationDate: parseMRZDate(expirationDate),
      personalNumber: personalNumber || null,
      checksValid: {
        passport: passportValid,
        dateOfBirth: dobValid,
        expiration: expValid,
        personalNumber: personalValid,
        final: finalValid,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `Error parseando MRZ: ${error.message}`,
    };
  }
}

/**
 * Convierte fecha MRZ (YYMMDD) a Date
 * @param {string} mrzDate - Fecha en formato YYMMDD
 * @returns {Date|null}
 */
function parseMRZDate(mrzDate) {
  if (!mrzDate || mrzDate.length !== 6) return null;

  try {
    const year = parseInt(mrzDate.substring(0, 2), 10);
    const month = parseInt(mrzDate.substring(2, 4), 10);
    const day = parseInt(mrzDate.substring(4, 6), 10);

    // Determinar siglo (asumiendo que años > 50 son 1900s, <= 50 son 2000s)
    const fullYear = year > 50 ? 1900 + year : 2000 + year;

    return new Date(fullYear, month - 1, day);
  } catch (error) {
    return null;
  }
}

/**
 * Valida MRZ completo y retorna datos extraídos
 * @param {string} mrzText - Texto MRZ (2 líneas)
 * @returns {Object}
 */
function validateMRZ(mrzText) {
  if (!mrzText || typeof mrzText !== "string") {
    return {
      valid: false,
      error: "MRZ text requerido",
    };
  }

  // Por ahora solo soportamos TD3 (pasaportes)
  return parseMRZTD3(mrzText);
}

/**
 * Extrae datos básicos del MRZ sin validación estricta
 * Útil cuando el MRZ está parcialmente dañado pero queremos extraer lo que podamos
 */
function extractMRZData(mrzText) {
  try {
    const result = parseMRZTD3(mrzText);
    // Retornamos los datos aunque la validación falle
    return {
      ...result,
      extracted: true,
    };
  } catch (error) {
    return {
      valid: false,
      extracted: false,
      error: error.message,
    };
  }
}

module.exports = {
  validateMRZ,
  extractMRZData,
  calculateCheckDigit,
  validateCheckDigit,
  parseMRZDate,
};
