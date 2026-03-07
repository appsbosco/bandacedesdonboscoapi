/**
 * tourDocuments/resolvers/types.js
 * Los campos id y participant ya vienen serializados desde el service.
 * TourParticipant es resuelto por el módulo tours (ya registrado).
 */

module.exports = {
  ParticipantDocumentStatus: {
    id: (parent) => parent.id,
  },

  DocumentAlert: {
    id: (parent) => parent.id,
  },
};
