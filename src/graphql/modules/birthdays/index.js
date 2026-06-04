"use strict";

const typeDefs = require("./typeDefs");
const queries = require("./resolvers/queries");

module.exports = {
  name: "birthdays",
  typeDefs,
  resolvers: {
    Query: queries,
  },
};
