const crypto = require("crypto");

// Configuración de cifrado AES-256-GCM
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Obtiene la clave de cifrado desde las variables de entorno
 * Debe ser una clave de 32 bytes (256 bits) en base64
 */
function getEncryptionKey() {
  const key = process.env.DOCUMENT_ENCRYPTION_KEY;

  if (!key) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY no está configurada en .env");
  }

  // La key debe estar en base64 y ser de 32 bytes
  const keyBuffer = Buffer.from(key, "base64");

  if (keyBuffer.length !== 32) {
    throw new Error(
      "DOCUMENT_ENCRYPTION_KEY debe ser de 32 bytes (256 bits) en base64"
    );
  }

  return keyBuffer;
}

/**
 * Cifra un campo sensible usando AES-256-GCM
 * @param {string} text - Texto plano a cifrar
 * @returns {string} - Texto cifrado en formato: iv:authTag:encrypted (todo en base64)
 */
function encryptField(text) {
  if (!text) return text;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    // Formato: iv:authTag:encrypted (todo en base64)
    return `${iv.toString("base64")}:${authTag.toString(
      "base64"
    )}:${encrypted}`;
  } catch (error) {
    console.error("Error en encryptField:", error);
    throw new Error("Error cifrando campo sensible");
  }
}

/**
 * Descifra un campo cifrado
 * @param {string} encryptedData - Datos cifrados en formato iv:authTag:encrypted
 * @returns {string} - Texto plano
 */
function decryptField(encryptedData) {
  if (!encryptedData) return encryptedData;

  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(":");

    if (parts.length !== 3) {
      throw new Error("Formato de datos cifrados inválido");
    }

    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Error en decryptField:", error);
    throw new Error("Error descifrando campo sensible");
  }
}

/**
 * Genera una nueva clave de cifrado (usar solo una vez para setup inicial)
 * Ejecutar: node -e "console.log(require('./utils/encryption').generateEncryptionKey())"
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString("base64");
}

/**
 * Hash one-way para búsquedas (cuando no necesitas descifrar)
 * Útil para índices o búsquedas sin revelar datos
 */
function hashField(text) {
  if (!text) return text;

  const pepper = process.env.DOCUMENT_HASH_PEPPER || "default-pepper-change-me";
  return crypto.createHmac("sha256", pepper).update(text).digest("base64");
}

module.exports = {
  encryptField,
  decryptField,
  generateEncryptionKey,
  hashField,
};
