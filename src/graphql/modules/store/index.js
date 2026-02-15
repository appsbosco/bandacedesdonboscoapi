/**
 * Módulo GraphQL: store
 * Listo para mergear
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
  name: "store",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
