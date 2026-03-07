/**
 * tourFlights/services/tourFlights.service.js
 *
 * Cambios respecto a la versión anterior:
 *   - routeGroup: campo libre para agrupar vuelos en una ruta completa
 *   - assignPassenger: bloquea si el participante ya está en CUALQUIER vuelo
 *     de la gira que tenga un routeGroup distinto (o el mismo vuelo)
 *   - assignPassengers: asignación masiva con reporte de conflictos
 */

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
    throw new Error(
      "No autorizado: se requiere rol Admin, Director o Subdirector",
    );
  }
  return user;
}

// ─── Helper: poblar vuelo ─────────────────────────────────────────────────────

function populateFlight(query) {
  return query
    .populate("passengers.participant")
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");
}

// ─── Helper: nombre completo de participante ──────────────────────────────────

function participantFullName(p) {
  return [p.firstName, p.firstSurname, p.secondSurname]
    .filter(Boolean)
    .join(" ");
}

// ─── Helper: detectar conflicto de ruta ──────────────────────────────────────
//
// Regla: un participante solo puede pertenecer a UNA ruta completa por gira.
// Si el vuelo destino tiene routeGroup X, el participante no puede estar en
// ningún vuelo de la misma gira con routeGroup distinto de X.
// Si el vuelo no tiene routeGroup, la restricción es: no puede estar en ningún
// otro vuelo (comportamiento anterior).
//
// Devuelve null si no hay conflicto, o { flightLabel, routeLabel } si lo hay.

async function detectRouteConflict(targetFlight, participantId) {
  const tourId = targetFlight.tour.toString();
  const targetGroup = targetFlight.routeGroup || null;

  // Buscar todos los vuelos de la gira donde este participante ya está asignado
  const assignedFlights = await TourFlight.find({
    tour: tourId,
    "passengers.participant": participantId,
    _id: { $ne: targetFlight._id }, // excluir el vuelo destino mismo
  })
    .select("airline flightNumber routeGroup origin destination")
    .lean();

  if (assignedFlights.length === 0) return null;

  // Si el vuelo destino tiene routeGroup, permitir estar en vuelos del MISMO grupo
  for (const f of assignedFlights) {
    const existingGroup = f.routeGroup || null;

    // Conflicto si:
    // - vuelo destino SIN grupo: no puede estar en ningún otro vuelo
    // - vuelo destino CON grupo: no puede estar en vuelos de grupo DISTINTO
    if (!targetGroup || !existingGroup || targetGroup !== existingGroup) {
      return {
        flightLabel: `${f.airline} ${f.flightNumber} (${f.origin}→${f.destination})`,
        routeLabel: existingGroup || "sin ruta asignada",
      };
    }
  }

  return null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function getTourFlights(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  return populateFlight(
    TourFlight.find({ tour: tourId }).sort({ departureAt: 1 }),
  );
}

async function getTourFlight(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de vuelo requerido");

  const flight = await populateFlight(TourFlight.findById(id));
  if (!flight) throw new Error("Vuelo no encontrado");
  return flight;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function createTourFlight(input, ctx) {
  const user = requireAdmin(ctx);

  if (!input) throw new Error("Datos de vuelo requeridos");
  if (!input.tourId) throw new Error("ID de gira requerido");
  if (!input.airline) throw new Error("Aerolínea requerida");
  if (!input.flightNumber) throw new Error("Número de vuelo requerido");
  if (!input.origin) throw new Error("Origen requerido");
  if (!input.destination) throw new Error("Destino requerido");
  if (!input.departureAt) throw new Error("Fecha/hora de salida requerida");
  if (!input.arrivalAt) throw new Error("Fecha/hora de llegada requerida");
  if (!input.direction) throw new Error("Dirección del vuelo requerida");

  const departure = new Date(input.departureAt);
  const arrival = new Date(input.arrivalAt);
  if (isNaN(departure.getTime())) throw new Error("Fecha de salida inválida");
  if (isNaN(arrival.getTime())) throw new Error("Fecha de llegada inválida");
  if (arrival <= departure)
    throw new Error("La llegada debe ser posterior a la salida");

  const tour = await Tour.findById(input.tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const { tourId, ...flightData } = input;

  const flight = await TourFlight.create({
    ...flightData,
    departureAt: departure,
    arrivalAt: arrival,
    tour: tourId,
    passengers: [],
    createdBy: user._id || user.id,
  });

  return populateFlight(TourFlight.findById(flight._id));
}

async function updateTourFlight(id, input, ctx) {
  const user = requireAdmin(ctx);

  if (!id) throw new Error("ID de vuelo requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const flight = await TourFlight.findById(id);
  if (!flight) throw new Error("Vuelo no encontrado");

  const allowed = {};
  if (input.airline !== undefined) allowed.airline = input.airline;
  if (input.flightNumber !== undefined)
    allowed.flightNumber = input.flightNumber;
  if (input.origin !== undefined) allowed.origin = input.origin;
  if (input.destination !== undefined) allowed.destination = input.destination;
  if (input.direction !== undefined) allowed.direction = input.direction;
  if (input.itineraryId !== undefined) allowed.itineraryId = input.itineraryId || null;
  if (input.notes !== undefined) allowed.notes = input.notes;

  if (input.departureAt) {
    const d = new Date(input.departureAt);
    if (isNaN(d.getTime())) throw new Error("Fecha de salida inválida");
    allowed.departureAt = d;
  }
  if (input.arrivalAt) {
    const d = new Date(input.arrivalAt);
    if (isNaN(d.getTime())) throw new Error("Fecha de llegada inválida");
    allowed.arrivalAt = d;
  }

  const dep = allowed.departureAt || flight.departureAt;
  const arr = allowed.arrivalAt || flight.arrivalAt;
  if (arr <= dep) throw new Error("La llegada debe ser posterior a la salida");

  allowed.updatedBy = user._id || user.id;

  const updated = await populateFlight(
    TourFlight.findByIdAndUpdate(id, allowed, {
      new: true,
      runValidators: true,
    }),
  );

  if (!updated) throw new Error("No se pudo actualizar el vuelo");
  return updated;
}

async function deleteTourFlight(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de vuelo requerido");

  const flight = await TourFlight.findById(id);
  if (!flight) throw new Error("Vuelo no encontrado");

  await TourFlight.findByIdAndDelete(id);
  return "Vuelo eliminado correctamente";
}

// ─── assignPassenger (individual) ────────────────────────────────────────────

async function assignPassenger(flightId, participantId, ctx) {
  const admin = requireAdmin(ctx);

  if (!flightId) throw new Error("ID de vuelo requerido");
  if (!participantId) throw new Error("ID de participante requerido");

  const flight = await TourFlight.findById(flightId);
  if (!flight) throw new Error("Vuelo no encontrado");

  const participant = await TourParticipant.findById(participantId);
  if (!participant) throw new Error("Participante no encontrado");

  if (participant.tour.toString() !== flight.tour.toString()) {
    throw new Error("El participante no pertenece a la gira de este vuelo");
  }

  const alreadyAssigned = flight.passengers.some(
    (p) => p.participant.toString() === participantId.toString(),
  );
  if (alreadyAssigned)
    throw new Error("El participante ya está asignado a este vuelo");

  // Verificar conflicto de ruta
  const conflict = await detectRouteConflict(flight, participantId);
  if (conflict) {
    throw new Error(
      `El participante ya está asignado a otro vuelo (${conflict.flightLabel}) ` +
        `de la ruta "${conflict.routeLabel}". Removelo de esa ruta primero.`,
    );
  }

  const updated = await populateFlight(
    TourFlight.findByIdAndUpdate(
      flightId,
      {
        $push: {
          passengers: { participant: participantId, confirmedAt: new Date() },
        },
        $set: { updatedBy: admin._id || admin.id },
      },
      { new: true, runValidators: true },
    ),
  );

  if (!updated) throw new Error("No se pudo asignar el pasajero");
  return updated;
}

// ─── assignPassengers (masiva) ────────────────────────────────────────────────

async function assignPassengers(flightId, participantIds, ctx) {
  const admin = requireAdmin(ctx);

  if (!flightId) throw new Error("ID de vuelo requerido");
  if (!participantIds || participantIds.length === 0) {
    throw new Error("Se requiere al menos un participante");
  }

  const flight = await TourFlight.findById(flightId);
  if (!flight) throw new Error("Vuelo no encontrado");

  const tourId = flight.tour.toString();

  // Cargar todos los participantes de una sola query
  const participants = await TourParticipant.find({
    _id: { $in: participantIds },
    tour: tourId,
  })
    .select("_id firstName firstSurname secondSurname tour")
    .lean();

  const foundIds = new Set(participants.map((p) => p._id.toString()));
  const alreadyInFlight = new Set(
    flight.passengers.map((p) => p.participant.toString()),
  );

  // Todos los vuelos de la gira con sus pasajeros (para detectar conflictos eficientemente)
  const allFlights = await TourFlight.find({
    tour: tourId,
    _id: { $ne: flightId },
  })
    .select("airline flightNumber origin destination routeGroup passengers")
    .lean();

  // Mapa: participantId → vuelo donde ya está asignado (distinto de este)
  const assignmentMap = new Map(); // participantId → { flightLabel, routeLabel }
  for (const f of allFlights) {
    for (const p of f.passengers) {
      const pid = p.participant.toString();
      if (!assignmentMap.has(pid)) {
        assignmentMap.set(pid, {
          flightLabel: `${f.airline} ${f.flightNumber} (${f.origin}→${f.destination})`,
          routeLabel: f.routeGroup || "sin ruta asignada",
        });
      }
    }
  }

  const targetGroup = flight.routeGroup || null;

  const toAssign = [];
  const conflicts = [];

  for (const p of participants) {
    const pid = p._id.toString();

    // Ya está en este vuelo → skip silencioso
    if (alreadyInFlight.has(pid)) continue;

    const existing = assignmentMap.get(pid);
    if (existing) {
      // Permitir si ambos tienen el mismo routeGroup (vuelos del mismo itinerario).
      // Esto cubre el caso multi-tramo: CONNECTING + OUTBOUND/INBOUND comparten routeGroup.
      const existingGroup = existing.routeLabel === "sin ruta asignada" ? null : existing.routeLabel;
      const sameRoute = targetGroup && existingGroup && targetGroup === existingGroup;

      if (!sameRoute) {
        conflicts.push({
          participantId: pid,
          participantName: participantFullName(p),
          conflictingFlight: existing.flightLabel,
          conflictingRoute: existing.routeLabel,
        });
        continue;
      }
    }

    toAssign.push(pid);
  }

  // Asignar en lote
  let updatedFlight = flight;
  if (toAssign.length > 0) {
    const now = new Date();
    const newPassengers = toAssign.map((pid) => ({
      participant: pid,
      confirmedAt: now,
    }));

    updatedFlight = await populateFlight(
      TourFlight.findByIdAndUpdate(
        flightId,
        {
          $push: { passengers: { $each: newPassengers } },
          $set: { updatedBy: admin._id || admin.id },
        },
        { new: true, runValidators: true },
      ),
    );
  } else {
    updatedFlight = await populateFlight(TourFlight.findById(flightId));
  }

  return {
    flight: updatedFlight,
    assigned: toAssign.length,
    skipped: participantIds.length - participants.length, // IDs no encontrados
    conflicts,
  };
}

// ─── removePassenger ─────────────────────────────────────────────────────────

async function removePassenger(flightId, participantId, ctx) {
  const admin = requireAdmin(ctx);

  if (!flightId) throw new Error("ID de vuelo requerido");
  if (!participantId) throw new Error("ID de participante requerido");

  const flight = await TourFlight.findById(flightId);
  if (!flight) throw new Error("Vuelo no encontrado");

  const isAssigned = flight.passengers.some(
    (p) => p.participant.toString() === participantId.toString(),
  );
  if (!isAssigned)
    throw new Error("El participante no está asignado a este vuelo");

  const updated = await populateFlight(
    TourFlight.findByIdAndUpdate(
      flightId,
      {
        $pull: { passengers: { participant: participantId } },
        $set: { updatedBy: admin._id || admin.id },
      },
      { new: true },
    ),
  );

  if (!updated) throw new Error("No se pudo remover el pasajero");
  return updated;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  requireAuth,
  requireAdmin,
  getTourFlights,
  getTourFlight,
  createTourFlight,
  updateTourFlight,
  deleteTourFlight,
  assignPassenger,
  assignPassengers,
  removePassenger,
};
