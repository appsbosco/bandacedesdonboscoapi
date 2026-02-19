/**
 * finance/index.js
 * Módulo GraphQL: finance (Caja + Ingresos + Egresos + Reportes)
 */
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const typeDefs = require("./typeDefs");

let types = {};
try {
  types = require("./resolvers/types");
} catch (e) {
  types = {};
}

module.exports = {
  name: "finance",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
