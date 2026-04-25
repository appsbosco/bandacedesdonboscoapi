/**
 * tourRoutes/services/tourRoutes.service.js
 *
 * Routes are the primary entity for passenger assignment.
 * Flights are assigned to routes. Passengers are assigned to routes.
 * Conflict rule: a participant can be in at most ONE OUTBOUND and ONE INBOUND route per tour.
 */

const TourRoute = require("../../../../../models/TourRoute");
const TourRouteAssignment = require("../../../../../models/TourRouteAssignment");
const TourFlight = require("../../../../../models/TourFlight");
const TourParticipant = require("../../../../../models/TourParticipant");
const Tour = require("../../../../../models/Tour");
const {
  assertParticipantVisaEligible,
} = require("../../tours/services/tourVisaStatus.service");

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

function participantFullName(p) {
  return [p.firstName, p.firstSurname, p.secondSurname].filter(Boolean).join(" ");
}

// ─── Queries ─────────────────────────────────────────────────────────────────

async function getTourRoutes(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  return TourRoute.find({ tour: tourId }).sort({ direction: 1, name: 1 });
}

async function getTourRoute(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de ruta requerido");

  const route = await TourRoute.findById(id);
  if (!route) throw new Error("Ruta no encontrada");
  return route;
}

async function getUnassignedTourFlights(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  return TourFlight.find({ tour: tourId, routeId: null })
    .populate("passengers.participant")
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName")
    .sort({ departureAt: 1 });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function createTourRoute(tourId, input, ctx) {
  const user = requireAdmin(ctx);

  if (!tourId) throw new Error("ID de gira requerido");
  if (!input?.name?.trim()) throw new Error("Nombre de ruta requerido");
  if (!input?.direction) throw new Error("Dirección requerida");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  return TourRoute.create({
    tour: tourId,
    name: input.name.trim(),
    direction: input.direction,
    origin: input.origin?.trim() || undefined,
    destination: input.destination?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdBy: user._id || user.id,
  });
}

async function updateTourRoute(id, input, ctx) {
  const user = requireAdmin(ctx);

  if (!id) throw new Error("ID de ruta requerido");
  const route = await TourRoute.findById(id);
  if (!route) throw new Error("Ruta no encontrada");

  const allowed = {};
  if (input.name !== undefined) allowed.name = input.name.trim();
  if (input.direction !== undefined) allowed.direction = input.direction;
  if (input.origin !== undefined) allowed.origin = input.origin?.trim() || null;
  if (input.destination !== undefined) allowed.destination = input.destination?.trim() || null;
  if (input.notes !== undefined) allowed.notes = input.notes?.trim() || null;
  allowed.updatedBy = user._id || user.id;

  const updated = await TourRoute.findByIdAndUpdate(id, allowed, { new: true, runValidators: true });
  if (!updated) throw new Error("No se pudo actualizar la ruta");
  return updated;
}

async function deleteTourRoute(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de ruta requerido");

  const route = await TourRoute.findById(id);
  if (!route) throw new Error("Ruta no encontrada");

  // Unassign all flights from this route
  await TourFlight.updateMany({ routeId: id }, { $set: { routeId: null } });

  // Remove all passenger assignments for this route
  await TourRouteAssignment.deleteMany({ route: id });

  await TourRoute.findByIdAndDelete(id);
  return true;
}

// ─── assignFlightsToRoute ─────────────────────────────────────────────────────

async function assignFlightsToRoute(routeId, flightIds, ctx) {
  requireAdmin(ctx);

  const route = await TourRoute.findById(routeId);
  if (!route) throw new Error("Ruta no encontrada");

  const tourId = route.tour.toString();

  // Only allow flights from the same tour
  await TourFlight.updateMany(
    { _id: { $in: flightIds }, tour: tourId },
    { $set: { routeId } }
  );

  return route;
}

// ─── unassignFlightsFromRoute ─────────────────────────────────────────────────

async function unassignFlightsFromRoute(routeId, flightIds, ctx) {
  requireAdmin(ctx);

  const route = await TourRoute.findById(routeId);
  if (!route) throw new Error("Ruta no encontrada");

  await TourFlight.updateMany(
    { _id: { $in: flightIds }, routeId },
    { $set: { routeId: null } }
  );

  return route;
}

// ─── assignPassengersToRoute ──────────────────────────────────────────────────

async function assignPassengersToRoute(routeId, participantIds, ctx) {
  const admin = requireAdmin(ctx);

  if (!routeId) throw new Error("ID de ruta requerido");
  if (!participantIds || participantIds.length === 0) {
    throw new Error("Se requiere al menos un participante");
  }

  const route = await TourRoute.findById(routeId);
  if (!route) throw new Error("Ruta no encontrada");

  const tourId = route.tour.toString();

  // Validate participants belong to this tour
  const participants = await TourParticipant.find({
    _id: { $in: participantIds },
    tour: tourId,
    isRemoved: { $ne: true },
  })
    .select("_id firstName firstSurname secondSurname visaStatus hasVisa visaExpiry")
    .lean();

  // Participants already in THIS route → skip silently
  const existingInRoute = await TourRouteAssignment.find({ route: routeId })
    .select("participant")
    .lean();
  const inRouteSet = new Set(existingInRoute.map((a) => a.participant.toString()));

  // Conflict: participant already in a DIFFERENT route of the same direction in this tour
  const conflictingAssignments = await TourRouteAssignment.find({
    tour: tourId,
    direction: route.direction,
    participant: { $in: participants.map((p) => p._id) },
    route: { $ne: routeId },
  })
    .select("participant route")
    .populate("route", "name")
    .lean();

  const conflictMap = new Map(
    conflictingAssignments.map((a) => [a.participant.toString(), a])
  );

  const toInsert = [];
  const conflicts = [];
  let skipped = 0;

  for (const p of participants) {
    const pid = p._id.toString();

    if (inRouteSet.has(pid)) {
      skipped++;
      continue;
    }

    try {
      assertParticipantVisaEligible(p);
    } catch (error) {
      conflicts.push({
        participantId: pid,
        participantName: participantFullName(p),
        conflictingRoute: "visa bloqueada",
        reason: error.message,
      });
      continue;
    }

    const conflict = conflictMap.get(pid);
    if (conflict) {
      conflicts.push({
        participantId: pid,
        participantName: participantFullName(p),
        conflictingRoute: conflict.route?.name || "otra ruta",
      });
      continue;
    }

    toInsert.push({
      tour: tourId,
      route: routeId,
      direction: route.direction,
      participant: pid,
      createdBy: admin._id || admin.id,
    });
  }

  if (toInsert.length > 0) {
    await TourRouteAssignment.insertMany(toInsert, { ordered: false });
  }

  const passengerCount = await TourRouteAssignment.countDocuments({ route: routeId });

  return {
    route: await TourRoute.findById(routeId),
    assigned: toInsert.length,
    removed: 0,
    skipped,
    conflicts,
    passengerCount,
  };
}

// ─── removePassengersFromRoute ────────────────────────────────────────────────

async function removePassengersFromRoute(routeId, participantIds, ctx) {
  requireAdmin(ctx);

  if (!routeId) throw new Error("ID de ruta requerido");
  if (!participantIds || participantIds.length === 0) {
    throw new Error("Se requiere al menos un participante");
  }

  const route = await TourRoute.findById(routeId);
  if (!route) throw new Error("Ruta no encontrada");

  const result = await TourRouteAssignment.deleteMany({
    route: routeId,
    participant: { $in: participantIds },
  });

  const passengerCount = await TourRouteAssignment.countDocuments({ route: routeId });

  return {
    route: await TourRoute.findById(routeId),
    assigned: 0,
    removed: result.deletedCount,
    skipped: 0,
    conflicts: [],
    passengerCount,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getTourRoutes,
  getTourRoute,
  getUnassignedTourFlights,
  createTourRoute,
  updateTourRoute,
  deleteTourRoute,
  assignFlightsToRoute,
  unassignFlightsFromRoute,
  assignPassengersToRoute,
  removePassengersFromRoute,
};
