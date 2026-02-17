#!/usr/bin/env node
/**
 * OCR Worker — standalone process
 *
 * Polls MongoDB for documents with status=OCR_PENDING,
 * atomically claims them (OCR_PROCESSING), then:
 *   1. Downloads RAW image from Cloudinary
 *   2. Normalizes (rotate, resize, enhance) with sharp
 *   3. Extracts MRZ ROI (bottom portion for TD3)
 *   4. Runs OCR on MRZ with tesseract.js
 *   5. Parses + validates MRZ (ICAO 9303 check digits)
 *   6. Uploads NORMALIZED image to Cloudinary
 *   7. Updates document with extracted data + status
 *
 * Usage: node workers/ocr-worker.js
 * Env:   MONGODB_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
require("dotenv").config({ path: "./config/.env" });

const mongoose = require("mongoose");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;
const { createWorker } = require("tesseract.js");
const { validateMRZ, extractMRZData } = require("../utils/mrz");

// ── Config ──────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = parseInt(process.env.OCR_POLL_INTERVAL || "5000", 10);
const MAX_CONSECUTIVE_ERRORS = 10;

// Normalized output specs per document type
const NORMALIZE_SPECS = {
  PASSPORT: { width: 1200, height: 800, maxBytes: 350_000 },
  VISA: { width: 1200, height: 756, maxBytes: 300_000 },
  PERMISO_SALIDA: { width: 1240, height: 1754, maxBytes: 500_000 },
  OTHER: { width: 1200, height: 800, maxBytes: 350_000 },
};

// MRZ ROI: fraction of image height from the bottom
const MRZ_ROI_FRACTION = 0.28;

// ── Cloudinary setup ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── MongoDB ─────────────────────────────────────────────────────────────────
let Document;

async function connectDB() {
  const uri = process.env.DB_MONGO;
  await mongoose.connect(uri);
  Document = require("../models/Document");
  console.log("[ocr-worker] Connected to MongoDB");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadBuffer(buffer, documentId, kind) {
  const folder = `documents/${documentId}/${kind.toLowerCase()}`;
  const publicId = `${folder}/${Date.now()}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "image",
        format: "jpg",
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

// ── Image processing ────────────────────────────────────────────────────────

async function normalizeImage(buffer, docType) {
  const spec = NORMALIZE_SPECS[docType] || NORMALIZE_SPECS.OTHER;

  // Auto-rotate based on EXIF, resize to spec, flatten alpha
  let pipeline = sharp(buffer)
    .rotate() // auto-orient via EXIF
    .resize(spec.width, spec.height, { fit: "cover", position: "centre" })
    .flatten({ background: { r: 255, g: 255, b: 255 } });

  // Try quality levels to meet maxBytes
  for (const quality of [88, 82, 78, 72]) {
    const result = await pipeline.clone().jpeg({ quality }).toBuffer();
    if (result.length <= spec.maxBytes || quality === 72) {
      return result;
    }
  }

  return pipeline.jpeg({ quality: 72 }).toBuffer();
}

async function extractMrzRoi(buffer, docType) {
  const metadata = await sharp(buffer).metadata();
  const { width, height } = metadata;

  // MRZ is at the bottom portion of the document
  const roiFraction = docType === "PASSPORT" ? MRZ_ROI_FRACTION : 0.35;
  const roiHeight = Math.round(height * roiFraction);
  const roiTop = height - roiHeight;

  // Extract, enhance for OCR: grayscale + high contrast + sharpen
  const roiBuffer = await sharp(buffer)
    .extract({ left: 0, top: roiTop, width, height: roiHeight })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .png() // lossless for OCR
    .toBuffer();

  return roiBuffer;
}

// ── OCR ─────────────────────────────────────────────────────────────────────

let tesseractWorker = null;

async function getTesseractWorker() {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker("eng");
    await tesseractWorker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: "6", // Assume uniform block of text
    });
  }
  return tesseractWorker;
}

/**
 * Common OCR confusion corrections for MRZ
 */
function fixOcrConfusions(text) {
  return text
    .replace(/O(?=\d)/g, "0") // O before digit → 0
    .replace(/(?<=\d)O/g, "0") // O after digit → 0
    .replace(/I(?=\d)/g, "1") // I before digit → 1
    .replace(/(?<=\d)I/g, "1") // I after digit → 1
    .replace(/B(?=\d)/g, "8") // B near digits → 8
    .replace(/S(?=\d)/g, "5") // S near digits → 5
    .replace(/Z(?=\d)/g, "2"); // Z near digits → 2
}

async function ocrMrz(roiBuffer) {
  const worker = await getTesseractWorker();
  const { data } = await worker.recognize(roiBuffer);

  // Clean up: force uppercase, keep only MRZ chars, normalize lines
  let text = data.text
    .toUpperCase()
    .replace(/[^A-Z0-9<\n]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 28); // Min TD1 line length

  // Apply confusion corrections
  text = text.map(fixOcrConfusions);

  return {
    rawText: text.join("\n"),
    confidence: data.confidence / 100, // normalize to 0-1
    lines: text,
  };
}

// ── Rotation detection ──────────────────────────────────────────────────────

async function tryRotationsForMrz(imageBuffer, docType) {
  const rotations = [0, 180]; // Most common: right-side-up or upside-down

  let bestResult = null;
  let bestScore = -1;

  for (const degrees of rotations) {
    try {
      const rotated =
        degrees === 0
          ? imageBuffer
          : await sharp(imageBuffer).rotate(degrees).toBuffer();

      const roi = await extractMrzRoi(rotated, docType);
      const ocrResult = await ocrMrz(roi);

      if (ocrResult.lines.length < 2) continue;

      // Try to parse as TD3 (2 lines x 44 chars)
      const mrzText = ocrResult.lines.slice(0, 2).join("\n");
      const parseResult = validateMRZ(mrzText);

      // Score: valid MRZ trumps all, otherwise use confidence
      let score = ocrResult.confidence;
      if (parseResult.valid) score += 10; // huge bonus for valid checksums

      if (score > bestScore) {
        bestScore = score;
        bestResult = {
          rotation: degrees,
          imageBuffer: rotated,
          ocrResult,
          mrzText,
          parseResult,
        };
      }

      // If valid, no need to try more rotations
      if (parseResult.valid) break;
    } catch (err) {
      console.warn(`[ocr-worker] Rotation ${degrees}° failed:`, err.message);
    }
  }

  return bestResult;
}

// ── Main processing pipeline ────────────────────────────────────────────────

async function processDocument(doc) {
  const startTime = Date.now();
  const docId = String(doc._id);
  const docType = doc.type || "PASSPORT";

  console.log(
    `[ocr-worker] Processing ${docId} (type=${docType}, attempt=${doc.ocrAttempts || 1})`,
  );

  // 1. Find RAW image
  const rawImage = doc.images.find((img) => img.kind === "RAW");
  if (!rawImage?.url) {
    throw new Error("No RAW image URL found");
  }

  // 2. Download
  console.log(`[ocr-worker] [${docId}] Downloading RAW...`);
  const rawBuffer = await downloadImage(rawImage.url);
  console.log(`[ocr-worker] [${docId}] Downloaded ${rawBuffer.length} bytes`);

  // 3. Try rotations and OCR
  console.log(`[ocr-worker] [${docId}] Running OCR with rotation detection...`);
  const mrzResult = await tryRotationsForMrz(rawBuffer, docType);

  const reasonCodes = [];
  let extracted = {};
  let mrzValid = false;
  let mrzFormat = null;
  let ocrConfidence = 0;
  let mrzRaw = null;
  let orientedBuffer = rawBuffer;

  if (mrzResult) {
    orientedBuffer = mrzResult.imageBuffer;
    ocrConfidence = mrzResult.ocrResult.confidence;
    mrzRaw = mrzResult.mrzText;

    if (mrzResult.parseResult.valid) {
      mrzValid = true;
      mrzFormat = "TD3";
      const p = mrzResult.parseResult;
      extracted = {
        fullName: [p.givenNames, p.surname].filter(Boolean).join(" "),
        givenNames: p.givenNames || null,
        surname: p.surname || null,
        nationality: p.nationality || null,
        issuingCountry: p.issuingCountry || null,
        passportNumber: p.passportNumber || null,
        documentNumber: p.passportNumber || null,
        dateOfBirth: p.dateOfBirth || null,
        sex: p.sex || null,
        expirationDate: p.expirationDate || null,
      };
    } else {
      // Try extracting partial data even if validation fails
      const partial = extractMRZData(mrzResult.mrzText);
      if (partial.extracted) {
        extracted = {
          fullName:
            [partial.givenNames, partial.surname].filter(Boolean).join(" ") ||
            null,
          givenNames: partial.givenNames || null,
          surname: partial.surname || null,
          nationality: partial.nationality || null,
          issuingCountry: partial.issuingCountry || null,
          passportNumber: partial.passportNumber || null,
          documentNumber: partial.passportNumber || null,
          dateOfBirth: partial.dateOfBirth || null,
          sex: partial.sex || null,
          expirationDate: partial.expirationDate || null,
        };
        mrzFormat = "TD3";
      }
      // Determine reason codes
      if (!mrzResult.parseResult.checksValid) {
        reasonCodes.push("CHECKDIGIT");
      }
      if (ocrConfidence < 0.6) {
        reasonCodes.push("BLUR");
      }
    }
  } else {
    reasonCodes.push("LENGTH"); // couldn't find valid MRZ lines
  }

  // 4. Normalize image
  console.log(`[ocr-worker] [${docId}] Normalizing image...`);
  const normalizedBuffer = await normalizeImage(orientedBuffer, docType);

  // 5. Upload NORMALIZED to Cloudinary
  console.log(`[ocr-worker] [${docId}] Uploading NORMALIZED...`);
  const uploadResult = await uploadBuffer(
    normalizedBuffer,
    docId,
    "NORMALIZED",
  );

  // 6. Build update
  const normalizedImage = {
    kind: "NORMALIZED",
    url: uploadResult.secure_url,
    provider: "CLOUDINARY",
    publicId: uploadResult.public_id,
    width: uploadResult.width,
    height: uploadResult.height,
    bytes: uploadResult.bytes,
    mimeType: `image/${uploadResult.format}`,
    uploadedAt: new Date(),
  };

  const extractedUpdate = {
    ...extracted,
    mrzRaw: mrzRaw || null,
    mrzValid,
    mrzFormat,
    ocrConfidence,
    reasonCodes: reasonCodes.length > 0 ? reasonCodes : [],
    ocrText: mrzResult?.ocrResult?.rawText || null,
  };

  const newStatus = mrzValid
    ? "OCR_SUCCESS"
    : mrzRaw
      ? "OCR_SUCCESS"
      : "OCR_FAILED";

  // 7. Update document atomically
  await Document.findByIdAndUpdate(doc._id, {
    $push: { images: normalizedImage },
    $set: {
      status: newStatus,
      extracted: extractedUpdate,
      ocrLastError: mrzValid
        ? null
        : reasonCodes.join(", ") || "Could not read MRZ",
      ocrUpdatedAt: new Date(),
    },
  });

  const elapsed = Date.now() - startTime;
  console.log(
    `[ocr-worker] [${docId}] Done in ${elapsed}ms → status=${newStatus}, mrzValid=${mrzValid}, confidence=${(ocrConfidence * 100).toFixed(1)}%`,
  );
}

// ── Claim & process loop ────────────────────────────────────────────────────

async function claimAndProcess() {
  // Atomic claim: find OCR_PENDING and set to OCR_PROCESSING in one op
  const doc = await Document.findOneAndUpdate(
    { status: "OCR_PENDING", isDeleted: { $ne: true } },
    {
      $set: {
        status: "OCR_PROCESSING",
        ocrUpdatedAt: new Date(),
      },
    },
    { new: true, sort: { ocrUpdatedAt: 1, createdAt: 1 } }, // oldest first
  );

  if (!doc) return false; // nothing to process

  try {
    await processDocument(doc);
  } catch (err) {
    console.error(`[ocr-worker] [${doc._id}] ERROR:`, err.message);

    // Mark as failed
    await Document.findByIdAndUpdate(doc._id, {
      $set: {
        status: "OCR_FAILED",
        ocrLastError: err.message,
        ocrUpdatedAt: new Date(),
      },
    });
  }

  return true; // processed one
}

// ── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  console.log("[ocr-worker] Starting...");
  await connectDB();

  // Pre-warm tesseract worker
  console.log("[ocr-worker] Initializing Tesseract...");
  await getTesseractWorker();
  console.log(
    "[ocr-worker] Tesseract ready. Polling every",
    POLL_INTERVAL_MS,
    "ms",
  );

  let consecutiveErrors = 0;

  // Graceful shutdown
  let running = true;
  const shutdown = async () => {
    console.log("\n[ocr-worker] Shutting down...");
    running = false;
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    try {
      const processed = await claimAndProcess();
      consecutiveErrors = 0;

      if (processed) {
        // Check for more immediately
        continue;
      }
    } catch (err) {
      consecutiveErrors++;
      console.error(
        `[ocr-worker] Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`,
        err.message,
      );

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error("[ocr-worker] Too many consecutive errors, exiting.");
        break;
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await shutdown();
}

main().catch((err) => {
  console.error("[ocr-worker] Fatal:", err);
  process.exit(1);
});
