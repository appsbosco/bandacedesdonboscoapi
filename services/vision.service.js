'use strict';
const { ImageAnnotatorClient } = require('@google-cloud/vision');

let _client = null;

function getClient() {
  if (!_client) {
    const opts = {};
    if (process.env.GOOGLE_VISION_CREDENTIALS) {
      opts.keyFilename = process.env.GOOGLE_VISION_CREDENTIALS;
    } else if (process.env.GOOGLE_VISION_JSON) {
      opts.credentials = JSON.parse(process.env.GOOGLE_VISION_JSON);
    }
    _client = new ImageAnnotatorClient(opts);
  }
  return _client;
}

/**
 * Run DOCUMENT_TEXT_DETECTION + CROP_HINTS on an image buffer.
 * Returns { text, confidence, cropBounds, rotationAngle }
 */
async function analyzeDocument(imageBuffer) {
  const client = getClient();

  const [result] = await client.annotateImage({
    image: { content: imageBuffer.toString('base64') },
    features: [
      { type: 'DOCUMENT_TEXT_DETECTION' },
      { type: 'CROP_HINTS' },
    ],
    imageContext: {
      languageHints: ['en', 'es'],
      cropHintsParams: { aspectRatios: [1.42, 1.58, 0.77] },
    },
  });

  const text = result.fullTextAnnotation?.text || '';

  // Confidence: average symbol confidence
  let confidence = 0;
  let symbolCount = 0;
  for (const page of (result.fullTextAnnotation?.pages || [])) {
    for (const block of page.blocks) {
      for (const para of block.paragraphs) {
        for (const word of para.words) {
          for (const sym of word.symbols) {
            confidence += sym.confidence || 0;
            symbolCount++;
          }
        }
      }
    }
  }
  if (symbolCount > 0) confidence /= symbolCount;

  // Crop bounds from Vision
  const cropHint = result.cropHintsAnnotation?.cropHints?.[0];
  const cropBounds = cropHint ? cropHint.boundingPoly.vertices : null;

  // Compute rotation from first text block baseline
  let rotationAngle = 0;
  const firstBlock = result.fullTextAnnotation?.pages?.[0]?.blocks?.[0];
  if (firstBlock?.boundingBox?.vertices?.length >= 2) {
    const verts = firstBlock.boundingBox.vertices;
    const dx = (verts[1].x || 0) - (verts[0].x || 0);
    const dy = (verts[1].y || 0) - (verts[0].y || 0);
    rotationAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (rotationAngle > 45) rotationAngle -= 90;
    if (rotationAngle < -45) rotationAngle += 90;
  }

  return { text, confidence, cropBounds, rotationAngle };
}

module.exports = { analyzeDocument };
