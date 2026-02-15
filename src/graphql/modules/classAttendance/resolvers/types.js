/**
 * Módulo GraphQL: classAttendance
 * Listo para mergear
 */
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");

const typeDefs = require("./typeDefs");
try {
  types = require("./resolvers/types");
} catch (e) {
  types = {};
}

module.exports = {
  Query: queries,
  Mutation: mutations,
  ...typeDefs,
};
