import * as svc from "../services/practiceTools.service.js";

export const queries = {
  misSecuencias: async (_, __, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.getMisSecuencias(ctx.user.id);
  },

  secuencia: async (_, { id }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.getSecuencia(id, ctx.user.id);
  },

  ultimaSecuencia: async (_, __, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.getUltimaSecuencia(ctx.user.id);
  },

  misQuickSettings: async (_, __, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.getQuickSettings(ctx.user.id);
  },

  misPresets: async (_, __, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.getMisPresets(ctx.user.id);
  },

  presetsPublicos: async (_, { limite, offset }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.getPresetsPublicos(limite, offset);
  },

  preset: async (_, { id }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.getPreset(id, ctx.user.id);
  },
};
