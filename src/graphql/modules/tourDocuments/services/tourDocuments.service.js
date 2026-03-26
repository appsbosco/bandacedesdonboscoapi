/**
 * tourDocuments/services/tourDocuments.service.js
 *
 * Control documental migratorio de participantes de una gira.
 *
 * Arquitectura actual:
 * - Document es la fuente canónica para PASSPORT, VISA y PERMISO_SALIDA.
 * - TourParticipant conserva una proyección sincronizada para que tourDocuments,
 *   self-service y otras pantallas existentes sigan funcionando sin duplicar
 *   lógica de lectura.
 * - La sincronización se hace en backend y es idempotente.
 */

const TourParticipant = require("../../../../../models/TourParticipant");
const Tour = require("../../../../../models/Tour");
const Document = require("../../../../../models/Document");
const { canManageTourFinance } = require("../../../shared/tourAuth");

// ─── Auth guards ─────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  return user;
}

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (!canManageTourFinance(user)) {
    throw new Error(
      "No autorizado: se requiere rol Admin, Director, Subdirector o CEDES Financiero"
    );
  }
  return user;
}

const REQUIRED_DOC_TYPES = ["PASSPORT", "VISA", "PERMISO_SALIDA"];
const CANONICAL_DOC_TYPES = new Set(REQUIRED_DOC_TYPES);
const INACTIVE_DOCUMENT_STATUSES = new Set(["REJECTED", "OCR_FAILED"]);
const DOCUMENT_STATUS_PRIORITY = {
  VERIFIED: 800,
  OCR_SUCCESS: 700,
  DATA_CAPTURED: 600,
  CAPTURE_ACCEPTED: 500,
  OCR_PROCESSING: 400,
  OCR_PENDING: 350,
  UPLOADED: 300,
  OCR_FAILED: 100,
  REJECTED: 0,
};

function normalizeId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return value._id.toString();
    if (value.id) return value.id.toString();
  }
  return value.toString();
}

function getDocumentPriority(doc) {
  return DOCUMENT_STATUS_PRIORITY[doc?.status] ?? 200;
}

function countUsefulExtractedFields(doc) {
  const extracted = doc?.extracted || {};
  const usefulFields = [
    "fullName",
    "givenNames",
    "surname",
    "nationality",
    "issuingCountry",
    "documentNumber",
    "passportNumber",
    "visaType",
    "visaControlNumber",
    "dateOfBirth",
    "sex",
    "expirationDate",
    "issueDate",
    "destination",
    "authorizerName",
    "mrzRaw",
  ];

  return usefulFields.reduce((count, key) => {
    const value = extracted[key];
    if (Array.isArray(value)) return count + (value.length > 0 ? 1 : 0);
    return count + (value !== null && value !== undefined && value !== "" ? 1 : 0);
  }, 0);
}

function compareDocuments(a, b) {
  const priorityDiff = getDocumentPriority(b) - getDocumentPriority(a);
  if (priorityDiff !== 0) return priorityDiff;

  const completenessDiff = countUsefulExtractedFields(b) - countUsefulExtractedFields(a);
  if (completenessDiff !== 0) return completenessDiff;

  const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
  const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
  return bUpdated - aUpdated;
}

function selectCanonicalDocument(documents = []) {
  const eligible = documents.filter(
    (doc) => doc && !doc.isDeleted && !INACTIVE_DOCUMENT_STATUSES.has(doc.status),
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort(compareDocuments)[0] || null;
}

function groupPreferredDocumentsByOwner(documents = []) {
  const bucket = new Map();

  for (const doc of documents) {
    if (!CANONICAL_DOC_TYPES.has(doc.type)) continue;
    const ownerId = normalizeId(doc.owner);
    if (!ownerId) continue;

    if (!bucket.has(ownerId)) {
      bucket.set(ownerId, { PASSPORT: [], VISA: [], PERMISO_SALIDA: [] });
    }
    bucket.get(ownerId)[doc.type].push(doc);
  }

  const preferredByOwner = new Map();
  for (const [ownerId, docsByType] of bucket.entries()) {
    preferredByOwner.set(ownerId, {
      PASSPORT: selectCanonicalDocument(docsByType.PASSPORT),
      VISA: selectCanonicalDocument(docsByType.VISA),
      PERMISO_SALIDA: selectCanonicalDocument(docsByType.PERMISO_SALIDA),
    });
  }

  return preferredByOwner;
}

async function fetchPreferredDocumentsByOwnerIds(ownerIds) {
  if (!ownerIds || ownerIds.length === 0) return new Map();

  const docs = await Document.find({
    owner: { $in: ownerIds },
    type: { $in: REQUIRED_DOC_TYPES },
    isDeleted: { $ne: true },
  }).select(
    "owner type status extracted.passportNumber extracted.documentNumber extracted.expirationDate createdAt updatedAt isDeleted",
  );

  return groupPreferredDocumentsByOwner(docs);
}

function mapDocumentToTourDocumentPayload(preferredDocs = {}) {
  const passportDoc = preferredDocs.PASSPORT || null;
  const visaDoc = preferredDocs.VISA || null;
  const exitPermitDoc = preferredDocs.PERMISO_SALIDA || null;

  const passportNumber =
    passportDoc?.extracted?.passportNumber ||
    passportDoc?.extracted?.documentNumber ||
    null;

  return {
    passportNumber,
    passportExpiry: passportDoc?.extracted?.expirationDate || null,
    hasVisa: Boolean(visaDoc),
    visaExpiry: visaDoc?.extracted?.expirationDate || null,
    hasExitPermit: Boolean(exitPermitDoc),
  };
}

async function syncTourDocumentsForOwner(ownerId, options = {}) {
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedOwnerId) return { matchedParticipants: 0, modifiedParticipants: 0 };

  const participants = await TourParticipant.find({ linkedUser: normalizedOwnerId }).select("_id");
  if (participants.length === 0) return { matchedParticipants: 0, modifiedParticipants: 0 };

  const preferredByOwner = await fetchPreferredDocumentsByOwnerIds([normalizedOwnerId]);
  const payload = mapDocumentToTourDocumentPayload(preferredByOwner.get(normalizedOwnerId));

  const update = { ...payload };
  const updatedBy = options.updatedBy ?? null;
  if (updatedBy) update.updatedBy = updatedBy;

  const result = await TourParticipant.updateMany(
    { linkedUser: normalizedOwnerId },
    { $set: update },
  );

  return {
    matchedParticipants: result.matchedCount ?? result.n ?? participants.length,
    modifiedParticipants: result.modifiedCount ?? result.nModified ?? 0,
    payload,
  };
}

async function syncTourDocumentFromDocument(documentOrId, options = {}) {
  let document = documentOrId;

  if (!documentOrId) {
    return { matchedParticipants: 0, modifiedParticipants: 0 };
  }

  if (typeof documentOrId === "string") {
    document = await Document.findById(documentOrId).select("owner type updatedBy createdBy");
  }

  if (!document || !CANONICAL_DOC_TYPES.has(document.type)) {
    return { matchedParticipants: 0, modifiedParticipants: 0 };
  }

  return syncTourDocumentsForOwner(document.owner, {
    ...options,
    updatedBy:
      options.updatedBy ??
      normalizeId(document.updatedBy) ??
      normalizeId(document.createdBy) ??
      null,
  });
}

async function backfillTourDocumentSync(options = {}) {
  const filter = {};

  if (options.ownerIds?.length) {
    filter.linkedUser = { $in: options.ownerIds };
  }

  if (options.participantIds?.length) {
    filter._id = { $in: options.participantIds };
  }

  const participants = await TourParticipant.find(filter).select("linkedUser");
  const ownerIds = [
    ...new Set(participants.map((participant) => normalizeId(participant.linkedUser)).filter(Boolean)),
  ];

  let syncedOwners = 0;
  let modifiedParticipants = 0;

  for (const ownerId of ownerIds) {
    const result = await syncTourDocumentsForOwner(ownerId, {
      updatedBy: options.updatedBy ?? null,
    });
    syncedOwners += 1;
    modifiedParticipants += result.modifiedParticipants || 0;
  }

  return {
    syncedOwners,
    modifiedParticipants,
    ownerIds,
  };
}

// ─── Helper: estado global ────────────────────────────────────────────────────

function computeOverallStatus(hasPassport, hasVisa, hasExitPermit, passportExpiry, visaExpiry, daysAhead = 30) {
  if (!hasPassport || !hasVisa || !hasExitPermit) return "INCOMPLETE";

  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  let hasExpired = false;
  let hasExpiring = false;

  const expiryDates = [passportExpiry, visaExpiry].filter(Boolean).map((d) => new Date(d));
  for (const exp of expiryDates) {
    if (exp < now) hasExpired = true;
    else if (exp <= horizon) hasExpiring = true;
  }

  if (hasExpired) return "EXPIRED";
  if (hasExpiring) return "EXPIRING";
  return "COMPLETE";
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function getTourDocumentStatus(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const participants = await TourParticipant.find({ tour: tourId }).lean();
  if (participants.length === 0) return [];

  // Obtener linkedUser IDs para buscar en Document collection
  const linkedUserIds = participants
    .filter((p) => p.linkedUser)
    .map((p) => p.linkedUser);

  const docsByLinkedUser = await fetchPreferredDocumentsByOwnerIds(linkedUserIds);

  return participants.map((participant) => {
    const participantBase = { ...participant, id: participant._id.toString() };

    // Por defecto, usar campos propios del participante
    let hasPassport = !!participant.passportNumber;
    let hasVisa = participant.hasVisa || false;
    let hasExitPermit = participant.hasExitPermit || false;
    let passportExpiresAt = participant.passportExpiry
      ? new Date(participant.passportExpiry).toISOString()
      : null;
    let visaExpiresAt = participant.visaExpiry
      ? new Date(participant.visaExpiry).toISOString()
      : null;
    let passportStatus = null;
    let visaStatus = null;

    // Si tiene linkedUser, enriquecer con Document del sistema
    if (participant.linkedUser) {
      const userId = participant.linkedUser.toString();
      const docsByType = docsByLinkedUser.get(userId) || {};

      if (docsByType["PASSPORT"]) {
        hasPassport = true;
        passportStatus = docsByType["PASSPORT"].status || null;
        if (docsByType["PASSPORT"].extracted?.expirationDate) {
          passportExpiresAt = new Date(docsByType["PASSPORT"].extracted.expirationDate).toISOString();
        }
      }
      if (docsByType["VISA"]) {
        hasVisa = true;
        visaStatus = docsByType["VISA"].status || null;
        if (docsByType["VISA"].extracted?.expirationDate) {
          visaExpiresAt = new Date(docsByType["VISA"].extracted.expirationDate).toISOString();
        }
      }
      if (docsByType["PERMISO_SALIDA"]) {
        hasExitPermit = true;
      }
    }

    return {
      id: participant._id.toString(),
      participant: participantBase,
      hasPassport,
      hasVisa,
      hasPermisoSalida: hasExitPermit,
      passportStatus,
      visaStatus,
      passportExpiresAt,
      visaExpiresAt,
      overallStatus: computeOverallStatus(
        hasPassport,
        hasVisa,
        hasExitPermit,
        passportExpiresAt,
        visaExpiresAt
      ),
    };
  });
}

async function getTourDocumentAlerts(tourId, daysAhead = 30, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const statuses = await getTourDocumentStatus(tourId, ctx);

  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const alerts = [];

  for (const s of statuses) {
    const participantBase = s.participant;

    if (!s.hasPassport) {
      alerts.push({
        id: `${participantBase.id}-MISSING_PASSPORT`,
        participant: participantBase,
        alertType: "MISSING_PASSPORT",
        documentType: "PASSPORT",
        daysUntilExpiration: null,
      });
    } else if (s.passportExpiresAt) {
      const exp = new Date(s.passportExpiresAt);
      const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      if (exp < now) {
        alerts.push({
          id: `${participantBase.id}-EXPIRED-PASSPORT`,
          participant: participantBase,
          alertType: "EXPIRED",
          documentType: "PASSPORT",
          daysUntilExpiration: days,
        });
      } else if (exp <= horizon) {
        alerts.push({
          id: `${participantBase.id}-EXPIRING-PASSPORT`,
          participant: participantBase,
          alertType: "EXPIRING",
          documentType: "PASSPORT",
          daysUntilExpiration: days,
        });
      }
    }

    if (!s.hasVisa) {
      alerts.push({
        id: `${participantBase.id}-MISSING_VISA`,
        participant: participantBase,
        alertType: "MISSING_VISA",
        documentType: "VISA",
        daysUntilExpiration: null,
      });
    } else if (s.visaExpiresAt) {
      const exp = new Date(s.visaExpiresAt);
      const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      if (exp < now) {
        alerts.push({
          id: `${participantBase.id}-EXPIRED-VISA`,
          participant: participantBase,
          alertType: "EXPIRED",
          documentType: "VISA",
          daysUntilExpiration: days,
        });
      } else if (exp <= horizon) {
        alerts.push({
          id: `${participantBase.id}-EXPIRING-VISA`,
          participant: participantBase,
          alertType: "EXPIRING",
          documentType: "VISA",
          daysUntilExpiration: days,
        });
      }
    }

    if (!s.hasPermisoSalida) {
      alerts.push({
        id: `${participantBase.id}-MISSING_PERMISO`,
        participant: participantBase,
        alertType: "MISSING_PERMISO_SALIDA",
        documentType: "PERMISO_SALIDA",
        daysUntilExpiration: null,
      });
    }
  }

  return alerts;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  requireAuth,
  requireAdmin,
  mapDocumentToTourDocumentPayload,
  syncTourDocumentsForOwner,
  syncTourDocumentFromDocument,
  backfillTourDocumentSync,
  getTourDocumentStatus,
  getTourDocumentAlerts,
};
