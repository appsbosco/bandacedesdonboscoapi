module.exports = {
  Formation: {
    id:         (p) => p._id?.toString() || p.id,
    date:       (p) => (p.date instanceof Date ? p.date.toISOString() : p.date),
    createdAt:  (p) => (p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt),
    updatedAt:  (p) => (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt),
    // Fallback for old documents that predate the columns field
    columns:          (p) => p.columns ?? 8,
    zoneOrders:       (p) => p.zoneOrders || [],
    zoneColumns:      (p) => p.zoneColumns || [],
    excludedUserIds:  (p) => (p.excludedUserIds || []).map((id) => id.toString()),
    instrumentMappings: (p) => p.instrumentMappings || [],
    zoneMemberCounts: (p) => p.zoneMemberCounts || [],
  },

  FormationTemplate: {
    id:        (p) => p._id?.toString() || p.id,
    createdAt: (p) => (p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt),
    updatedAt: (p) => (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt),
    defaultColumns:     (p) => p.defaultColumns ?? 8,
    zoneOrders:         (p) => p.zoneOrders || [],
    zoneColumns:        (p) => p.zoneColumns || [],
    instrumentMappings: (p) => p.instrumentMappings || [],
  },

  FormationUser: {
    id: (p) => p._id?.toString() || p.id,
  },

  FormationSlot: {
    locked:  (p) => p.locked ?? false,
    section: (p) => p.section || null,
    userId:  (p) => p.userId?.toString() || null,
  },
};
