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

const {
  Query: committeeQuery = {},
  Mutation: committeeMutation = {},
  ...committeeTypeResolvers
} = committeeBudget.resolvers || {};

module.exports = {
  name: "finance",
  typeDefs: [typeDefs, committeeBudget.typeDefs],
  resolvers: {
    Query: {
      ...queries,
      ...committeeQuery,
    },
    Mutation: {
      ...mutations,
      ...committeeMutation,
    },
    ...types,
    ...committeeTypeResolvers,
  },
};
