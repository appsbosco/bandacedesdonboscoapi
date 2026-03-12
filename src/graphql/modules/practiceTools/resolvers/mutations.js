import * as svc from "../services/practiceTools.service.js";

export const mutations = {
  crearSecuencia: async (_, { input }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.crearSecuencia(ctx.user.id, input);
  },

  actualizarSecuencia: async (_, { id, input }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.actualizarSecuencia(id, ctx.user.id, input);
  },

  eliminarSecuencia: async (_, { id }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.eliminarSecuencia(id, ctx.user.id);
  },

  marcarUltimaSecuencia: async (_, { id }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.marcarUltimaSecuencia(id, ctx.user.id);
  },

  guardarQuickSettings: async (_, { input }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.guardarQuickSettings(ctx.user.id, input);
  },

  crearPreset: async (_, { input }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.crearPreset(ctx.user.id, input);
  },

  actualizarPreset: async (_, { id, input }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.actualizarPreset(id, ctx.user.id, input);
  },

  eliminarPreset: async (_, { id }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.eliminarPreset(id, ctx.user.id);
  },

  usarPreset: async (_, { id }, ctx) => {
    if (!ctx.user) throw new Error("No autenticado");
    return svc.usarPreset(id, ctx.user.id);
  },
};
