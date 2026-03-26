'use strict';
const sharp = require('sharp');
const { analyzeDocument } = require('./vision.service');

const SPECS = {
  PASSPORT:       { w: 1200, h: 845,  quality: 88 },
  VISA:           { w: 1200, h: 845,  quality: 88 },
  PERMISO_SALIDA: { w: 900,  h: 1170, quality: 85 },
  OTHER:          { w: 1200, h: null, quality: 82 },
};

async function fetchBuffer(url) {
  const https = require('https');
  const http  = require('http');
  const lib   = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    lib.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function computeCropRegion(vertices, imgWidth, imgHeight) {
  if (!vertices || vertices.length < 4) return null;
  const xs = vertices.map(v => v.x || 0);
  const ys = vertices.map(v => v.y || 0);
  const left   = Math.max(0, Math.min(...xs));
  const top    = Math.max(0, Math.min(...ys));
  const right  = Math.min(imgWidth,  Math.max(...xs));
  const bottom = Math.min(imgHeight, Math.max(...ys));
  if (right - left < 50 || bottom - top < 50) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Normalize a document image:
 * 1. Auto-rotate via EXIF
 * 2. Google Vision → crop bounds + rotation angle + OCR text
 * 3. Correct rotation (< 45°)
 * 4. Crop to document content using Vision bounds
 * 5. Resize to spec per document type
 * 6. JPEG compress, enforce 600 KB limit
 *
 * Returns { buffer, visionText, visionConfidence }
 * visionText/visionConfidence come from the Vision call used for cropping.
 * Callers can reuse these to avoid a second Vision API call for OCR.
 */
async function normalizeDocument(rawBuffer, documentType) {
  const spec = SPECS[documentType] || SPECS.OTHER;

  // Step 1: EXIF auto-rotate, flatten alpha
  let workBuf = await sharp(rawBuffer)
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 95 })
    .toBuffer();

  // Step 2: Vision analysis (reuse text + confidence for OCR)
  let cropBounds       = null;
  let rotationAngle    = 0;
  let visionText       = '';
  let visionConfidence = 0;
  try {
    const v = await analyzeDocument(workBuf);
    cropBounds       = v.cropBounds;
    rotationAngle    = v.rotationAngle;
    visionText       = v.text || '';
    visionConfidence = v.confidence || 0;
  } catch (err) {
    console.warn('[imageNormalizer] Vision failed, skipping auto-crop/rotate:', err.message);
  }

  // Step 3: Rotation correction
  if (Math.abs(rotationAngle) > 0.5 && Math.abs(rotationAngle) < 45) {
    workBuf = await sharp(workBuf)
      .rotate(rotationAngle, { background: '#ffffff' })
      .jpeg({ quality: 95 })
      .toBuffer();
    // Remove rotation border artifacts (center crop 97%)
    const m = await sharp(workBuf).metadata();
    const cw = Math.round(m.width  * 0.97);
    const ch = Math.round(m.height * 0.97);
    workBuf = await sharp(workBuf)
      .extract({ left: Math.round((m.width - cw) / 2), top: Math.round((m.height - ch) / 2), width: cw, height: ch })
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  // Step 4: Crop to document bounds
  if (cropBounds) {
    const m = await sharp(workBuf).metadata();
    const region = computeCropRegion(cropBounds, m.width, m.height);
    if (region) {
      const padX = Math.round(region.width  * 0.02);
      const padY = Math.round(region.height * 0.02);
      const l  = Math.max(0, region.left   - padX);
      const t  = Math.max(0, region.top    - padY);
      const rw = Math.min(m.width  - l, region.width  + padX * 2);
      const rh = Math.min(m.height - t, region.height + padY * 2);
      try {
        workBuf = await sharp(workBuf)
          .extract({ left: l, top: t, width: rw, height: rh })
          .jpeg({ quality: 95 })
          .toBuffer();
      } catch (e) {
        console.warn('[imageNormalizer] Crop failed:', e.message);
      }
    }
  }

  // Step 5+6: resize + compress
  let q = spec.quality;
  let finalBuf;
  do {
    const r = sharp(workBuf);
    if (spec.h) {
      r.resize(spec.w, spec.h, { fit: 'inside', withoutEnlargement: true });
    } else {
      r.resize(spec.w, null,   { fit: 'inside', withoutEnlargement: true });
    }
    finalBuf = await r.jpeg({ quality: q }).toBuffer();
    q -= 5;
  } while (finalBuf.length > 600 * 1024 && q > 50);

  return { buffer: finalBuf, visionText, visionConfidence };
}

module.exports = { normalizeDocument, fetchBuffer };
