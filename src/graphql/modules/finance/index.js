/**
 * finance/index.js
 * Módulo GraphQL: finance (Caja + Ingresos + Egresos + Reportes)
 */
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const typeDefs = require("./typeDefs");

const committeeBudget = require("./committee-budget.index");

let types = {};
try {
  types = require("./resolvers/types");
} catch (e) {
  types = {};
}

module.exports = {
  name: "finance",
  typeDefs: [typeDefs, committeeBudget.typeDefs], // array de typeDefs
  resolvers: {
    Query: { ...queries, ...committeeBudget.resolvers.Query },
    Mutation: { ...mutations, ...committeeBudget.resolvers.Mutation },
    ...types,
    ...committeeBudget.resolvers, // types adicionales
  },
};
