"use strict";

const TourParticipant = require("../../../../../models/TourParticipant");
const { removeParticipantRelations } = require("./tourParticipantRemoval.service");

const VISA_STATUS_VALUES = new Set(["PENDING", "APPROVED", "DENIED", "EXPIRED", "UNKNOWN"]);
const VISA_ASSIGNABLE_STATUSES = new Set(["APPROVED"]);

function resolveVisaStatus(participant) {
  if (participant?.visaStatus && VISA_STATUS_VALUES.has(participant.visaStatus)) {
    return participant.visaStatus;
  }

  if (!participant?.hasVisa) return "PENDING";
  if (participant?.visaExpiry && new Date(participant.visaExpiry).getTime() < Date.now()) {
    return "EXPIRED";
  }
  return "APPROVED";
}

function assertParticipantVisaEligible(participant) {
  const visaStatus = resolveVisaStatus(participant);
  if (!VISA_ASSIGNABLE_STATUSES.has(visaStatus)) {
    throw new Error(
      `No se puede asignar: participante con estado de visa ${visaStatus.toLowerCase()}.`,
    );
  }
  return visaStatus;
}

async function setTourParticipantVisaStatus(participantId, input, actor) {
  if (!participantId) throw new Error("ID de participante requerido");
  if (!input?.status || !VISA_STATUS_VALUES.has(input.status)) {
    throw new Error("Estado de visa inválido");
  }

  const participant = await TourParticipant.findById(participantId);
  if (!participant) throw new Error("Participante no encontrado");
  if (participant.isRemoved) throw new Error("Participante removido de la gira");

  const currentStatus = resolveVisaStatus(participant);
  const actorId = actor?._id || actor?.id || null;
  const nextStatus = input.status;
  const changed = currentStatus !== nextStatus;

  if (!changed && input.reason === undefined && input.notes === undefined) {
    return participant;
  }

  let denialOrdinal = null;
  if (nextStatus === "DENIED" && currentStatus !== "DENIED") {
    participant.visaDeniedCount = (participant.visaDeniedCount || 0) + 1;
    participant.visaLastDeniedAt = new Date();
    participant.visaLastDeniedReason = input.reason?.trim() || null;
    participant.visaBlockedAt = new Date();
    participant.visaBlockedBy = actorId;
    denialOrdinal = participant.visaDeniedCount;
  }

  participant.visaStatus = nextStatus;
  participant.visaDecisionDate = new Date();
  participant.visaNotes = input.notes?.trim() || participant.visaNotes || null;

  if (nextStatus === "APPROVED") {
    participant.hasVisa = true;
    participant.visaBlockedAt = null;
    participant.visaBlockedBy = null;
    participant.visaLastDeniedReason =
      input.reason?.trim() || participant.visaLastDeniedReason || null;
  } else if (nextStatus === "DENIED") {
    participant.hasVisa = false;
    participant.visaExpiry = null;
  } else if (nextStatus === "PENDING" || nextStatus === "UNKNOWN") {
    participant.hasVisa = false;
    participant.visaBlockedAt = null;
    participant.visaBlockedBy = null;
  } else if (nextStatus === "EXPIRED") {
    participant.hasVisa = true;
    participant.visaBlockedAt = null;
    participant.visaBlockedBy = null;
  }

  if (changed) {
    participant.visaHistory.push({
      status: nextStatus,
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      decidedAt: new Date(),
      decidedBy: actorId,
      source: "ADMIN_MANUAL",
      denialOrdinal,
    });
  }

  participant.updatedBy = actorId || participant.updatedBy || null;
  await participant.save();

  if (nextStatus === "DENIED") {
    await removeParticipantRelations(participantId, actorId);
  }

  return TourParticipant.findById(participantId)
    .populate("linkedUser", "name firstSurName secondSurName email")
    .populate("addedBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName")
    .populate("removedBy", "name firstSurName")
    .populate("visaBlockedBy", "name firstSurName")
    .populate("visaHistory.decidedBy", "name firstSurName");
}

module.exports = {
  resolveVisaStatus,
  assertParticipantVisaEligible,
  setTourParticipantVisaStatus,
};
