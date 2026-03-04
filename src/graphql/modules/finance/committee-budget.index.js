"use strict";

const typeDefs = require("./committee-budget.typeDefs");
const mutationResolvers = require("./resolvers/committee-budget.mutations");
const queryResolvers = require("./resolvers/committee-budget.queries");
const typeResolvers = require("./resolvers/committee-budget.types");

const resolvers = {
  Query: queryResolvers,
  Mutation: mutationResolvers,
  ...typeResolvers,
};

module.exports = {
  name: "committee-budget",
  typeDefs,
  resolvers,
};
