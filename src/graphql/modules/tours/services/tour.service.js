/**
 * tours/services/tour.service.js
 * Lógica de negocio: giras y participantes autónomos.
 */

const Tour = require("../../../../../models/Tour");
const TourParticipant = require("../../../../../models/TourParticipant");
const {
  syncTourDocumentsForOwner,
} = require("../../tourDocuments/services/tourDocuments.service");
const {
  isPrivilegedTourViewer,
  getLinkedTourParticipantOrThrow,
  isParentActor,
  getParentChildrenUserIds,
  assertParentCanViewChild,
} = require("../../../shared/tourAuth");
const {
  removeTourParticipantSafely,
} = require("./tourParticipantRemoval.service");
const {
  setTourParticipantVisaStatus,
} = require("./tourVisaStatus.service");

// ─── Auth guards ─────────────────────────────────────────────────────────────

function requireAuth(ctx) {
  const user = ctx?.user || ctx?.me || ctx?.currentUser;
  if (!user) throw new Error("No autenticado");
  return user;
}

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);
const CANONICAL_DOCUMENT_FIELDS = new Set([
  "passportNumber",
  "passportExpiry",
  "hasVisa",
  "visaExpiry",
  "hasExitPermit",
]);

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
    .populate("addedBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName")
    .populate("removedBy", "name firstSurName")
    .populate("visaBlockedBy", "name firstSurName")
    .populate("visaHistory.decidedBy", "name firstSurName");
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
  // Lista completa de participantes: solo acceso admin
  requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  const query = { tour: tourId };
  if (filters?.includeRemoved !== true) {
    query.isRemoved = { $ne: true };
  }
  if (filters?.status) query.status = filters.status;
  if (filters?.role) query.role = filters.role;
  if (filters?.visaStatus) query.visaStatus = filters.visaStatus;

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

  const existing = await TourParticipant.findOne({
    tour: tourId,
    $or: [
      { fingerprint },
      ...(input.linkedUserId
        ? [
            { linkedUser: input.linkedUserId },
            { linkedUserSnapshotId: input.linkedUserId, isRemoved: true },
          ]
        : []),
    ],
  });
  if (existing) {
    if (!existing.isRemoved) {
      throw new Error(
        `Ya existe un participante con los mismos datos de identidad (${input.firstName} ${input.firstSurname}, ${input.identification})`,
      );
    }

    const { linkedUserId, ...participantData } = input;
    existing.set({
      ...participantData,
      fingerprint,
      linkedUser: linkedUserId || null,
      linkedUserSnapshotId: linkedUserId || null,
      linkedUserSnapshotName: null,
      linkedUserSnapshotEmail: null,
      isRemoved: false,
      removedAt: null,
      removedBy: null,
      removalReason: null,
      removalSource: null,
      removalHadPayments: false,
      updatedBy: admin._id || admin.id,
    });
    await existing.save();
    if (linkedUserId) {
      await syncTourDocumentsForOwner(linkedUserId, {
        updatedBy: admin._id || admin.id,
      });
    }
    return populateParticipant(TourParticipant.findById(existing._id));
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
  if (linkedUserId) {
    await syncTourDocumentsForOwner(linkedUserId, { updatedBy: admin._id || admin.id });
  }
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

    const linkedOwners = [
      ...new Set(
        inserted
          .map((participant) => participant.linkedUser?.toString?.() || participant.linkedUser)
          .filter(Boolean),
      ),
    ];
    for (const ownerId of linkedOwners) {
      await syncTourDocumentsForOwner(ownerId, { updatedBy: adminId });
    }
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
  if (participant.isRemoved) {
    throw new Error("El participante fue eliminado de la gira y no puede editarse");
  }

  const attemptedCanonicalFields = [...CANONICAL_DOCUMENT_FIELDS].filter(
    (field) => input[field] !== undefined,
  );
  if (participant.linkedUser && attemptedCanonicalFields.length > 0) {
    throw new Error(
      "Pasaporte, visa y permiso de salida se sincronizan desde Documents para participantes vinculados. Editalos en el módulo Documents.",
    );
  }

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
    "sex",
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
  if (allowed.linkedUser) {
    await syncTourDocumentsForOwner(allowed.linkedUser, { updatedBy: allowed.updatedBy });
    return populateParticipant(TourParticipant.findById(id));
  }
  return updated;
}

async function updateTourParticipantSex(participantId, sex, ctx) {
  requireAdmin(ctx);

  if (!participantId) throw new Error("ID de participante requerido");

  const VALID_SEX = ["M", "F", "OTHER", "UNKNOWN"];
  if (!VALID_SEX.includes(sex)) throw new Error(`Sexo inválido: ${sex}`);

  const updated = await populateParticipant(
    TourParticipant.findByIdAndUpdate(
      participantId,
      { sex },
      { new: true, runValidators: true },
    ),
  );

  if (!updated) throw new Error("Participante no encontrado");
  return updated;
}

async function updateTourParticipantVisaStatus(participantId, input, ctx) {
  const admin = requireAdmin(ctx);
  return setTourParticipantVisaStatus(participantId, input, admin);
}

async function removeTourParticipant(id, ctx) {
  requireAdmin(ctx);

  if (!id) throw new Error("ID de participante requerido");

  const participant = await TourParticipant.findById(id);
  if (!participant) throw new Error("Participante no encontrado");

  await TourParticipant.findByIdAndDelete(id);
  return "Participante removido correctamente";
}

/**
 * Elimina un participante y todas sus referencias en cascade:
 * - TourItineraryAssignment (asignaciones de itinerario)
 * - TourRouteAssignment (asignaciones de ruta)
 * - TourRoom.occupants[] (sacar del arreglo de ocupantes)
 * - TourItinerary.leaderIds[] (sacar de líderes de itinerario)
 * - TourPayment (pagos de gira)
 * - ParticipantFinancialAccount (cuenta financiera)
 * - ParticipantInstallment (cuotas individuales)
 * - TourParticipant (el documento principal)
 */
async function deleteTourParticipant(id, ctx) {
  const admin = requireAdmin(ctx);
  return removeTourParticipantSafely({
    participantId: id,
    actor: admin,
    removalSource: "ADMIN",
    removalReason: "Eliminado manualmente desde Tours",
  });
}

// ─── Self-service ─────────────────────────────────────────────────────────────

/**
 * Devuelve el TourParticipant vinculado al usuario autenticado para una gira.
 * Usado por usuarios no-privilegiados para ver sus propios datos (documentos, etc.)
 */
async function getMyTourParticipant(tourId, ctx) {
  const user = requireAuth(ctx);
  if (!tourId) throw new Error("ID de gira requerido");

  const userId = user._id || user.id;
  return getLinkedTourParticipantOrThrow({ userId, tourId });
}

// ─── Parent self-service ──────────────────────────────────────────────────────

/**
 * Returns all TourParticipants in the tour whose linkedUser is one of
 * the authenticated parent's children.
 */
async function getMyChildrenTourAccess(tourId, ctx) {
  requireAuth(ctx);
  if (!isParentActor(ctx)) throw new Error("Esta consulta es exclusiva para padres de familia");
  if (!tourId) throw new Error("ID de gira requerido");

  const childrenIds = await getParentChildrenUserIds(ctx);
  if (childrenIds.length === 0) return [];

  return populateParticipant(
    TourParticipant.find({
      tour: tourId,
      linkedUser: { $in: childrenIds },
      isRemoved: { $ne: true },
    })
  );
}

/**
 * Returns the TourParticipant for a specific child of the authenticated parent.
 */
async function getMyChildTourParticipant(tourId, childUserId, ctx) {
  requireAuth(ctx);
  if (!isParentActor(ctx)) throw new Error("Esta consulta es exclusiva para padres de familia");
  if (!tourId) throw new Error("ID de gira requerido");
  if (!childUserId) throw new Error("ID de hijo requerido");

  const childrenIds = await getParentChildrenUserIds(ctx);
  assertParentCanViewChild({ childUserId, parentChildrenIds: childrenIds });

  const participant = await populateParticipant(
    TourParticipant.findOne({
      tour: tourId,
      linkedUser: childUserId,
      isRemoved: { $ne: true },
    })
  );

  if (!participant) return null;
  return participant;
}

// ─── Self-service access config (Admin only) ──────────────────────────────────

/**
 * Actualiza la configuración de self-service de una gira.
 * Solo Admin puede modificarla.
 */
async function updateTourSelfServiceAccess(tourId, input, ctx) {
  const admin = requireAdmin(ctx);
  if (!tourId) throw new Error("ID de gira requerido");
  if (!input) throw new Error("Datos de configuración requeridos");

  const tour = await Tour.findById(tourId);
  if (!tour) throw new Error("Gira no encontrada");

  // Actualizar solo los campos que llegan en el input
  const allowed = ["enabled", "documents", "payments", "rooms", "itinerary", "flights"];
  const update = {};
  for (const key of allowed) {
    if (input[key] !== undefined) {
      update[`selfServiceAccess.${key}`] = input[key];
    }
  }
  update.updatedBy = admin._id || admin.id;

  const updated = await Tour.findByIdAndUpdate(tourId, update, {
    new: true,
    runValidators: true,
  })
    .populate("createdBy", "name firstSurName")
    .populate("updatedBy", "name firstSurName");

  if (!updated) throw new Error("No se pudo actualizar la configuración");
  return serializeTour(updated);
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
  updateTourParticipantSex,
  updateTourParticipantVisaStatus,
  removeTourParticipant,
  deleteTourParticipant,
  // Self-service
  getMyTourParticipant,
  updateTourSelfServiceAccess,
  // Parent self-service
  getMyChildrenTourAccess,
  getMyChildTourParticipant,
};
