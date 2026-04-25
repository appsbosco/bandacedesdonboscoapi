"use strict";

const TourFlight = require("../../../../../models/TourFlight");
const TourRoom = require("../../../../../models/TourRoom");
const TourItinerary = require("../../../../../models/TourItinerary");
const TourItineraryAssignment = require("../../../../../models/TourItineraryAssignment");
const TourRouteAssignment = require("../../../../../models/TourRouteAssignment");
const TourParticipant = require("../../../../../models/TourParticipant");
const TourPayment = require("../../../../../models/TourPayment");
const ParticipantFinancialAccount = require("../../../../../models/ParticipantFinancialAccount");
const ParticipantInstallment = require("../../../../../models/ParticipantInstallment");
const TourParticipantRemovalLog = require("../../../../../models/TourParticipantRemovalLog");

function participantFullName(participant) {
  return [
    participant?.firstName,
    participant?.firstSurname,
    participant?.secondSurname,
  ]
    .filter(Boolean)
    .join(" ");
}

async function removeParticipantRelations(participantId, actorUserId = null) {
  const updateMeta = actorUserId ? { updatedBy: actorUserId } : {};

  const [
    itineraryAssignmentsRes,
    routeAssignmentsRes,
    flightsRes,
    roomOccupantsRes,
    roomResponsibleRes,
    itinerariesRes,
  ] = await Promise.all([
    TourItineraryAssignment.deleteMany({ participant: participantId }),
    TourRouteAssignment.deleteMany({ participant: participantId }),
    TourFlight.updateMany(
      { "passengers.participant": participantId },
      {
        $pull: { passengers: { participant: participantId } },
        ...(actorUserId ? { $set: updateMeta } : {}),
      },
    ),
    TourRoom.updateMany(
      { "occupants.participant": participantId },
      {
        $pull: { occupants: { participant: participantId } },
        ...(actorUserId ? { $set: updateMeta } : {}),
      },
    ),
    TourRoom.updateMany(
      { responsible: participantId },
      {
        $set: {
          responsible: null,
          ...(actorUserId ? updateMeta : {}),
        },
      },
    ),
    TourItinerary.updateMany(
      { leaderIds: participantId },
      {
        $pull: { leaderIds: participantId },
        ...(actorUserId ? { $set: updateMeta } : {}),
      },
    ),
  ]);

  return {
    itineraryAssignments: itineraryAssignmentsRes.deletedCount || 0,
    routeAssignments: routeAssignmentsRes.deletedCount || 0,
    flightsModified: flightsRes.modifiedCount || 0,
    roomOccupantsModified: roomOccupantsRes.modifiedCount || 0,
    roomResponsiblesCleared: roomResponsibleRes.modifiedCount || 0,
    itinerariesModified: itinerariesRes.modifiedCount || 0,
  };
}

async function removeTourParticipantSafely({
  participantId,
  actor = null,
  removalSource = "ADMIN",
  removalReason = "",
}) {
  if (!participantId) throw new Error("ID de participante requerido");

  const participant = await TourParticipant.findById(participantId).populate(
    "linkedUser",
    "name firstSurName secondSurName email",
  );
  if (!participant) throw new Error("Participante no encontrado");

  const actorUserId = actor?._id || actor?.id || null;

  const [payments, installments, financialAccounts] = await Promise.all([
    TourPayment.countDocuments({ participant: participantId }),
    ParticipantInstallment.countDocuments({ participant: participantId }),
    ParticipantFinancialAccount.countDocuments({ participant: participantId }),
  ]);

  const linkedUser = participant.linkedUser;
  const linkedUserName = linkedUser
    ? [linkedUser.name, linkedUser.firstSurName, linkedUser.secondSurName]
        .filter(Boolean)
        .join(" ")
    : participant.linkedUserSnapshotName || null;

  const relationResults = await removeParticipantRelations(participantId, actorUserId);

  let deletionMode = "HARD";

  if (payments > 0) {
    deletionMode = "SOFT";

    participant.isRemoved = true;
    participant.status = "CANCELLED";
    participant.removedAt = new Date();
    participant.removedBy = actorUserId || null;
    participant.removalReason = removalReason || participant.removalReason || "";
    participant.removalSource = removalSource;
    participant.removalHadPayments = true;
    participant.linkedUserSnapshotId = linkedUser?._id || participant.linkedUserSnapshotId || null;
    participant.linkedUserSnapshotName = linkedUserName;
    participant.linkedUserSnapshotEmail =
      linkedUser?.email || participant.linkedUserSnapshotEmail || null;
    participant.linkedUser = null;
    participant.updatedBy = actorUserId || participant.updatedBy || null;
    await participant.save();
  } else {
    await Promise.all([
      ParticipantInstallment.deleteMany({ participant: participantId }),
      ParticipantFinancialAccount.deleteMany({ participant: participantId }),
      TourPayment.deleteMany({ participant: participantId }),
    ]);
    await TourParticipant.findByIdAndDelete(participantId);
  }

  const cascadeResults = {
    ...relationResults,
    payments,
    installments,
    financialAccounts,
  };

  await TourParticipantRemovalLog.create({
    tour: participant.tour,
    participant: deletionMode === "SOFT" ? participant._id : null,
    deletionMode,
    removalSource,
    removalReason: removalReason || null,
    removedAt: new Date(),
    removedBy: actorUserId || null,
    hadPayments: payments > 0,
    participantSnapshot: {
      participantId: participant._id.toString(),
      fullName: participantFullName(participant),
      identification: participant.identification || null,
      instrument: participant.instrument || null,
      linkedUserId: linkedUser?._id?.toString?.() || null,
      linkedUserName: linkedUserName || null,
      linkedUserEmail: linkedUser?.email || null,
    },
    cascadeResults,
  });

  return {
    success: true,
    deletedId: participant._id.toString(),
    deletionMode,
    participantStillExists: deletionMode === "SOFT",
    cascadeResults,
  };
}

module.exports = {
  participantFullName,
  removeParticipantRelations,
  removeTourParticipantSafely,
};
