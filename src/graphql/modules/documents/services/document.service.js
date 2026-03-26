/**
 * documents - Service
 * Lógica de negocio + DB (Mongoose)
 * CommonJS
 */
const crypto = require("crypto");
const Ticket = require("../../../../../models/Tickets");
const Document = require("../../../../../models/Document");
const DocumentModuleSettings = require("../../../../../models/DocumentModuleSettings");
const User = require("../../../../../models/User");
const {
  syncTourDocumentFromDocument,
} = require("../../tourDocuments/services/tourDocuments.service");

const DOCUMENT_ADMIN_ROLES = new Set(["Admin", "CEDES Financiero"]);
const SENSITIVE_DOCUMENT_TYPES = new Set([
  "PASSPORT",
  "VISA",
  "PERMISO_SALIDA",
]);
const DOCUMENT_SETTINGS_KEY = "default";

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

function getUserId(user) {
  if (!user) return null;
  return user._id || user.id || user.userId || null;
}

function requireUserId(ctx) {
  const user = requireAuth(ctx);
  const userId = getUserId(user);
  if (!userId) throw new Error("No autenticado");
  return { user, userId };
}

function isDocumentAdmin(user) {
  if (!user) return false;
  return (
    DOCUMENT_ADMIN_ROLES.has(user.role) ||
    user.roles?.some((role) => DOCUMENT_ADMIN_ROLES.has(role))
  );
}

async function getOrCreateDocumentModuleSettings() {
  const settings = await DocumentModuleSettings.findOneAndUpdate(
    { key: DOCUMENT_SETTINGS_KEY },
    { $setOnInsert: { key: DOCUMENT_SETTINGS_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return settings;
}

function mapVisibilitySettings(settings) {
  return {
    restrictSensitiveUploadsToAdmins: Boolean(
      settings?.restrictSensitiveUploadsToAdmins ?? true,
    ),
    sensitiveTypes: [...SENSITIVE_DOCUMENT_TYPES],
  };
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

function applyPagination(query, pagination) {
  const p = pagination || {};
  const limit = Math.max(1, Math.min(Number(p.limit || 20), 200));
  const page = Math.max(1, Number(p.page || 1));
  const skip = Number.isFinite(Number(p.skip))
    ? Math.max(0, Number(p.skip))
    : (page - 1) * limit;

  const sortBy = p.sortBy || "createdAt";
  const sortOrder = (p.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  return query.sort(sort).skip(skip).limit(limit);
}

async function syncTourProjectionForDocument(document, options = {}) {
  if (!document) return;
  if (!SENSITIVE_DOCUMENT_TYPES.has(document.type)) return;
  await syncTourDocumentFromDocument(document, options);
}

function sanitizeMyDocumentsFilters(filters, userId) {
  const f = filters || {};
  const mongo = { owner: userId, isDeleted: { $ne: true } };

  // mínimos “seguros”
  if (f.status) mongo.status = f.status;
  if (f.type) mongo.type = f.type;

  // expiración (si existe extracted.expirationDate)
  if (f.expirationBefore || f.expirationAfter) {
    mongo["extracted.expirationDate"] = {};
    if (f.expirationAfter)
      mongo["extracted.expirationDate"].$gte = new Date(f.expirationAfter);
    if (f.expirationBefore)
      mongo["extracted.expirationDate"].$lte = new Date(f.expirationBefore);
  }

  if (f.expiredOnly) {
    mongo["extracted.expirationDate"] = { $lt: new Date() };
  }

  return mongo;
}

function baseDocumentPopulate(q) {
  // OJO: si tu Mongoose tiene strictPopulate=true y alguno de estos paths no existe, ajustá.
  return q.populate("owner").populate("createdBy").populate("updatedBy");
}

/**
 * validateTicket
 */
async function validateTicket(qrCode, ctx) {
  // No impongo rol aquí porque tu resolver original no lo hacía.
  // Si querés, acá es donde se añade requireUserId(ctx) + requireRole(...)

  if (!qrCode) throw new Error("Código QR inválido");

  const decodedData = safeJsonParse(qrCode);
  if (!decodedData) throw new Error("Código QR inválido");

  const { ticketId } = decodedData;
  if (!ticketId) throw new Error("Código QR inválido: ticketId faltante");

  const ticket = await Ticket.findById(ticketId).populate("userId");
  if (!ticket) throw new Error("Ticket inválido");

  if (!ticket.paid) throw new Error("Ticket no pagado");

  if (ticket.scans >= ticket.ticketQuantity) {
    throw new Error("El ticket ya fue escaneado completamente");
  }

  ticket.scans += 1;
  if (ticket.scans >= ticket.ticketQuantity) {
    ticket.scanned = true;
  }

  await ticket.save();

  const userObj =
    ticket.userId && typeof ticket.userId === "object" ? ticket.userId : null;
  const fullName = userObj
    ? [userObj.name, userObj.firstSurName, userObj.secondSurName]
        .filter(Boolean)
        .join(" ")
        .trim()
    : null;

  return {
    ...ticket.toObject(),
    userName: fullName || ticket.buyerName || null,
    scanMessage: `${ticket.scans}/${ticket.ticketQuantity}`,
  };
}

/**
 * Documents CRUD
 */
async function createDocument(input, ctx) {
  const { user, userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos de documento requeridos");

  const settings = await getOrCreateDocumentModuleSettings();
  const isSensitiveType = SENSITIVE_DOCUMENT_TYPES.has(input.type);

  if (
    isSensitiveType &&
    settings.restrictSensitiveUploadsToAdmins &&
    !isDocumentAdmin(user)
  ) {
    throw new Error(
      "La subida de pasaporte, visa y permiso de salida está reservada al administrador",
    );
  }

  const created = await Document.create({
    ...input,
    owner: userId,
    createdBy: userId,
    updatedBy: userId,
  });

  await syncTourProjectionForDocument(created, { updatedBy: userId });

  const doc = await baseDocumentPopulate(Document.findById(created._id));
  return doc || created;
}

/**
 * getSignedUpload — genera firma Cloudinary para signed upload desde el browser
 */
async function getSignedUpload(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos requeridos");

  const { documentId, kind, mimeType } = input;
  if (!documentId) throw new Error("documentId requerido");
  if (!kind) throw new Error("kind requerido");

  const doc = await Document.findOne({
    _id: documentId,
    owner: userId,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new Error("Documento no existe");

  const folder = `documents/${documentId}/${kind.toLowerCase()}`;
  const timestamp = Math.round(Date.now() / 1000);
  const isPdf = mimeType === "application/pdf" || mimeType === "image/pdf";
  const resourceType = isPdf ? "raw" : "image";
  const publicId = `${folder}/${Date.now()}`;

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiSecret) throw new Error("Cloudinary no configurado");

  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  return {
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
    publicId,
    resourceType,
  };
}

async function getDocumentVisibilitySettings(ctx) {
  requireUserId(ctx);
  const settings = await getOrCreateDocumentModuleSettings();
  return mapVisibilitySettings(settings);
}

async function updateDocumentVisibilitySettings(input, ctx) {
  const { user, userId } = requireUserId(ctx);
  if (!isDocumentAdmin(user)) throw new Error("No autorizado");

  const settings = await DocumentModuleSettings.findOneAndUpdate(
    { key: DOCUMENT_SETTINGS_KEY },
    {
      $set: {
        restrictSensitiveUploadsToAdmins: Boolean(
          input?.restrictSensitiveUploadsToAdmins,
        ),
        updatedBy: userId,
      },
      $setOnInsert: { key: DOCUMENT_SETTINGS_KEY },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  return mapVisibilitySettings(settings);
}

async function addDocumentImage(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos requeridos");

  const { documentId, image, ...rest } = input;
  if (!documentId) throw new Error("documentId requerido");

  const imagePayload = image || rest;

  if (imagePayload.mimeType === "image/pdf") {
    imagePayload.mimeType = "application/pdf";
  }

  if (!imagePayload || Object.keys(imagePayload).length === 0) {
    throw new Error("Datos de imagen requeridos");
  }

  // Determinar si debemos actualizar el status a CAPTURE_ACCEPTED
  const updateOps = {
    $push: { images: imagePayload },
    $set: { updatedBy: userId },
  };

  // Si kind=RAW, marcar como CAPTURE_ACCEPTED (solo si aún está en UPLOADED)
  if (imagePayload.kind === "RAW") {
    updateOps.$set.status = "CAPTURE_ACCEPTED";
  }

  const updated = await baseDocumentPopulate(
    Document.findOneAndUpdate(
      { _id: documentId, owner: userId, isDeleted: { $ne: true } },
      updateOps,
      { new: true, runValidators: true },
    ),
  );

  if (!updated) throw new Error("Documento no existe");
  await syncTourProjectionForDocument(updated, { updatedBy: userId });
  return updated;
}

async function upsertDocumentExtractedData(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos requeridos");

  const { documentId, extracted, ...rest } = input;
  if (!documentId) throw new Error("documentId requerido");

  const extractedPayload = extracted || rest;
  const doc = await Document.findOne({ _id: documentId, owner: userId });
  if (!doc) throw new Error("Documento no existe");

  if (!extractedPayload || Object.keys(extractedPayload).length === 0) {
    const populated = await baseDocumentPopulate(Document.findById(doc._id));
    return populated || doc;
  }

  doc.extracted = { ...(doc.extracted || {}), ...extractedPayload };
  doc.updatedBy = userId;

  await doc.save();
  await syncTourProjectionForDocument(doc, { updatedBy: userId });

  const populated = await baseDocumentPopulate(Document.findById(doc._id));
  return populated || doc;
}

async function setDocumentStatus(documentId, status, ctx) {
  const { user, userId } = requireUserId(ctx);
  if (!documentId) throw new Error("documentId requerido");
  if (!status) throw new Error("status requerido");

  const isAdmin = isDocumentAdmin(user);
  const filter = isAdmin
    ? { _id: documentId, isDeleted: { $ne: true } }
    : { _id: documentId, owner: userId, isDeleted: { $ne: true } };

  const updated = await baseDocumentPopulate(
    Document.findOneAndUpdate(
      filter,
      { $set: { status, updatedBy: userId } },
      { new: true, runValidators: true },
    ),
  );

  if (!updated) throw new Error("Documento no existe");
  await syncTourProjectionForDocument(updated, { updatedBy: userId });
  return updated;
}

async function deleteDocument(documentId, ctx) {
  const { user, userId } = requireUserId(ctx);
  if (!documentId) throw new Error("documentId requerido");

  const isAdmin = isDocumentAdmin(user);

  // Admin puede eliminar cualquier documento; usuario normal solo los suyos
  const filter = isAdmin
    ? { _id: documentId, isDeleted: { $ne: true } }
    : { _id: documentId, owner: userId, isDeleted: { $ne: true } };

  const updated = await Document.findOneAndUpdate(
    filter,
    { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: userId } },
    { new: true },
  );
  if (!updated) throw new Error("Documento no existe");

  await syncTourProjectionForDocument(updated, { updatedBy: userId });
  return true;
}

/**
 * Queries
 */
async function getMyDocuments(filters, pagination, ctx) {
  const { userId } = requireUserId(ctx);

  const mongoFilter = sanitizeMyDocumentsFilters(filters, userId);

  const limit = Math.max(1, Math.min(Number(pagination?.limit ?? 20), 200));
  const skip = Math.max(0, Number(pagination?.skip ?? 0));

  const [total, docs] = await Promise.all([
    Document.countDocuments(mongoFilter),
    baseDocumentPopulate(
      Document.find(mongoFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ),
  ]);

  const safeDocs = Array.isArray(docs) ? docs : [];

  return {
    documents: safeDocs,
    pagination: {
      total,
      limit,
      skip,
      hasMore: skip + safeDocs.length < total,
    },
  };
}

/**
 * getAllDocuments — solo para admins
 * Filtra por cualquier owner, tipo, status, etc.
 */
async function getAllDocuments(filters, pagination, ctx) {
  requireUserId(ctx);

  const f = filters || {};
  const mongo = { isDeleted: { $ne: true } };

  if (f.status) mongo.status = f.status;
  if (f.type) mongo.type = f.type;
  if (f.expiredOnly) {
    mongo["extracted.expirationDate"] = { $lt: new Date() };
  }

  // Búsqueda por nombre: busca los IDs de usuarios que coincidan
  if (f.ownerName && f.ownerName.trim()) {
    const regex = new RegExp(f.ownerName.trim(), "i");
    const matchingUsers = await User.find({
      $or: [
        { name: regex },
        { firstSurName: regex },
        { secondSurName: regex },
        { email: regex },
      ],
    })
      .select("_id")
      .lean();

    const ids = matchingUsers.map((u) => u._id);
    if (ids.length === 0) {
      // No hay usuarios que coincidan → retornar vacío sin consultar documentos
      return {
        documents: [],
        pagination: { total: 0, limit: 20, skip: 0, hasMore: false },
      };
    }
    mongo.owner = { $in: ids };
  }

  if (f.expirationBefore || f.expirationAfter) {
    mongo["extracted.expirationDate"] = {};
    if (f.expirationAfter)
      mongo["extracted.expirationDate"].$gte = new Date(f.expirationAfter);
    if (f.expirationBefore)
      mongo["extracted.expirationDate"].$lte = new Date(f.expirationBefore);
  }

  const limit = Math.max(1, Math.min(Number(pagination?.limit ?? 20), 200));
  const skip = Math.max(0, Number(pagination?.skip ?? 0));

  const [total, docs] = await Promise.all([
    Document.countDocuments(mongo),
    baseDocumentPopulate(
      Document.find(mongo).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ),
  ]);

  const safeDocs = Array.isArray(docs) ? docs : [];
  return {
    documents: safeDocs,
    pagination: { total, limit, skip, hasMore: skip + safeDocs.length < total },
  };
}

async function getDocumentById(id, ctx) {
  const { user, userId } = requireUserId(ctx);
  if (!id) throw new Error("ID de documento requerido");

  const isAdmin = isDocumentAdmin(user);

  // Admin puede ver cualquier documento; usuario normal solo los suyos
  const filter = isAdmin
    ? { _id: id, isDeleted: { $ne: true } }
    : { _id: id, owner: userId, isDeleted: { $ne: true } };

  const doc = await baseDocumentPopulate(Document.findOne(filter));
  if (!doc) throw new Error("Documento no existe");
  return doc;
}
async function getDocumentsExpiringSummary(referenceDate, ctx) {
  const { userId } = requireUserId(ctx);

  const ref = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(ref.getTime())) throw new Error("referenceDate inválida");

  const in30 = new Date(ref);
  in30.setDate(in30.getDate() + 30);

  const base = {
    owner: userId,
    isDeleted: { $ne: true },
    "extracted.expirationDate": { $exists: true, $ne: null },
  };

  const in60 = new Date(ref);
  in60.setDate(in60.getDate() + 60);
  const in90 = new Date(ref);
  in90.setDate(in90.getDate() + 90);

  const totalAll = await Document.countDocuments({
    owner: userId,
    isDeleted: { $ne: true },
  });

  const [
    expired,
    expiringIn30Days,
    expiringIn60Days,
    expiringIn90Days,
    totalWithExpiration,
    noExpirationDate,
  ] = await Promise.all([
    Document.countDocuments({
      ...base,
      "extracted.expirationDate": { $lt: ref },
    }),
    Document.countDocuments({
      ...base,
      "extracted.expirationDate": { $gte: ref, $lte: in30 },
    }),
    Document.countDocuments({
      ...base,
      "extracted.expirationDate": { $gte: ref, $lte: in60 },
    }),
    Document.countDocuments({
      ...base,
      "extracted.expirationDate": { $gte: ref, $lte: in90 },
    }),
    Document.countDocuments(base),
    Document.countDocuments({
      owner: userId,
      isDeleted: { $ne: true },
      $or: [
        { "extracted.expirationDate": { $exists: false } },
        { "extracted.expirationDate": null },
      ],
    }),
  ]);

  const valid = totalWithExpiration - expired - expiringIn90Days;

  return {
    total: totalAll,
    expired,
    expiringIn30Days,
    expiringIn60Days,
    expiringIn90Days,
    valid: Math.max(0, valid),
    noExpirationDate,
  };
}

const MAX_OCR_ATTEMPTS = 5;
const OCR_COOLDOWN_MS = 30_000; // 30 seconds between enqueue attempts

/**
 * enqueueDocumentOcr — sets status to OCR_PENDING and increments attempt counter.
 * The worker picks up documents with status=OCR_PENDING.
 * Guards: max attempts, cooldown per document, ownership.
 */
async function enqueueDocumentOcr(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input?.documentId) throw new Error("documentId requerido");

  const doc = await Document.findOne({
    _id: input.documentId,
    owner: userId,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new Error("Documento no existe");

  if (!["PASSPORT", "VISA", "PERMISO_SALIDA"].includes(doc.type)) {
    throw new Error("OCR disponible solo para PASSPORT, VISA o PERMISO_SALIDA");
  }

  const hasRaw = doc.images?.some((img) => img.kind === "RAW");
  if (!hasRaw) throw new Error("El documento no tiene imagen RAW");

  // Guard: already processing
  if (doc.status === "OCR_PENDING" || doc.status === "OCR_PROCESSING") {
    return { ok: true, jobId: String(doc._id) };
  }

  // Guard: max attempts
  if ((doc.ocrAttempts || 0) >= MAX_OCR_ATTEMPTS) {
    throw new Error(`Máximo de ${MAX_OCR_ATTEMPTS} intentos OCR alcanzado`);
  }

  // Guard: cooldown
  if (doc.ocrUpdatedAt) {
    const elapsed = Date.now() - new Date(doc.ocrUpdatedAt).getTime();
    if (elapsed < OCR_COOLDOWN_MS) {
      throw new Error("Espera antes de reintentar OCR");
    }
  }

  doc.status = "OCR_PENDING";
  doc.ocrAttempts = (doc.ocrAttempts || 0) + 1;
  doc.ocrLastError = null;
  doc.ocrUpdatedAt = new Date();
  doc.updatedBy = userId;
  await doc.save();

  return { ok: true, jobId: String(doc._id) };
}

// ─── Sync OCR processing helpers ──────────────────────────────────────────────

const MRZ_RE = /^[A-Z0-9<]{30,44}$/;

function _extractMRZLines(text) {
  const candidates = text
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, ""))
    .filter((l) => MRZ_RE.test(l));

  for (let i = 0; i < candidates.length - 1; i++) {
    if (candidates[i].length === 44 && candidates[i + 1].length === 44) {
      return candidates[i] + "\n" + candidates[i + 1];
    }
  }
  for (let i = 0; i < candidates.length - 2; i++) {
    if (
      candidates[i].length === 30 &&
      candidates[i + 1].length === 30 &&
      candidates[i + 2].length === 30
    ) {
      return candidates.slice(i, i + 3).join("\n");
    }
  }
  return null;
}

function _parseEnglishDate(str) {
  const MONTHS = {
    JAN: 0,
    FEB: 1,
    MAR: 2,
    APR: 3,
    MAY: 4,
    JUN: 5,
    JUL: 6,
    AUG: 7,
    SEP: 8,
    OCT: 9,
    NOV: 10,
    DEC: 11,
  };
  const m = (str || "").toUpperCase().match(/(\d{1,2})\s*([A-Z]{3})\s*(\d{4})/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), MONTHS[m[2]], parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

// Lazy-loaded OCR dependencies — only resolved when processDocumentOcrSync runs.
// This avoids crashing the main server if @google-cloud/vision is not installed
// (the worker process loads it separately).
let _lazyDeps = null;
function _getOcrDeps() {
  if (!_lazyDeps) {
    console.log("[processDocumentOcrSync] Loading OCR dependencies...");
    const cld = require("cloudinary").v2;
    // Ensure Cloudinary is configured for sync processing
    if (!cld.config().cloud_name && process.env.CLOUDINARY_CLOUD_NAME) {
      cld.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
    _lazyDeps = {
      cloudinary: cld,
      analyzeDocument: require("../../../../../services/vision.service")
        .analyzeDocument,
      normalizeDocument: require("../../../../../services/imageNormalizer")
        .normalizeDocument,
      fetchBuffer: require("../../../../../services/imageNormalizer")
        .fetchBuffer,
      validateMRZ: require("../../../../../utils/mrz").validateMRZ,
      extractMRZData: require("../../../../../utils/mrz").extractMRZData,
    };
    console.log("[processDocumentOcrSync] OCR dependencies loaded OK");
  }
  return _lazyDeps;
}

function _processPassportText(ocrText, ocrConfidence) {
  const { validateMRZ, extractMRZData } = _getOcrDeps();
  const extracted = { ocrText, ocrConfidence };
  const reasonCodes = [];

  const mrzText = _extractMRZLines(ocrText);
  if (!mrzText) {
    reasonCodes.push("NO_MRZ_FOUND");
    return {
      extracted: { ...extracted, mrzValid: false, reasonCodes },
      status: "OCR_FAILED",
    };
  }

  const mrzResult = validateMRZ(mrzText);
  if (mrzResult.valid) {
    Object.assign(extracted, {
      fullName:
        `${mrzResult.givenNames || ""} ${mrzResult.surname || ""}`.trim(),
      givenNames: mrzResult.givenNames,
      surname: mrzResult.surname,
      passportNumber: mrzResult.passportNumber,
      nationality: mrzResult.nationality,
      issuingCountry: mrzResult.issuingCountry,
      dateOfBirth: mrzResult.dateOfBirth,
      sex: mrzResult.sex,
      expirationDate: mrzResult.expirationDate,
      mrzRaw: mrzText,
      mrzValid: true,
      mrzFormat: "TD3",
    });
    return { extracted: { ...extracted, reasonCodes }, status: "OCR_SUCCESS" };
  }

  const partial = extractMRZData(mrzText);
  if (partial) {
    Object.assign(extracted, {
      ...partial,
      fullName:
        partial.givenNames && partial.surname
          ? `${partial.givenNames} ${partial.surname}`.trim()
          : null,
      mrzRaw: mrzText,
      mrzValid: false,
    });
    reasonCodes.push("MRZ_CHECKDIGIT_FAIL");
  } else {
    reasonCodes.push("MRZ_PARSE_FAILED");
  }

  return { extracted: { ...extracted, reasonCodes }, status: "OCR_SUCCESS" };
}

function _processVisaText(ocrText, ocrConfidence) {
  const base = _processPassportText(ocrText, ocrConfidence);

  // Visa class: match "Type/Class R B1/B2" or "Visa Class: B1/B2"
  // The label is "Type/Class" or "Visa Type" or "Visa Class"
  // After the label, there may be a single-letter type (R, M) then the class (B1/B2, F1, J1, H1B)
  const visaTypeMatch = ocrText.match(
    /(?:TYPE\s*\/\s*CLASS|VISA\s*(?:TYPE|CLASS))[:\s\/]*(?:[A-Z]\s+)?([A-Z]\d[A-Z0-9\/\-]{0,6})/i,
  );
  if (visaTypeMatch) base.extracted.visaType = visaTypeMatch[1].trim();

  const issueDate = ocrText.match(
    /(?:ISSUE\s*DATE|ISSUED)[:\s]*(\d{1,2}\s*[A-Z]{3}\s*\d{4})/i,
  );
  if (issueDate) base.extracted.issueDate = _parseEnglishDate(issueDate[1]);

  // Control number: "Control Number 20231234567" or "FOLIO: ABC123"
  const controlNo = ocrText.match(/(?:CONTROL\s*(?:NO\.?|NUMBER|#)|FOLIO)[:\s#]*(\d{6,20})/i);
  if (controlNo) base.extracted.visaControlNumber = controlNo[1];

  return base;
}

function _uploadBufferToCloudinary(buffer, folder) {
  const { cloudinary } = _getOcrDeps();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: "jpg",
        access_mode: "authenticated",
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

/**
 * processDocumentOcrSync — processes OCR synchronously in a single request.
 * Normalizes image, runs Vision OCR, extracts MRZ/text, uploads normalized
 * image, saves results, and returns the fully populated Document.
 * Eliminates worker polling delay + frontend polling delay.
 */
async function processDocumentOcrSync(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input?.documentId) throw new Error("documentId requerido");

  const doc = await Document.findOne({
    _id: input.documentId,
    owner: userId,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new Error("Documento no existe");

  if (!["PASSPORT", "VISA", "PERMISO_SALIDA"].includes(doc.type)) {
    throw new Error("OCR disponible solo para PASSPORT, VISA o PERMISO_SALIDA");
  }

  const rawImage = doc.images?.find((img) => img.kind === "RAW");
  if (!rawImage) throw new Error("El documento no tiene imagen RAW");

  // Mark as processing
  doc.status = "OCR_PROCESSING";
  doc.ocrAttempts = (doc.ocrAttempts || 0) + 1;
  doc.ocrUpdatedAt = new Date();
  await doc.save();

  try {
    console.log(
      `[processDocumentOcrSync] Starting for doc=${doc._id} type=${doc.type}`,
    );
    const deps = _getOcrDeps();

    // 1. Download raw image
    if (!rawImage.url) throw new Error("La imagen RAW no tiene URL");
    console.log(
      `[processDocumentOcrSync] Downloading RAW image: ${rawImage.url.slice(0, 80)}...`,
    );
    const rawBuf = await deps.fetchBuffer(rawImage.url);
    console.log(`[processDocumentOcrSync] Downloaded ${rawBuf.length} bytes`);

    // 2. Normalize + get Vision OCR text in ONE call
    console.log("[processDocumentOcrSync] Normalizing image...");
    const normResult = await deps.normalizeDocument(rawBuf, doc.type);
    const normalizedBuf = normResult.buffer;
    console.log(
      `[processDocumentOcrSync] Normalized: ${normalizedBuf.length} bytes, visionText=${(normResult.visionText || "").length} chars`,
    );

    // 3. Try OCR text from normalization Vision call first (pre-crop image)
    let ocrText = normResult.visionText || "";
    let ocrConfidence = normResult.visionConfidence || 0;
    console.log(
      `[processDocumentOcrSync] Pre-norm OCR: ${ocrText.length} chars, confidence=${ocrConfidence.toFixed(2)}`,
    );

    // 4. Type-specific extraction — try with pre-norm text first
    let result;
    if (doc.type === "PASSPORT") {
      result = _processPassportText(ocrText, ocrConfidence);
    } else if (doc.type === "VISA") {
      result = _processVisaText(ocrText, ocrConfidence);
    } else {
      result = {
        extracted: { ocrText, ocrConfidence, mrzValid: false, reasonCodes: [] },
        status: ocrConfidence > 0.2 ? "OCR_SUCCESS" : "OCR_FAILED",
      };
    }

    // 5. If MRZ not found or extraction failed, retry OCR on the NORMALIZED image
    //    (post-crop/resize gives cleaner text for MRZ detection)
    const mrzMissing =
      !result.extracted.mrzValid &&
      (result.extracted.reasonCodes || []).some(
        (c) => c === "NO_MRZ_FOUND" || c === "MRZ_PARSE_FAILED",
      );
    if (mrzMissing && ["PASSPORT", "VISA"].includes(doc.type)) {
      console.log(
        "[processDocumentOcrSync] MRZ not found in pre-norm text, retrying on normalized image...",
      );
      const fallback = await deps.analyzeDocument(normalizedBuf);
      ocrText = fallback.text || "";
      ocrConfidence = fallback.confidence || 0;
      console.log(
        `[processDocumentOcrSync] Post-norm OCR: ${ocrText.length} chars, confidence=${ocrConfidence.toFixed(2)}`,
      );

      if (doc.type === "PASSPORT") {
        result = _processPassportText(ocrText, ocrConfidence);
      } else {
        result = _processVisaText(ocrText, ocrConfidence);
      }
    }

    // 6. Upload normalized image to Cloudinary
    console.log(
      `[processDocumentOcrSync] Extraction result: status=${result.status} mrzValid=${result.extracted.mrzValid} fields=${Object.keys(
        result.extracted,
      )
        .filter(
          (k) =>
            result.extracted[k] &&
            !["ocrText", "reasonCodes", "ocrConfidence"].includes(k),
        )
        .join(",")}`,
    );
    console.log(
      "[processDocumentOcrSync] Uploading normalized image to Cloudinary...",
    );
    const ownerId = doc.owner.toString();
    const uploadResult = await _uploadBufferToCloudinary(
      normalizedBuf,
      `documents/${ownerId}/normalized`,
    );
    console.log(
      `[processDocumentOcrSync] Uploaded: ${uploadResult.secure_url?.slice(0, 60)}...`,
    );

    // 6. Save normalized image
    await Document.findByIdAndUpdate(doc._id, {
      $push: {
        images: {
          kind: "NORMALIZED",
          url: uploadResult.secure_url,
          provider: "CLOUDINARY",
          publicId: uploadResult.public_id,
          width: uploadResult.width,
          height: uploadResult.height,
          bytes: uploadResult.bytes,
          mimeType: "image/jpeg",
          uploadedAt: new Date(),
        },
      },
    });

    // 7. Save extracted data + status
    //    Use $set with explicit field mapping to avoid Mongoose subdoc issues
    //    and filter out fields not in the extractedDataSchema.
    const ext = result.extracted || {};
    const extractedForDb = {
      fullName: ext.fullName || null,
      givenNames: ext.givenNames || null,
      surname: ext.surname || null,
      nationality: ext.nationality || null,
      issuingCountry: ext.issuingCountry || null,
      documentNumber: ext.documentNumber || null,
      passportNumber: ext.passportNumber || null,
      visaType: ext.visaType || null,
      visaControlNumber: ext.visaControlNumber || null,
      dateOfBirth: ext.dateOfBirth || null,
      sex: ext.sex || null,
      expirationDate: ext.expirationDate || null,
      issueDate: ext.issueDate || null,
      destination: ext.destination || null,
      authorizerName: ext.authorizerName || null,
      mrzRaw: ext.mrzRaw || null,
      mrzValid: ext.mrzValid ?? false,
      mrzFormat: ext.mrzFormat || null,
      reasonCodes: ext.reasonCodes || [],
      ocrText: ext.ocrText || null,
      ocrConfidence: ext.ocrConfidence || 0,
    };
    console.log(
      "[processDocumentOcrSync] Saving extracted fields:",
      Object.entries(extractedForDb)
        .filter(([k, v]) => v != null && k !== "ocrText")
        .map(
          ([k, v]) =>
            `${k}=${typeof v === "string" && v.length > 30 ? v.slice(0, 30) + "…" : v}`,
        )
        .join(", "),
    );

    const updatedDoc = await Document.findById(doc._id);
    updatedDoc.set("extracted", extractedForDb);
    updatedDoc.status = result.status;
    updatedDoc.source = "OCR";
    updatedDoc.ocrUpdatedAt = new Date();
    if (result.status === "OCR_FAILED") {
      updatedDoc.ocrLastError = (ext.reasonCodes || []).join(",");
    }
    await updatedDoc.save();
    await syncTourProjectionForDocument(updatedDoc, { updatedBy: userId });

    // 8. Return populated document
    const populated = await baseDocumentPopulate(Document.findById(doc._id));
    return populated;
  } catch (err) {
    const errMsg =
      err?.message || err?.toString?.() || String(err) || "Error desconocido";
    console.error("[processDocumentOcrSync] failed:", errMsg, err);
    // On failure, revert to OCR_PENDING so the worker can retry
    try {
      await Document.findByIdAndUpdate(doc._id, {
        $set: {
          status: "OCR_PENDING",
          ocrLastError: errMsg,
          ocrUpdatedAt: new Date(),
        },
      });
    } catch (revertErr) {
      console.error("[processDocumentOcrSync] revert failed:", revertErr);
    }
    throw new Error(`Error procesando OCR: ${errMsg}`);
  }
}

module.exports = {
  requireAuth,
  validateTicket,
  isDocumentAdmin,

  createDocument,
  getSignedUpload,
  addDocumentImage,
  upsertDocumentExtractedData,
  setDocumentStatus,
  deleteDocument,
  enqueueDocumentOcr,
  processDocumentOcrSync,
  getDocumentVisibilitySettings,
  updateDocumentVisibilitySettings,

  getMyDocuments,
  getAllDocuments,

  getDocumentById,
  getDocumentsExpiringSummary,
};
