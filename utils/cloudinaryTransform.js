"use strict";

/**
 * Genera URLs de Cloudinary con transformaciones optimizadas.
 * No hace llamadas de red — solo construye la URL estáticamente.
 * El cliente puede usar estas URLs directamente; Cloudinary las sirve cacheadas en CDN.
 *
 * Retrocompatibilidad: si publicId es null/undefined, retorna null.
 * El consumidor debe hacer fallback a evidenceUrl original.
 */

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

function base(resourceType = "image") {
  if (!CLOUD_NAME) return null;
  // Para PDFs subidos como resource_type=image: se acceden igual que imágenes
  // Para raw (PDFs binarios): no hay preview disponible via URL transform
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload`;
}

/**
 * Thumbnail para listas: 120×120, crop fill, auto format/quality.
 * Pesa ~3-8 KB vs ~300 KB-3 MB del original.
 * Para PDFs (resource_type=image): renderiza la primera página.
 * Para raw: retorna null.
 */
function buildThumbnailUrl(publicId, resourceType = "image") {
  if (!publicId || !CLOUD_NAME) return null;
  if (resourceType === "raw") return null;
  return `${base()}/f_auto,q_auto:eco,w_120,h_120,c_fill/${publicId}`;
}

/**
 * Preview para modal: hasta 800px de ancho, sin recorte, auto format/quality.
 * Pesa ~40-150 KB vs el original completo.
 * Para raw: retorna null (el modal debe usar evidenceUrl original).
 */
function buildPreviewUrl(publicId, resourceType = "image") {
  if (!publicId || !CLOUD_NAME) return null;
  if (resourceType === "raw") return null;
  return `${base()}/f_auto,q_auto,w_800,c_limit/${publicId}`;
}

module.exports = { buildThumbnailUrl, buildPreviewUrl };
