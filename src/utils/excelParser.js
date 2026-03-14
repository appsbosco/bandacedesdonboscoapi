/**
 * src/utils/excelParser.js
 *
 * Parser de Excel para importación de participantes de gira.
 * Recibe base64 del archivo Excel, devuelve filas normalizadas.
 *
 * FIXES:
 * - parseDate ahora maneja DD/MM/YYYY (formato costarricense) correctamente
 * - Fechas numéricas seriales de Excel usan UTC para evitar offset de timezone
 * - normalizeHeader ahora elimina TODO carácter no alfanumérico (no solo espacios)
 *   para ser resistente a caracteres invisibles, ¿, (, ), ", BOM, etc. en los
 *   encabezados reales del Excel / Google Forms.
 * - COLUMN_MAP actualizado para reflejar la nueva normalización más agresiva.
 */
"use strict";

const XLSX = require("xlsx");

/**
 * Normaliza un encabezado de columna a una clave snake_case limpia.
 *
 * Pasos:
 *  1. trim()
 *  2. toLowerCase()
 *  3. normalize("NFD")  — descompone letras acentuadas en letra + combining char
 *  4. strip combining diacritics (U+0300–U+036F)  — elimina los acentos
 *  5. reemplaza CUALQUIER secuencia de caracteres no alfanuméricos por "_"
 *     (captura espacios, ¿, ?, (, ), ", BOM U+FEFF, caracteres invisibles, etc.)
 *  6. trim de guiones bajos al inicio/final
 *
 * Ejemplos:
 *   "Primer nombre"          → "primer_nombre"
 *   "Identificación"         → "identificacion"
 *   "¿Menor de edad?"        → "menor_de_edad"
 *   "Dirección de correo…"   → "direccion_de_correo_electronico"
 *   "(si \"si\") Pasaporte"  → "si_si_pasaporte"
 *   "  fecha_de_nacimiento " → "fecha_de_nacimiento"
 */
function normalizeHeader(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip combining diacritics (accents)
    .replace(/[^a-z0-9]+/g, "_")        // collapse any non-alphanumeric run → "_"
    .replace(/^_+|_+$/g, "");           // trim leading/trailing underscores
}

/**
 * COLUMN_MAP
 *
 * IMPORTANTE: las claves deben ser el resultado exacto de normalizeHeader()
 * aplicado al encabezado real del Excel.
 * Con la nueva normalización, NO pueden contener paréntesis, comillas ni
 * caracteres especiales — solo [a-z0-9_].
 */
const COLUMN_MAP = {
  // firstName
  nombre: "firstName",
  nombres: "firstName",
  nombre_s: "firstName",           // era "nombre(s)" — paréntesis eliminados por nueva normalización
  primer_nombre: "firstName",
  first_name: "firstName",
  firstname: "firstName",
  // segundo_nombre: "firstName" — REMOVED: en Google Forms hay columnas separadas
  // "Primer nombre" y "Segundo nombre". Mapear segundo_nombre a firstName sobreescribía
  // el primer nombre con el segundo, o con vacío si Google Forms exporta la celda como " ".
  // El modelo TourParticipant no tiene campo para segundo nombre; se ignora.

  // firstSurname
  apellido: "firstSurname",
  primer_apellido: "firstSurname",
  apellido_paterno: "firstSurname",
  last_name: "firstSurname",
  lastname: "firstSurname",
  first_surname: "firstSurname",
  firstsurname: "firstSurname",

  // secondSurname
  segundo_apellido: "secondSurname",
  apellido_materno: "secondSurname",
  second_surname: "secondSurname",
  secondsurname: "secondSurname",

  // identification
  cedula: "identification",
  cedula_de_identidad: "identification",
  identificacion: "identification",
  id: "identification",
  identification: "identification",
  numero_de_identificacion: "identification",
  dni: "identification",
  numero_de_cedula: "identification",
  numero_cedula: "identification",
  numero: "identification",
  n_cedula: "identification",
  n_de_cedula: "identification",

  // email
  correo: "email",
  correo_electronico: "email",
  correo_personal: "email",
  email: "email",
  // "Dirección de correo electrónico" — columna de Google Forms
  direccion_de_correo_electronico: "email",
  direccion_de_correo: "email",

  // phone
  telefono: "phone",
  celular: "phone",
  numero_de_telefono: "phone",
  phone: "phone",

  // birthDate
  fecha_de_nacimiento: "birthDate",
  nacimiento: "birthDate",
  birthdate: "birthDate",
  birth_date: "birthDate",
  fecha_nacimiento: "birthDate",

  // instrument
  instrumento: "instrument",
  instrument: "instrument",
  seccion: "instrument",

  // grade
  grado: "grade",
  nivel: "grade",
  grade: "grade",

  // passportNumber
  pasaporte: "passportNumber",
  numero_de_pasaporte: "passportNumber",
  passport: "passportNumber",
  passport_number: "passportNumber",
  passportnumber: "passportNumber",
  // era '(si_"si")_numero_de_pasaporte' — forma nueva tras normalización agresiva:
  si_si_numero_de_pasaporte: "passportNumber",

  // passportExpiry
  vencimiento_pasaporte: "passportExpiry",
  expiracion_pasaporte: "passportExpiry",
  passport_expiry: "passportExpiry",
  // era '(si_"si")_fecha_de_vencimiento_del_pasaporte':
  si_si_fecha_de_vencimiento_del_pasaporte: "passportExpiry",
  fecha_de_vencimiento_del_pasaporte: "passportExpiry",

  // hasVisa
  visa: "hasVisa",
  tiene_visa: "hasVisa",
  has_visa: "hasVisa",

  // visaExpiry
  vencimiento_visa: "visaExpiry",
  visa_expiry: "visaExpiry",
  fecha_de_vencimiento_de_la_visa: "visaExpiry",
  fecha_de_emision_de_la_visa: "visaExpiry", // algunos Excel lo usan mal

  // hasExitPermit
  permiso_salida: "hasExitPermit",
  permiso_de_salida: "hasExitPermit",
  has_exit_permit: "hasExitPermit",
  exit_permit: "hasExitPermit",

  // role
  rol: "role",
  role: "role",
  rol_en_la_gira: "role",
  tipo_de_participante: "role",
  categoria: "role",

  // notes
  notas: "notes",
  observaciones: "notes",
  notes: "notes",
};

function parseBoolean(val) {
  if (val === undefined || val === null || val === "") return false;
  const s = String(val).trim().toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "1" || s === "yes";
}

/**
 * Parsea una fecha desde Excel con soporte completo:
 *
 * 1. Número serial de Excel → fecha UTC (evita offset de timezone)
 * 2. String DD/MM/YYYY → ISO UTC (formato costarricense más común)
 * 3. String DD-MM-YYYY → ISO UTC
 * 4. String YYYY-MM-DD → ISO UTC (ISO estándar)
 * 5. String MM/DD/YYYY → ISO UTC (formato americano, fallback)
 * 6. Objeto Date (cuando cellDates: true) → ISO UTC
 *
 * Siempre retorna ISO string al mediodía UTC para evitar que timezones
 * desplacen la fecha un día.
 */
function parseDate(val) {
  if (val === undefined || val === null || val === "") return null;

  // Caso: objeto Date (si xlsx se configuró con cellDates:true)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return toNoonUTC(
      val.getUTCFullYear(),
      val.getUTCMonth() + 1,
      val.getUTCDate(),
    );
  }

  // Caso: número serial de Excel
  if (typeof val === "number") {
    // XLSX.SSF.parse_date_code devuelve { y, m, d, H, M, S }
    const parts = XLSX.SSF.parse_date_code(val);
    if (!parts || !parts.y) return null;
    return toNoonUTC(parts.y, parts.m, parts.d);
  }

  // Caso: string
  const s = String(val).trim();
  if (!s) return null;

  // DD/MM/YYYY o DD-MM-YYYY (formato Costa Rica / Europa)
  const dmySlash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmySlash) {
    const [, d, m, y] = dmySlash;
    return toNoonUTC(parseInt(y), parseInt(m), parseInt(d));
  }

  // YYYY-MM-DD (ISO 8601)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return toNoonUTC(parseInt(y), parseInt(m), parseInt(d));
  }

  // YYYY/MM/DD
  const ymdSlash = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymdSlash) {
    const [, y, m, d] = ymdSlash;
    return toNoonUTC(parseInt(y), parseInt(m), parseInt(d));
  }

  // MM/DD/YYYY (formato americano — solo como último recurso)
  // Solo lo intentamos si el primer número es claramente un mes (≤12)
  // y el segundo es claramente un día (≤31)
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, first, second, y] = mdyMatch;
    const firstN = parseInt(first);
    const secondN = parseInt(second);
    // Heurística: si first > 12, debe ser DD/MM/YYYY ya capturado arriba.
    // Si llegamos aquí, ambos son ≤12 → ambiguo, asumimos MM/DD/YYYY
    return toNoonUTC(parseInt(y), firstN, secondN);
  }

  // Fallback: intentar con Date.parse (maneja formatos como "Jan 15, 2005")
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) {
    return toNoonUTC(
      fallback.getUTCFullYear(),
      fallback.getUTCMonth() + 1,
      fallback.getUTCDate(),
    );
  }

  console.warn(`[excelParser] No se pudo parsear fecha: "${val}"`);
  return null;
}

/**
 * Construye un ISO string al mediodía UTC para evitar que cualquier
 * conversión de timezone desplace la fecha un día hacia adelante o atrás.
 *
 * Por ejemplo, "2005-01-15T12:00:00.000Z" en cualquier timezone del mundo
 * sigue siendo 15 de enero de 2005.
 */
function toNoonUTC(year, month, day) {
  // Validar rangos básicos
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  // Verificar que la fecha sea válida (ej. 31 de febrero no existe)
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    console.warn(`[excelParser] Fecha inválida: ${day}/${month}/${year}`);
    return null;
  }

  return d.toISOString();
}

/**
 * parseExcelBase64(base64, options)
 */
function parseExcelBase64(base64, options = {}) {
  const buffer = Buffer.from(base64, "base64");
  // cellDates: false para recibir números seriales y manejarlos nosotros
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  const sheetName = options.sheetName || workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error(
      options.sheetName
        ? `Hoja "${options.sheetName}" no encontrada en el archivo`
        : "El archivo Excel no contiene hojas",
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rawRows.length === 0) {
    return { headers: [], rows: [], rawHeaders: [] };
  }

  const rawHeaders = rawRows[0].map((h) => String(h || "").trim());

  const mappedKeys = rawHeaders.map((h) => {
    const norm = normalizeHeader(h);
    return COLUMN_MAP[norm] || norm;
  });

  // Diagnostic logging — visible en los logs del servidor
  console.log("[excelParser] Headers raw:   ", rawHeaders);
  console.log("[excelParser] Headers mapped:", mappedKeys);

  // Advertir sobre encabezados que no se mapearon a ningún campo conocido
  rawHeaders.forEach((h, i) => {
    const norm = normalizeHeader(h);
    const mapped = COLUMN_MAP[norm];
    if (!mapped && h.trim() !== "") {
      console.log(
        `[excelParser] Sin mapeo → col ${i} raw="${h}" norm="${norm}" (se ignora)`
      );
    }
  });

  const DATE_FIELDS = new Set(["birthDate", "passportExpiry", "visaExpiry"]);
  const BOOL_FIELDS = new Set(["hasVisa", "hasExitPermit"]);

  const rows = [];
  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const isEmpty = rawRow.every(
      (cell) => cell === "" || cell === null || cell === undefined,
    );
    if (isEmpty) continue;

    const obj = {};
    for (let j = 0; j < mappedKeys.length; j++) {
      const key = mappedKeys[j];
      const rawVal = rawRow[j];

      if (BOOL_FIELDS.has(key)) {
        obj[key] = parseBoolean(rawVal);
      } else if (DATE_FIELDS.has(key)) {
        const parsed = parseDate(rawVal);
        if (parsed !== null) {
          obj[key] = parsed;
        }
        // Log para debug de fechas de nacimiento
        if (key === "birthDate" && rawVal !== "" && rawVal !== undefined) {
          console.log(
            `[excelParser] birthDate row ${i}: raw="${rawVal}" → parsed="${parsed}"`,
          );
        }
      } else {
        // Trim primero; ignorar si queda vacío (Google Forms exporta celdas vacías como " ")
        const strVal = rawVal !== undefined && rawVal !== null
          ? String(rawVal).trim()
          : "";
        if (strVal !== "") {
          // "First-wins": no sobreescribir un campo que ya tiene valor con uno nuevo del mismo tipo.
          // Esto protege cuando dos columnas mapean al mismo campo (ej. futuras variantes de nombre).
          if (obj[key] === undefined) {
            obj[key] = strVal;
          }
        }
      }
    }

    obj.__rowIndex = i;
    rows.push(obj);
  }

  return { headers: mappedKeys, rawHeaders, rows };
}

module.exports = { parseExcelBase64, normalizeHeader, parseDate, toNoonUTC };
