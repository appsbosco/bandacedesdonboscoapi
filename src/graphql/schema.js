const { makeExecutableSchema } = require("@graphql-tools/schema");
const baseTypeDefs = require("./base/typeDefs");
const mergeResolvers = require("./resolvers/index");
const modules = require("./modules");

const typeDefs = [
  baseTypeDefs,
  ...modules.map((m) => m.typeDefs).filter(Boolean),
];

const resolvers = mergeResolvers(modules);

module.exports = makeExecutableSchema({ typeDefs, resolvers });
