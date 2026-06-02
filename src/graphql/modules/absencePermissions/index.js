const typeDefs = require("./typeDefs");
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const types = require("./resolvers/types");

module.exports = {
  name: "absencePermissions",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
