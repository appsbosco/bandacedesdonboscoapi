/**
 * events/index.js
 * Módulo GraphQL de eventos — listo para mergear con makeExecutableSchema
 */
"use strict";

const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const typeDefs = require("./typeDefs");

// Resolver de tipo para serializar _id de MongoDB → id
const EventType = {
  Event: {
    id: (parent) => parent._id?.toString() ?? parent.id,
    date: (parent) =>
      parent.date instanceof Date
        ? String(parent.date.getTime())
        : String(parent.date ?? ""),
    createdAt: (parent) =>
      parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : String(parent.createdAt ?? ""),
    updatedAt: (parent) =>
      parent.updatedAt instanceof Date
        ? parent.updatedAt.toISOString()
        : String(parent.updatedAt ?? ""),
    notificationLog: (parent) => {
      if (!parent.notificationLog) return null;
      const log = parent.notificationLog;
      return {
        ...log,
        dispatchedAt:
          log.dispatchedAt instanceof Date
            ? log.dispatchedAt.toISOString()
            : (log.dispatchedAt ?? null),
        dryRunPayload: log.dryRunPayload
          ? JSON.stringify(log.dryRunPayload)
          : null,
      };
    },
  },
};

module.exports = {
  name: "events",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...EventType,
  },
};
