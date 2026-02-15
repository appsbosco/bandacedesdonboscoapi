/**
 * documents - Service
 * Lógica de negocio + DB (Mongoose)
 * CommonJS
 */
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
  const mongo = { owner: userId };

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

async function addDocumentImage(input, ctx) {
  const { userId } = requireUserId(ctx);
  if (!input) throw new Error("Datos requeridos");

  const { documentId, image, ...rest } = input;
  if (!documentId) throw new Error("documentId requerido");

  const imagePayload = image || rest;
  if (!imagePayload || Object.keys(imagePayload).length === 0) {
    throw new Error("Datos de imagen requeridos");
  }

  const updated = await baseDocumentPopulate(
    Document.findOneAndUpdate(
      { _id: documentId, owner: userId },
      {
        $push: { images: imagePayload },
        $set: { updatedBy: userId },
      },
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

  const deleted = await Document.findOneAndDelete({
    _id: documentId,
    owner: userId,
  });
  if (!deleted) throw new Error("Documento no existe");

  return "Documento eliminado correctamente";
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
    Document.findOne({ _id: id, owner: userId }),
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
    "extracted.expirationDate": { $exists: true, $ne: null },
  };

  const [expiredCount, expiringIn30DaysCount, totalWithExpiration] =
    await Promise.all([
      Document.countDocuments({
        ...base,
        "extracted.expirationDate": { $lt: ref },
      }),
      Document.countDocuments({
        ...base,
        "extracted.expirationDate": { $gte: ref, $lte: in30 },
      }),
      Document.countDocuments(base),
    ]);

  const expiringSoon = await baseDocumentPopulate(
    Document.find({
      ...base,
      "extracted.expirationDate": { $gte: ref, $lte: in30 },
    })
      .sort({ "extracted.expirationDate": 1 })
      .limit(10),
  );

  return {
    referenceDate: ref.toISOString(),
    totalWithExpiration,
    expiredCount,
    expiringIn30DaysCount,
    expiringSoon,
  };
}

module.exports = {
  requireAuth,
  validateTicket,

  createDocument,
  addDocumentImage,
  upsertDocumentExtractedData,
  setDocumentStatus,
  deleteDocument,

  getMyDocuments,
  getDocumentById,
  getDocumentsExpiringSummary,
};
