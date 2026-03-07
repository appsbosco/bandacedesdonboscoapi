/**
 * src/utils/excelParser.js
 *
 * Parser de Excel para importación de participantes de gira.
 * Recibe base64 del archivo Excel, devuelve filas normalizadas.
 */
"use strict";

const XLSX = require("xlsx");

/**
 * Normaliza un nombre de columna para matching flexible:
 * elimina tildes, mayúsculas, espacios extra.
 */
function normalizeHeader(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

/**
 * Mapeo de variantes de nombre de columna → campo interno.
 * Permite que el Excel tenga distintos encabezados en español.
 */
const COLUMN_MAP = {
  // firstName
  nombre: "firstName",
  nombres: "firstName",
  "nombre(s)": "firstName",
  primer_nombre: "firstName",
  first_name: "firstName",
  firstname: "firstName",

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

  // email
  correo: "email",
  correo_electronico: "email",
  email: "email",

  '(si_"si")_numero_de_pasaporte': "passportNumber",
  '(si_"si")_fecha_de_vencimiento_del_pasaporte': "passportExpiry",
  fecha_de_vencimiento_de_la_visa: "visaExpiry",
  fecha_de_emision_de_la_visa: "visaNumber",
  segundo_nombre: "secondName",
  correo_personal: "email",

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

  // passportExpiry
  vencimiento_pasaporte: "passportExpiry",
  expiracion_pasaporte: "passportExpiry",
  passport_expiry: "passportExpiry",

  // hasVisa
  visa: "hasVisa",
  tiene_visa: "hasVisa",
  has_visa: "hasVisa",

  // visaExpiry
  vencimiento_visa: "visaExpiry",
  visa_expiry: "visaExpiry",

  // hasExitPermit
  permiso_salida: "hasExitPermit",
  permiso_de_salida: "hasExitPermit",
  has_exit_permit: "hasExitPermit",
  exit_permit: "hasExitPermit",

  // role
  rol: "role",
  role: "role",

  // notes
  notas: "notes",
  observaciones: "notes",
  notes: "notes",

  numero_de_cedula: "identification",
  cedula_de_identidad: "identification",
  numero_cedula: "identification",
  numero: "identification",
  n_cedula: "identification",
  n_de_cedula: "identification",

  rol_en_la_gira: "role",
  tipo_de_participante: "role",
  categoria: "role",
};

/**
 * Parsea un valor booleano desde Excel (SI/NO, TRUE/FALSE, 1/0).
 */
function parseBoolean(val) {
  if (val === undefined || val === null || val === "") return false;
  const s = String(val).trim().toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "1" || s === "yes";
}

/**
 * Parsea una fecha desde Excel (número serial o string).
 */
function parseDate(val) {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (!date) return null;
    return new Date(date.y, date.m - 1, date.d).toISOString();
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * parseExcelBase64(base64, options)
 *
 * @param {string} base64 - Contenido del archivo Excel en base64
 * @param {object} [options]
 * @param {string} [options.sheetName] - Nombre de la hoja (default: primera hoja)
 * @returns {{ headers: string[], rows: object[], rawHeaders: string[] }}
 */
function parseExcelBase64(base64, options = {}) {
  const buffer = Buffer.from(base64, "base64");
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
    return COLUMN_MAP[norm] || norm; // fallback al nombre normalizado
  });

  console.log("Excel headers raw:", rawHeaders);
  console.log("Excel headers mapped:", mappedKeys);

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

      // Tipos especiales
      if (key === "hasVisa" || key === "hasExitPermit") {
        obj[key] = parseBoolean(rawVal);
      } else if (
        key === "birthDate" ||
        key === "passportExpiry" ||
        key === "visaExpiry"
      ) {
        obj[key] = parseDate(rawVal);
      } else if (rawVal !== "" && rawVal !== undefined) {
        obj[key] = String(rawVal).trim();
      }
    }

    obj.__rowIndex = i; // preservar número de fila original para errores
    rows.push(obj);
  }

  return { headers: mappedKeys, rawHeaders, rows };
}

module.exports = { parseExcelBase64, normalizeHeader };
