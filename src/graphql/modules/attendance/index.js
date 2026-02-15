/**
 * Módulo GraphQL:  attendance
 * Listo para mergear
 */
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const typeDefs = require("./typeDefs");

module.exports = {
  name: "attendance",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
  },
};
