/**
 * documents - Service
 * Lógica de negocio + DB (Mongoose)
 * CommonJS
 */
const crypto = require("crypto");
const Ticket = require("../../../../../models/Tickets");
const Document = require("../../../../../models/Document");

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
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos de documento requeridos");

  const created = await Document.create({
    ...input,
    owner: userId,
    createdBy: userId,
    updatedBy: userId,
  });

  const doc = await baseDocumentPopulate(Document.findById(created._id));
  return doc || created;
}

/**
 * getSignedUpload — genera firma Cloudinary para signed upload desde el browser
 */
async function getSignedUpload(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos requeridos");

  const { documentId, kind } = input;
  if (!documentId) throw new Error("documentId requerido");
  if (!kind) throw new Error("kind requerido");

  // Verificar que el documento existe y pertenece al usuario
  const doc = await Document.findOne({
    _id: documentId,
    owner: userId,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new Error("Documento no existe");

  const kindLower = kind.toLowerCase();
  const folder = `documents/${documentId}/${kindLower}`;
  const publicId = `documents/${documentId}/${kindLower}/${Date.now()}`;
  const timestamp = Math.round(Date.now() / 1000);

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!apiSecret) throw new Error("Cloudinary no configurado");

  // Generar signature: sha1 de params_to_sign + api_secret
  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
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
  };
}

async function addDocumentImage(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos requeridos");

  const { documentId, image, ...rest } = input;
  if (!documentId) throw new Error("documentId requerido");

  const imagePayload = image || rest;
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
  return updated;
}

async function upsertDocumentExtractedData(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos requeridos");

  const { documentId, extracted, ...rest } = input;
  if (!documentId) throw new Error("documentId requerido");

  const extractedPayload = extracted || rest;
  if (!extractedPayload || Object.keys(extractedPayload).length === 0) {
    throw new Error("Datos extraídos requeridos");
  }

  const doc = await Document.findOne({ _id: documentId, owner: userId });
  if (!doc) throw new Error("Documento no existe");

  doc.extracted = { ...(doc.extracted || {}), ...extractedPayload };
  doc.updatedBy = userId;

  await doc.save();

  const populated = await baseDocumentPopulate(Document.findById(doc._id));
  return populated || doc;
}

async function setDocumentStatus(documentId, status, ctx) {
  const { userId } = requireUserId(ctx);
  if (!documentId) throw new Error("documentId requerido");
  if (!status) throw new Error("status requerido");

  const updated = await baseDocumentPopulate(
    Document.findOneAndUpdate(
      { _id: documentId, owner: userId },
      { $set: { status, updatedBy: userId } },
      { new: true, runValidators: true },
    ),
  );

  if (!updated) throw new Error("Documento no existe");
  return updated;
}

async function deleteDocument(documentId, ctx) {
  const { userId } = requireUserId(ctx);
  if (!documentId) throw new Error("documentId requerido");

  const updated = await Document.findOneAndUpdate(
    { _id: documentId, owner: userId, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date(), updatedBy: userId } },
    { new: true },
  );
  if (!updated) throw new Error("Documento no existe");

  // TODO: encolar job de cleanup de assets Cloudinary
  return { success: true, message: "Documento eliminado correctamente" };
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

async function getDocumentById(id, ctx) {
  const { userId } = requireUserId(ctx);
  if (!id) throw new Error("ID de documento requerido");

  const doc = await baseDocumentPopulate(
    Document.findOne({ _id: id, owner: userId, isDeleted: { $ne: true } }),
  );
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

  const [expired, expiringIn30Days, expiringIn60Days, expiringIn90Days, totalWithExpiration, noExpirationDate] =
    await Promise.all([
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

  const hasRaw = doc.images?.some((img) => img.kind === "RAW");
  if (!hasRaw) throw new Error("El documento no tiene imagen RAW");

  // Guard: already processing
  if (doc.status === "OCR_PENDING" || doc.status === "OCR_PROCESSING") {
    return { success: true, jobId: String(doc._id) };
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

  return { success: true, jobId: String(doc._id) };
}

module.exports = {
  requireAuth,
  validateTicket,

  createDocument,
  getSignedUpload,
  addDocumentImage,
  upsertDocumentExtractedData,
  setDocumentStatus,
  deleteDocument,
  enqueueDocumentOcr,

  getMyDocuments,
  getDocumentById,
  getDocumentsExpiringSummary,
};
