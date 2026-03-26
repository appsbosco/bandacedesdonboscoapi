const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const types = require("./resolvers/types");
const typeDefs = require("./typeDefs");

module.exports = {
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
