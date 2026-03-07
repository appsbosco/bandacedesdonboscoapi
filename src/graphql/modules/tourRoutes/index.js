/**
 * tourRoutes/index.js
 * GraphQL module: route-based itinerary and passenger management for tours.
 */
"use strict";

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
  name: "tourRoutes",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
