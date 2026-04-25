/**
 * tourRooms/services/tourRooms.service.js
 * Lógica de negocio: habitaciones de gira y asignación de ocupantes.
 * Ocupantes referenciados por TourParticipant (no User).
 */

const TourRoom = require("../../../../../models/TourRoom");
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

// ─── Helper: poblar habitación ────────────────────────────────────────────────

function populateRoom(query) {
  return query
    .populate("occupants.participant")
    .populate("responsible")
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function getTourRooms(tourId, ctx) {
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  return populateRoom(
    TourRoom.find({ tour: tourId }).sort({ hotelName: 1, roomNumber: 1 })
  );
}

async function getTourRoom(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de habitación requerido");

  const room = await populateRoom(TourRoom.findById(id));
  if (!room) throw new Error("Habitación no encontrada");
  return room;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function createTourRoom(input, ctx) {
  const user = requireAdmin(ctx);

  if (!input) throw new Error("Datos de habitación requeridos");
  if (!input.tourId) throw new Error("ID de gira requerido");
  if (!input.hotelName) throw new Error("Nombre del hotel requerido");
  if (!input.roomNumber) throw new Error("Número de habitación requerido");
  if (!input.roomType) throw new Error("Tipo de habitación requerido");
  if (!input.capacity || input.capacity < 1) throw new Error("Capacidad mínima es 1");

  const tour = await Tour.findById(input.tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const { tourId, ...roomData } = input;

  const room = await TourRoom.create({
    ...roomData,
    tour: tourId,
    occupants: [],
    createdBy: user._id || user.id,
  });

  return populateRoom(TourRoom.findById(room._id));
}

async function updateTourRoom(id, input, ctx) {
  const user = requireAdmin(ctx);

  if (!id) throw new Error("ID de habitación requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const room = await TourRoom.findById(id);
  if (!room) throw new Error("Habitación no encontrada");

  if (input.capacity !== undefined && input.capacity < room.occupants.length) {
    throw new Error(
      `No se puede reducir la capacidad a ${input.capacity}: hay ${room.occupants.length} ocupante(s) asignado(s)`
    );
  }

  const allowed = {};
  if (input.hotelName !== undefined) allowed.hotelName = input.hotelName;
  if (input.roomNumber !== undefined) allowed.roomNumber = input.roomNumber;
  if (input.roomType !== undefined) allowed.roomType = input.roomType;
  if (input.capacity !== undefined) allowed.capacity = input.capacity;
  if (input.floor !== undefined) allowed.floor = input.floor;
  if (input.notes !== undefined) allowed.notes = input.notes;
  if (input.responsibleId !== undefined) {
    if (input.responsibleId) {
      const participant = await TourParticipant.findById(input.responsibleId);
      if (!participant) throw new Error("Participante no encontrado");
      if (participant.isRemoved) throw new Error("El participante fue eliminado de la gira");
      assertParticipantVisaEligible(participant);

      const isOccupant = room.occupants.some(
        (o) => o.participant.toString() === input.responsibleId.toString()
      );
      if (!isOccupant) {
        throw new Error("El participante no es ocupante de esta habitación");
      }
    }
    allowed.responsible = input.responsibleId || null;
  }
  allowed.updatedBy = user._id || user.id;

  const updated = await populateRoom(
    TourRoom.findByIdAndUpdate(id, allowed, { new: true, runValidators: true })
  );

  if (!updated) throw new Error("No se pudo actualizar la habitación");
  return updated;
}

async function deleteTourRoom(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID de habitación requerido");

  const room = await TourRoom.findById(id);
  if (!room) throw new Error("Habitación no encontrada");

  if (room.occupants.length > 0) {
    throw new Error(
      `No se puede eliminar: la habitación tiene ${room.occupants.length} ocupante(s) asignado(s)`
    );
  }

  await TourRoom.findByIdAndDelete(id);
  return "Habitación eliminada correctamente";
}

async function assignOccupant(roomId, participantId, ctx) {
  const admin = requireAdmin(ctx);

  if (!roomId) throw new Error("ID de habitación requerido");
  if (!participantId) throw new Error("ID de participante requerido");

  const room = await TourRoom.findById(roomId);
  if (!room) throw new Error("Habitación no encontrada");

  const participant = await TourParticipant.findById(participantId);
  if (!participant) throw new Error("Participante no encontrado");
  if (participant.isRemoved) throw new Error("El participante fue eliminado de la gira");
  assertParticipantVisaEligible(participant);

  if (participant.tour.toString() !== room.tour.toString()) {
    throw new Error("El participante no pertenece a la gira de esta habitación");
  }

  const alreadyHere = room.occupants.some(
    (o) => o.participant.toString() === participantId.toString()
  );
  if (alreadyHere) throw new Error("El participante ya está asignado a esta habitación");

  // Verificar que no está en otra habitación del mismo tour
  const otherRoom = await TourRoom.findOne({
    tour: room.tour,
    _id: { $ne: roomId },
    "occupants.participant": participantId,
  });
  if (otherRoom) {
    throw new Error(
      `El participante ya está asignado a la habitación ${otherRoom.roomNumber} (${otherRoom.hotelName})`
    );
  }

  if (room.occupants.length >= room.capacity) {
    throw new Error(`Capacidad máxima alcanzada (${room.capacity} ocupante(s))`);
  }

  const updated = await populateRoom(
    TourRoom.findByIdAndUpdate(
      roomId,
      {
        $push: { occupants: { participant: participantId, confirmedAt: new Date() } },
        $set: { updatedBy: admin._id || admin.id },
      },
      { new: true, runValidators: true }
    )
  );

  if (!updated) throw new Error("No se pudo asignar el ocupante");
  return updated;
}

async function removeOccupant(roomId, participantId, ctx) {
  const admin = requireAdmin(ctx);

  if (!roomId) throw new Error("ID de habitación requerido");
  if (!participantId) throw new Error("ID de participante requerido");

  const room = await TourRoom.findById(roomId);
  if (!room) throw new Error("Habitación no encontrada");

  const isAssigned = room.occupants.some(
    (o) => o.participant.toString() === participantId.toString()
  );
  if (!isAssigned) throw new Error("El participante no está asignado a esta habitación");

  const updated = await populateRoom(
    TourRoom.findByIdAndUpdate(
      roomId,
      {
        $pull: { occupants: { participant: participantId } },
        $set: { updatedBy: admin._id || admin.id },
      },
      { new: true }
    )
  );

  if (!updated) throw new Error("No se pudo remover el ocupante");
  return updated;
}

async function setRoomResponsible(roomId, participantId, ctx) {
  const admin = requireAdmin(ctx);

  if (!roomId) throw new Error("ID de habitación requerido");

  const room = await TourRoom.findById(roomId);
  if (!room) throw new Error("Habitación no encontrada");

  // participantId === null → clear responsible
  if (participantId) {
    const participant = await TourParticipant.findById(participantId);
    if (!participant) throw new Error("Participante no encontrado");
    if (participant.isRemoved) throw new Error("El participante fue eliminado de la gira");
    assertParticipantVisaEligible(participant);

    // Must be an occupant of this room
    const isOccupant = room.occupants.some(
      (o) => o.participant.toString() === participantId.toString()
    );
    if (!isOccupant) {
      throw new Error("El participante no es ocupante de esta habitación");
    }
  }

  const updated = await populateRoom(
    TourRoom.findByIdAndUpdate(
      roomId,
      { $set: { responsible: participantId || null, updatedBy: admin._id || admin.id } },
      { new: true }
    )
  );

  if (!updated) throw new Error("No se pudo actualizar el responsable");
  return updated;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  requireAuth,
  requireAdmin,
  getTourRooms,
  getTourRoom,
  createTourRoom,
  updateTourRoom,
  deleteTourRoom,
  assignOccupant,
  removeOccupant,
  setRoomResponsible,
};
