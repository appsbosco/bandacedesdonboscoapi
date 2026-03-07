/**
 * tours/services/tour.service.js
 * Lógica de negocio: giras y participantes autónomos.
 */

const Tour = require("../../../../../models/Tour");
const TourParticipant = require("../../../../../models/TourParticipant");

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

// ─── Helper: poblar participante ──────────────────────────────────────────────

function populateParticipant(query) {
  return query
    .populate("linkedUser", "name firstSurName secondSurName email")
    .populate("addedBy", "name firstSurName");
}

function serializeTour(tour) {
  if (!tour) return null;
  const obj = tour.toObject ? tour.toObject() : { ...tour };

  return {
    ...obj,
    id: obj._id?.toString(),
    startDate: obj.startDate,
    endDate: obj.endDate,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

// ─── Tour CRUD ────────────────────────────────────────────────────────────────

async function getTour(id, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de gira requerido");
  const tour = await Tour.findById(id)
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");

  if (!tour) throw new Error("Gira no encontrada");
  return serializeTour(tour); // ← agrega esto
}

async function getTours(filters, ctx) {
  requireAuth(ctx);
  const query = {};
  if (filters?.status) query.status = filters.status;
  const tours = await Tour.find(query)
    .sort({ startDate: 1 })
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");

  console.log(tours);
  return tours.map(serializeTour);
}

async function createTour(input, ctx) {
  const user = requireAdmin(ctx);

  if (!input) throw new Error("Datos de gira requeridos");
  if (!input.name) throw new Error("El nombre de la gira es requerido");
  if (!input.destination) throw new Error("El destino es requerido");
  if (!input.country) throw new Error("El país es requerido");
  if (!input.startDate) throw new Error("La fecha de inicio es requerida");
  if (!input.endDate) throw new Error("La fecha de fin es requerida");

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (isNaN(start.getTime())) throw new Error("Fecha de inicio inválida");
  if (isNaN(end.getTime())) throw new Error("Fecha de fin inválida");
  if (end <= start)
    throw new Error("La fecha de fin debe ser posterior a la de inicio");

  const tour = await Tour.create({
    ...input,
    startDate: start,
    endDate: end,
    createdBy: user._id || user.id,
  });

  return Tour.findById(tour._id).populate("createdBy", "name firstSurName");
}

async function updateTour(id, input, ctx) {
  const user = requireAdmin(ctx);

  if (!id) throw new Error("ID de gira requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const tour = await Tour.findById(id);
  if (!tour) throw new Error("Gira no encontrada");

  const updateData = { ...input, updatedBy: user._id || user.id };

  if (input.startDate) {
    const d = new Date(input.startDate);
    if (isNaN(d.getTime())) throw new Error("Fecha de inicio inválida");
    updateData.startDate = d;
  }
  if (input.endDate) {
    const d = new Date(input.endDate);
    if (isNaN(d.getTime())) throw new Error("Fecha de fin inválida");
    updateData.endDate = d;
  }

  const start = updateData.startDate || tour.startDate;
  const end = updateData.endDate || tour.endDate;
  if (end <= start)
    throw new Error("La fecha de fin debe ser posterior a la de inicio");

  const updated = await Tour.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");

  if (!updated) throw new Error("No se pudo actualizar la gira");
  return updated;
}

async function deleteTour(id, ctx) {
  requireAdmin(ctx);

  if (!id) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(id);
  if (!tour) throw new Error("Gira no encontrada");

  const participantCount = await TourParticipant.countDocuments({ tour: id });
  if (participantCount > 0) {
    throw new Error(
      `No se puede eliminar: la gira tiene ${participantCount} participante(s) inscrito(s)`,
    );
  }

  await Tour.findByIdAndDelete(id);
  return "Gira eliminada correctamente";
}

// ─── Participantes ────────────────────────────────────────────────────────────

async function getTourParticipants(tourId, filters, ctx) {
  requireAuth(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const query = { tour: tourId };
  if (filters?.status) query.status = filters.status;
  if (filters?.role) query.role = filters.role;

  return populateParticipant(
    TourParticipant.find(query).sort({ firstSurname: 1, firstName: 1 }),
  );
}

async function getTourParticipant(id, ctx) {
  requireAuth(ctx);
  if (!id) throw new Error("ID de participante requerido");

  const participant = await populateParticipant(TourParticipant.findById(id));
  if (!participant) throw new Error("Participante no encontrado");
  return participant;
}

async function createTourParticipant(tourId, input, ctx) {
  const admin = requireAdmin(ctx);

  if (!tourId) throw new Error("ID de gira requerido");
  if (!input) throw new Error("Datos del participante requeridos");
  if (!input.firstName) throw new Error("El nombre es requerido");
  if (!input.firstSurname) throw new Error("El primer apellido es requerido");
  if (!input.identification) throw new Error("La identificación es requerida");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const fingerprint = TourParticipant.buildFingerprint(
    input.firstName,
    input.firstSurname,
    input.identification,
  );

  const existing = await TourParticipant.findOne({ tour: tourId, fingerprint });
  if (existing) {
    throw new Error(
      `Ya existe un participante con los mismos datos de identidad (${input.firstName} ${input.firstSurname}, ${input.identification})`,
    );
  }

  const { linkedUserId, ...participantData } = input;

  const data = {
    ...participantData,
    tour: tourId,
    fingerprint,
    addedBy: admin._id || admin.id,
  };
  if (linkedUserId) data.linkedUser = linkedUserId;

  const participant = await TourParticipant.create(data);
  return populateParticipant(TourParticipant.findById(participant._id));
}

async function createTourParticipantsBatch(tourId, participantsInput, ctx) {
  const admin = requireAdmin(ctx);

  if (!tourId) throw new Error("ID de gira requerido");
  if (!Array.isArray(participantsInput) || participantsInput.length === 0) {
    throw new Error("Se requiere al menos un participante");
  }

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const adminId = admin._id || admin.id;
  const toInsert = [];
  let duplicates = 0;
  let errors = 0;

  for (const input of participantsInput) {
    if (!input.firstName || !input.firstSurname || !input.identification) {
      errors++;
      continue;
    }

    const fingerprint = TourParticipant.buildFingerprint(
      input.firstName,
      input.firstSurname,
      input.identification,
    );

    const { linkedUserId, ...participantData } = input;
    const doc = {
      ...participantData,
      tour: tourId,
      fingerprint,
      addedBy: adminId,
    };
    if (linkedUserId) doc.linkedUser = linkedUserId;

    toInsert.push(doc);
  }

  // Verificar cuáles ya existen (por fingerprint)
  const fingerprints = toInsert.map((d) => d.fingerprint);
  const existingFPs = await TourParticipant.find(
    { tour: tourId, fingerprint: { $in: fingerprints } },
    { fingerprint: 1 },
  ).lean();
  const existingSet = new Set(existingFPs.map((e) => e.fingerprint));

  const newDocs = toInsert.filter((d) => !existingSet.has(d.fingerprint));
  duplicates += toInsert.length - newDocs.length;

  let insertedIds = [];
  if (newDocs.length > 0) {
    const inserted = await TourParticipant.insertMany(newDocs, {
      ordered: false,
    });
    insertedIds = inserted.map((p) => p._id);
  }

  const participants =
    insertedIds.length > 0
      ? await populateParticipant(
          TourParticipant.find({ _id: { $in: insertedIds } }),
        )
      : [];

  return {
    inserted: insertedIds.length,
    duplicates,
    errors,
    participants,
  };
}

async function updateTourParticipant(id, input, ctx) {
  const admin = requireAdmin(ctx);

  if (!id) throw new Error("ID de participante requerido");
  if (!input) throw new Error("Datos de actualización requeridos");

  const participant = await TourParticipant.findById(id);
  if (!participant) throw new Error("Participante no encontrado");

  const allowed = {};
  const identityFields = [
    "firstName",
    "firstSurname",
    "secondSurname",
    "identification",
  ];
  for (const f of identityFields) {
    if (input[f] !== undefined) allowed[f] = input[f];
  }

  const fields = [
    "email",
    "phone",
    "birthDate",
    "instrument",
    "grade",
    "passportNumber",
    "passportExpiry",
    "hasVisa",
    "visaExpiry",
    "hasExitPermit",
    "status",
    "role",
    "notes",
  ];
  for (const f of fields) {
    if (input[f] !== undefined) allowed[f] = input[f];
  }

  if (input.linkedUserId !== undefined) {
    allowed.linkedUser = input.linkedUserId || null;
  }

  // Recalcular fingerprint si cambia identidad
  const needsFingerprint = identityFields.some((f) => allowed[f] !== undefined);
  if (needsFingerprint) {
    allowed.fingerprint = TourParticipant.buildFingerprint(
      allowed.firstName || participant.firstName,
      allowed.firstSurname || participant.firstSurname,
      allowed.identification || participant.identification,
    );
  }

  allowed.updatedBy = admin._id || admin.id;

  const updated = await populateParticipant(
    TourParticipant.findByIdAndUpdate(id, allowed, {
      new: true,
      runValidators: true,
    }),
  );

  if (!updated) throw new Error("No se pudo actualizar el participante");
  return updated;
}

async function removeTourParticipant(id, ctx) {
  requireAdmin(ctx);

  if (!id) throw new Error("ID de participante requerido");

  const participant = await TourParticipant.findById(id);
  if (!participant) throw new Error("Participante no encontrado");

  await TourParticipant.findByIdAndDelete(id);
  return "Participante removido correctamente";
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  requireAuth,
  requireAdmin,
  getTour,
  getTours,
  createTour,
  updateTour,
  deleteTour,
  getTourParticipants,
  getTourParticipant,
  createTourParticipant,
  createTourParticipantsBatch,
  updateTourParticipant,
  removeTourParticipant,
};
