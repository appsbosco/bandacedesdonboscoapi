'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const Document = require('../models/Document');
const { analyzeDocument } = require('../services/vision.service');
const { normalizeDocument, fetchBuffer } = require('../services/imageNormalizer');
const { validateMRZ, extractMRZData } = require('../utils/mrz');
const { parsePermisoSalida } = require('../utils/permisoParser');

const POLL_MS    = parseInt(process.env.OCR_POLL_INTERVAL || '1500', 10);
const MAX_TRIES  = 5;
const MRZ_RE     = /^[A-Z0-9<]{30,44}$/;

// ─── helpers ────────────────────────────────────────────────────────────────

function extractMRZLines(text) {
  const candidates = text
    .split('\n')
    .map(l => l.trim().replace(/\s+/g, ''))
    .filter(l => MRZ_RE.test(l));

  // TD3: 2 × 44
  for (let i = 0; i < candidates.length - 1; i++) {
    if (candidates[i].length === 44 && candidates[i + 1].length === 44) {
      return candidates[i] + '\n' + candidates[i + 1];
    }
  }
  // TD1: 3 × 30
  for (let i = 0; i < candidates.length - 2; i++) {
    if (candidates[i].length === 30 && candidates[i + 1].length === 30 && candidates[i + 2].length === 30) {
      return candidates.slice(i, i + 3).join('\n');
    }
  }
  return null;
}

function parseEnglishDate(str) {
  const MONTHS = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const m = (str || '').toUpperCase().match(/(\d{1,2})\s*([A-Z]{3})\s*(\d{4})/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), MONTHS[m[2]], parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

async function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        format: 'jpg',
        access_mode: 'authenticated',
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

// ─── per-type processing ─────────────────────────────────────────────────────

async function processPassport(ocrText, ocrConfidence) {
  const extracted = { ocrText, ocrConfidence };
  const reasonCodes = [];

  const mrzText = extractMRZLines(ocrText);
  if (!mrzText) {
    reasonCodes.push('NO_MRZ_FOUND');
    return { extracted: { ...extracted, mrzValid: false, reasonCodes }, status: 'OCR_FAILED' };
  }

  const mrzResult = validateMRZ(mrzText);

  if (mrzResult.valid) {
    Object.assign(extracted, {
      fullName:        `${mrzResult.givenNames || ''} ${mrzResult.surname || ''}`.trim(),
      givenNames:      mrzResult.givenNames,
      surname:         mrzResult.surname,
      passportNumber:  mrzResult.passportNumber,
      nationality:     mrzResult.nationality,
      issuingCountry:  mrzResult.issuingCountry,
      dateOfBirth:     mrzResult.dateOfBirth,
      sex:             mrzResult.sex,
      expirationDate:  mrzResult.expirationDate,
      mrzRaw:          mrzText,
      mrzValid:        true,
      mrzFormat:       'TD3',
    });
    return { extracted: { ...extracted, reasonCodes }, status: 'OCR_SUCCESS' };
  }

  // Partial MRZ
  const partial = extractMRZData(mrzText);
  if (partial) {
    Object.assign(extracted, {
      ...partial,
      fullName: partial.givenNames && partial.surname
        ? `${partial.givenNames} ${partial.surname}`.trim()
        : null,
      mrzRaw:   mrzText,
      mrzValid: false,
    });
    reasonCodes.push('MRZ_CHECKDIGIT_FAIL');
  } else {
    reasonCodes.push('MRZ_PARSE_FAILED');
  }

  return { extracted: { ...extracted, reasonCodes }, status: 'OCR_SUCCESS' };
}

async function processVisa(ocrText, ocrConfidence) {
  // Base: same MRZ extraction as passport
  const base = await processPassport(ocrText, ocrConfidence);

  // Additional visa-specific fields from full text
  const visaType = ocrText.match(/(?:VISA\s*(?:TYPE|CLASS)|CLASS)[\/\s:]*([A-Z][A-Z0-9\/\-]{0,5})/i);
  if (visaType) base.extracted.visaType = visaType[1].trim();

  const issueDate = ocrText.match(/(?:ISSUE\s*DATE|ISSUED)[:\s]*(\d{1,2}\s*[A-Z]{3}\s*\d{4})/i);
  if (issueDate) base.extracted.issueDate = parseEnglishDate(issueDate[1]);

  const controlNo = ocrText.match(/(?:FOLIO|CONTROL)[:\s#]*([A-Z0-9]{6,12})/i);
  if (controlNo) base.extracted.visaControlNumber = controlNo[1];

  return base;
}

async function processPermisoSalida(ocrText, ocrConfidence) {
  const permisoResult = parsePermisoSalida(ocrText);
  const reasonCodes = permisoResult.reasonCodes || [];
  const extracted = {
    fullName:        permisoResult.fullName,
    documentNumber:  permisoResult.documentNumber,
    expirationDate:  permisoResult.expirationDate,
    destination:     permisoResult.destination,
    authorizerName:  permisoResult.authorizerName,
    ocrText,
    ocrConfidence:   permisoResult.ocrConfidence,
    mrzValid:        false,
    reasonCodes,
  };
  const status = permisoResult.ocrConfidence > 0.2 ? 'OCR_SUCCESS' : 'OCR_FAILED';
  return { extracted, status };
}

// ─── main claim-and-process loop ─────────────────────────────────────────────

async function poll() {
  const doc = await Document.findOneAndUpdate(
    { status: 'OCR_PENDING', ocrAttempts: { $lt: MAX_TRIES }, isDeleted: { $ne: true } },
    { $set: { status: 'OCR_PROCESSING', ocrUpdatedAt: new Date() } },
    { new: true }
  );
  if (!doc) return;

  console.log(`[OCR] claimed ${doc._id} type=${doc.type} attempt=${doc.ocrAttempts}`);

  try {
    const rawImage = doc.images.find(img => img.kind === 'RAW');
    if (!rawImage) throw new Error('No RAW image found on document');

    // 1. Download
    const rawBuf = await fetchBuffer(rawImage.url);

    // 2. Normalize (Vision-guided rotate+crop+resize) — now returns OCR text too
    const { buffer: normalizedBuf, visionText, visionConfidence } = await normalizeDocument(rawBuf, doc.type);

    // 3. Reuse OCR text from normalization Vision call (avoids second API call)
    let ocrText = visionText;
    let ocrConfidence = visionConfidence;

    // Only call Vision again if normalization didn't return usable text
    if (!ocrText || ocrText.length < 20) {
      const fallback = await analyzeDocument(normalizedBuf);
      ocrText = fallback.text;
      ocrConfidence = fallback.confidence;
    }

    // 4. Type-specific extraction
    let result;
    if (doc.type === 'PASSPORT') {
      result = await processPassport(ocrText, ocrConfidence);
    } else if (doc.type === 'VISA') {
      result = await processVisa(ocrText, ocrConfidence);
    } else if (doc.type === 'PERMISO_SALIDA') {
      result = await processPermisoSalida(ocrText, ocrConfidence);
    } else {
      // OTHER: no OCR, just normalize image
      result = { extracted: { ocrText: '', ocrConfidence: 0, mrzValid: false, reasonCodes: ['NO_OCR_FOR_TYPE'] }, status: 'OCR_SUCCESS' };
    }

    // 5. Upload normalized image
    const ownerId = doc.owner.toString();
    const uploadResult = await uploadToCloudinary(
      normalizedBuf,
      `documents/${ownerId}/normalized`
    );

    // 6. Persist results via Mongoose (triggers pre-save encryption)
    await Document.findByIdAndUpdate(doc._id, {
      $push: {
        images: {
          kind:      'NORMALIZED',
          url:       uploadResult.secure_url,
          provider:  'CLOUDINARY',
          publicId:  uploadResult.public_id,
          width:     uploadResult.width,
          height:    uploadResult.height,
          bytes:     uploadResult.bytes,
          mimeType:  'image/jpeg',
          uploadedAt: new Date(),
        },
      },
    });

    const updatedDoc = await Document.findById(doc._id);
    if (!updatedDoc.extracted) updatedDoc.extracted = {};
    Object.assign(updatedDoc.extracted, result.extracted);
    updatedDoc.status       = result.status;
    updatedDoc.source       = 'OCR';
    updatedDoc.ocrUpdatedAt = new Date();
    if (result.status === 'OCR_FAILED') {
      updatedDoc.ocrLastError = (result.extracted.reasonCodes || []).join(',');
    }
    await updatedDoc.save();

    console.log(`[OCR] ${doc._id} → ${result.status} confidence=${(result.extracted.ocrConfidence || 0).toFixed(2)}`);

  } catch (err) {
    console.error(`[OCR] error on ${doc._id}:`, err.message);
    await Document.findByIdAndUpdate(doc._id, {
      $set: {
        status:       doc.ocrAttempts >= MAX_TRIES ? 'OCR_FAILED' : 'OCR_PENDING',
        ocrLastError: err.message,
        ocrUpdatedAt: new Date(),
      },
    });
  }
}

// ─── startup ────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DB_MONGO, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('[OCR Worker] Connected to MongoDB. Poll interval:', POLL_MS, 'ms');

  cloudinary.config({
    cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
    api_key:     process.env.CLOUDINARY_API_KEY,
    api_secret:  process.env.CLOUDINARY_API_SECRET,
  });

  const loop = async () => {
    try { await poll(); } catch (e) { console.error('[OCR Worker] poll error:', e.message); }
    setTimeout(loop, POLL_MS);
  };
  loop();
}

process.on('SIGTERM', async () => {
  console.log('[OCR Worker] Shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

main().catch(err => { console.error('[OCR Worker] Fatal:', err); process.exit(1); });
