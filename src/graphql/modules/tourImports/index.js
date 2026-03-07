/**
 * tourImports/index.js
 * Módulo GraphQL: importación de participantes de gira desde Excel.
 */
"use strict";

const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const types = require("./resolvers/types");
const typeDefs = require("./typeDefs");

module.exports = {
  name: "tourImports",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
