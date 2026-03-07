/**
 * tourItineraries/services/tourItineraries.service.js
 *
 * Business rules:
 *   - A TourItinerary is a roundtrip package (no direction field).
 *   - Flights of any direction can be assigned to the same itinerary.
 *   - A participant can be in at most ONE itinerary per tour (exclusivity).
 *   - An itinerary has a maxPassengers hard limit enforced here.
 *   - Leaders must be participants already assigned to the itinerary.
 */

const TourItinerary = require("../../../../../models/TourItinerary");
const TourItineraryAssignment = require("../../../../../models/TourItineraryAssignment");
const TourFlight = require("../../../../../models/TourFlight");
const TourParticipant = require("../../../../../models/TourParticipant");
const Tour = require("../../../../../models/Tour");

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fullName(p) {
  return [p.firstName, p.firstSurname, p.secondSurname].filter(Boolean).join(" ");
}

function populateFlight(query) {
  return query
    .populate("passengers.participant")
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");
}

// ─── Queries ─────────────────────────────────────────────────────────────────

async function getTourItineraries(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");
  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");
  return TourItinerary.find({ tour: tourId }).sort({ name: 1 });
}

async function getTourItinerary(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de itinerario requerido");
  const it = await TourItinerary.findById(id);
  if (!it) throw new Error("Itinerario no encontrado");
  return it;
}

async function getUnassignedTourFlights(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");
  return populateFlight(
    TourFlight.find({ tour: tourId, itineraryId: null }).sort({ departureAt: 1 })
  );
}

async function getItineraryPassengers(itineraryId, ctx) {
  requireAdmin(ctx);
  if (!itineraryId) throw new Error("ID de itinerario requerido");
  const assignments = await TourItineraryAssignment.find({ itinerary: itineraryId })
    .select("participant")
    .lean();
  const ids = assignments.map((a) => a.participant);
  if (!ids.length) return [];
  return TourParticipant.find({ _id: { $in: ids } }).sort({ firstSurname: 1, firstName: 1 });
}

// ─── Mutations: CRUD ──────────────────────────────────────────────────────────

async function createTourItinerary(tourId, input, ctx) {
  const user = requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");
  if (!input?.name?.trim()) throw new Error("Nombre requerido");

  const maxPassengers = input.maxPassengers != null ? Number(input.maxPassengers) : 60;
  if (!Number.isInteger(maxPassengers) || maxPassengers < 1) {
    throw new Error("El cupo máximo debe ser un entero >= 1");
  }

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  return TourItinerary.create({
    tour: tourId,
    name: input.name.trim(),
    notes: input.notes?.trim() || undefined,
    maxPassengers,
    createdBy: user._id || user.id,
  });
}

async function updateTourItinerary(id, input, ctx) {
  const user = requireAdmin(ctx);
  if (!id) throw new Error("ID de itinerario requerido");

  const it = await TourItinerary.findById(id);
  if (!it) throw new Error("Itinerario no encontrado");

  const updates = { updatedBy: user._id || user.id };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  if (input.maxPassengers !== undefined) {
    const newMax = Number(input.maxPassengers);
    if (!Number.isInteger(newMax) || newMax < 1) {
      throw new Error("El cupo máximo debe ser un entero >= 1");
    }
    // Cannot set maxPassengers below current passenger count
    const currentCount = await TourItineraryAssignment.countDocuments({ itinerary: id });
    if (newMax < currentCount) {
      throw new Error(
        `No se puede reducir el cupo a ${newMax}: ya hay ${currentCount} pasajeros asignados`
      );
    }
    updates.maxPassengers = newMax;
  }

  const updated = await TourItinerary.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new Error("No se pudo actualizar el itinerario");
  return updated;
}

async function deleteTourItinerary(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de itinerario requerido");

  const it = await TourItinerary.findById(id);
  if (!it) throw new Error("Itinerario no encontrado");

  await TourFlight.updateMany({ itineraryId: id }, { $set: { itineraryId: null } });
  await TourItineraryAssignment.deleteMany({ itinerary: id });
  await TourItinerary.findByIdAndDelete(id);
  return true;
}

// ─── Flight assignment ────────────────────────────────────────────────────────

async function assignFlightsToItinerary(itineraryId, flightIds, ctx) {
  requireAdmin(ctx);

  const it = await TourItinerary.findById(itineraryId);
  if (!it) throw new Error("Itinerario no encontrado");

  await TourFlight.updateMany(
    { _id: { $in: flightIds }, tour: it.tour },
    { $set: { itineraryId } }
  );
  return it;
}

async function unassignFlightsFromItinerary(itineraryId, flightIds, ctx) {
  requireAdmin(ctx);

  const it = await TourItinerary.findById(itineraryId);
  if (!it) throw new Error("Itinerario no encontrado");

  await TourFlight.updateMany(
    { _id: { $in: flightIds }, itineraryId },
    { $set: { itineraryId: null } }
  );
  return it;
}

// ─── Passenger assignment (capacity-aware) ────────────────────────────────────

async function assignPassengersToItinerary(itineraryId, participantIds, ctx) {
  const admin = requireAdmin(ctx);

  if (!itineraryId) throw new Error("ID de itinerario requerido");
  if (!participantIds?.length) throw new Error("Se requiere al menos un participante");

  const it = await TourItinerary.findById(itineraryId);
  if (!it) throw new Error("Itinerario no encontrado");

  const tourId = it.tour.toString();
  const maxPassengers = it.maxPassengers;

  // Current count
  const currentCount = await TourItineraryAssignment.countDocuments({ itinerary: itineraryId });
  const seatsAvailable = maxPassengers - currentCount;

  // Validate participants belong to this tour
  const participants = await TourParticipant.find({
    _id: { $in: participantIds },
    tour: tourId,
  })
    .select("_id firstName firstSurname secondSurname")
    .lean();

  // Already in THIS itinerary → skip silently
  const existingInThis = await TourItineraryAssignment.find({ itinerary: itineraryId })
    .select("participant")
    .lean();
  const inThisSet = new Set(existingInThis.map((a) => a.participant.toString()));

  // Conflict: participant already in a DIFFERENT itinerary in this tour
  const conflicting = await TourItineraryAssignment.find({
    tour: tourId,
    participant: { $in: participants.map((p) => p._id) },
    itinerary: { $ne: itineraryId },
  })
    .select("participant itinerary")
    .populate("itinerary", "name")
    .lean();

  const conflictMap = new Map(
    conflicting.map((a) => [a.participant.toString(), a.itinerary?.name || "otro itinerario"])
  );

  const toInsert = [];
  const conflicts = [];
  let skipped = 0;

  for (const p of participants) {
    const pid = p._id.toString();

    // Already in this itinerary — silent skip
    if (inThisSet.has(pid)) { skipped++; continue; }

    // In a different itinerary — ALREADY_ASSIGNED conflict
    const conflictName = conflictMap.get(pid);
    if (conflictName) {
      conflicts.push({
        participantId: pid,
        participantName: fullName(p),
        reason: "ALREADY_ASSIGNED",
        conflictingItinerary: conflictName,
      });
      continue;
    }

    // No more seats — CAPACITY_EXCEEDED conflict
    if (toInsert.length >= seatsAvailable) {
      conflicts.push({
        participantId: pid,
        participantName: fullName(p),
        reason: "CAPACITY_EXCEEDED",
        conflictingItinerary: null,
      });
      continue;
    }

    toInsert.push({
      tour: tourId,
      itinerary: itineraryId,
      participant: pid,
      createdBy: admin._id || admin.id,
    });
  }

  if (toInsert.length > 0) {
    await TourItineraryAssignment.insertMany(toInsert, { ordered: false });
  }

  const passengerCount = await TourItineraryAssignment.countDocuments({ itinerary: itineraryId });
  const updatedIt = await TourItinerary.findById(itineraryId);

  return {
    itinerary: updatedIt,
    assigned: toInsert.length,
    removed: 0,
    skipped,
    conflicts,
    passengerCount,
    maxPassengers,
    seatsRemaining: maxPassengers - passengerCount,
  };
}

async function removePassengersFromItinerary(itineraryId, participantIds, ctx) {
  requireAdmin(ctx);

  if (!itineraryId) throw new Error("ID de itinerario requerido");
  if (!participantIds?.length) throw new Error("Se requiere al menos un participante");

  const it = await TourItinerary.findById(itineraryId);
  if (!it) throw new Error("Itinerario no encontrado");

  // Remove from leaderIds if they were leaders
  const removedLeaders = it.leaderIds
    .map((id) => id.toString())
    .filter((id) => participantIds.includes(id));

  if (removedLeaders.length > 0) {
    await TourItinerary.findByIdAndUpdate(itineraryId, {
      $pull: { leaderIds: { $in: participantIds } },
    });
  }

  const result = await TourItineraryAssignment.deleteMany({
    itinerary: itineraryId,
    participant: { $in: participantIds },
  });

  const passengerCount = await TourItineraryAssignment.countDocuments({ itinerary: itineraryId });
  const updatedIt = await TourItinerary.findById(itineraryId);

  return {
    itinerary: updatedIt,
    assigned: 0,
    removed: result.deletedCount,
    skipped: 0,
    conflicts: [],
    passengerCount,
    maxPassengers: it.maxPassengers,
    seatsRemaining: it.maxPassengers - passengerCount,
  };
}

// ─── Leader assignment ─────────────────────────────────────────────────────────

async function setItineraryLeaders(itineraryId, leaderIds, ctx) {
  requireAdmin(ctx);

  if (!itineraryId) throw new Error("ID de itinerario requerido");

  const it = await TourItinerary.findById(itineraryId);
  if (!it) throw new Error("Itinerario no encontrado");

  if (leaderIds.length > 0) {
    // All leaderIds must be assigned passengers of this itinerary
    const assignments = await TourItineraryAssignment.find({ itinerary: itineraryId })
      .select("participant")
      .lean();
    const passengerSet = new Set(assignments.map((a) => a.participant.toString()));

    const notAssigned = leaderIds.filter((id) => !passengerSet.has(id.toString()));
    if (notAssigned.length > 0) {
      throw new Error(
        `Los siguientes participantes no están asignados a este itinerario: ${notAssigned.join(", ")}`
      );
    }
  }

  return TourItinerary.findByIdAndUpdate(
    itineraryId,
    { $set: { leaderIds } },
    { new: true }
  );
}

async function addItineraryLeader(itineraryId, leaderId, ctx) {
  requireAdmin(ctx);

  const it = await TourItinerary.findById(itineraryId);
  if (!it) throw new Error("Itinerario no encontrado");

  // Must be an assigned passenger
  const assignment = await TourItineraryAssignment.findOne({
    itinerary: itineraryId,
    participant: leaderId,
  });
  if (!assignment) {
    throw new Error("El participante debe estar asignado a este itinerario para ser líder");
  }

  return TourItinerary.findByIdAndUpdate(
    itineraryId,
    { $addToSet: { leaderIds: leaderId } },
    { new: true }
  );
}

async function removeItineraryLeader(itineraryId, leaderId, ctx) {
  requireAdmin(ctx);

  const it = await TourItinerary.findById(itineraryId);
  if (!it) throw new Error("Itinerario no encontrado");

  return TourItinerary.findByIdAndUpdate(
    itineraryId,
    { $pull: { leaderIds: leaderId } },
    { new: true }
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getTourItineraries,
  getTourItinerary,
  getUnassignedTourFlights,
  getItineraryPassengers,
  createTourItinerary,
  updateTourItinerary,
  deleteTourItinerary,
  assignFlightsToItinerary,
  unassignFlightsFromItinerary,
  assignPassengersToItinerary,
  removePassengersFromItinerary,
  setItineraryLeaders,
  addItineraryLeader,
  removeItineraryLeader,
};
