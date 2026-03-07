/**
 * tourDocuments/index.js
 * Módulo GraphQL: control documental migratorio de participantes.
 * Solo expone queries — las mutations de documentos viven en el módulo documents.
 */
"use strict";

const queries = require("./resolvers/queries");
const typeDefs = require("./typeDefs");

let types = {};
try {
  types = require("./resolvers/types");
} catch (e) {
  types = {};
}

module.exports = {
  name: "tourDocuments",
  typeDefs,
  resolvers: {
    Query: queries,
    ...types,
  },
};
