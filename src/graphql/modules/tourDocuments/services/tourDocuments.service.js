/**
 * tourDocuments/services/tourDocuments.service.js
 *
 * Control documental migratorio de participantes de una gira.
 * Fuentes de datos:
 *   1. TourParticipant.passportNumber/passportExpiry/hasVisa/visaExpiry/hasExitPermit
 *      → campos propios del participante (siempre disponibles)
 *   2. Document collection (owner ref User)
 *      → solo si participant.linkedUser existe
 * Se priorizan los documentos del sistema cuando están disponibles.
 */

const TourParticipant = require("../../../../../models/TourParticipant");
const Tour = require("../../../../../models/Tour");
const Document = require("../../../../../models/Document");

// ─── Auth guards ─────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  return user;
}

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);

function requireAdmin(ctx) {
  const user = requireAuth(ctx);
  if (!ADMIN_ROLES.has(user.role)) {
    throw new Error("No autorizado: se requiere rol Admin, Director o Subdirector");
  }
  return user;
}

const REQUIRED_DOC_TYPES = ["PASSPORT", "VISA", "PERMISO_SALIDA"];

// ─── Helper: documentos del sistema por linkedUser ────────────────────────────

async function fetchDocsByLinkedUserIds(userIds) {
  if (!userIds || userIds.length === 0) return new Map();

  const docs = await Document.find({
    owner: { $in: userIds },
    isDeleted: { $ne: true },
  })
    .select("owner type status extracted.expirationDate createdAt")
    .lean();

  const byUser = new Map();
  for (const doc of docs) {
    const key = doc.owner.toString();
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(doc);
  }
  return byUser;
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

  const docsByLinkedUser = await fetchDocsByLinkedUserIds(linkedUserIds);

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
      const userDocs = docsByLinkedUser.get(userId) || [];

      const docsByType = {};
      for (const doc of userDocs) {
        const existing = docsByType[doc.type];
        if (!existing || new Date(doc.createdAt) > new Date(existing.createdAt)) {
          docsByType[doc.type] = doc;
        }
      }

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
  getTourDocumentStatus,
  getTourDocumentAlerts,
};
