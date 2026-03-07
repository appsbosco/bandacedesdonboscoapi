/**
 * tourRooms/resolvers/types.js
 */

const toISO = (val) => {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
};

module.exports = {
  TourRoom: {
    id: (parent) => parent._id?.toString() ?? parent.id,
    occupantCount: (parent) => (parent.occupants || []).length,
    isFull: (parent) => (parent.occupants || []).length >= parent.capacity,
    createdAt: (parent) => toISO(parent.createdAt),
    updatedAt: (parent) => toISO(parent.updatedAt),
  },

  TourRoomOccupant: {
    confirmedAt: (parent) => toISO(parent.confirmedAt),
  },
};
