// Resolvers de campos computados en los tipos

export const types = {
  PracticeSequence: {
    id: (parent) => parent._id?.toString() || parent.id,
    createdAt: (parent) =>
      parent.createdAt?.toISOString?.() || parent.createdAt,
    updatedAt: (parent) =>
      parent.updatedAt?.toISOString?.() || parent.updatedAt,
    lastUsedAt: (parent) =>
      parent.lastUsedAt?.toISOString?.() || parent.lastUsedAt,
  },

  MetronomeQuickSettings: {
    id: (parent) => parent._id?.toString() || parent.id,
    updatedAt: (parent) =>
      parent.updatedAt?.toISOString?.() || parent.updatedAt,
  },

  PracticePreset: {
    id: (parent) => parent._id?.toString() || parent.id,
    createdAt: (parent) =>
      parent.createdAt?.toISOString?.() || parent.createdAt,
    lastUsedAt: (parent) =>
      parent.lastUsedAt?.toISOString?.() || parent.lastUsedAt,
    // Se resuelve en el resolver de query inyectando el userId del ctx, pero aquí
    // necesitamos el contexto. Lo manejamos desde el servicio como campo adicional.
    esPropio: (parent, _, ctx) =>
      ctx.user ? String(parent.user) === String(ctx.user.id) : false,
  },
};
