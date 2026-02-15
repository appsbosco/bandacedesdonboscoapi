// src/graphql/resolvers/index.js
const scalars = require("./scalars");

/**
 * Merge global de resolvers:
 * - Combina Query/Mutation
 * - Combina resolvers de tipos
 * - Revienta si hay nombres duplicados
 */
function mergeResolvers(mods) {
  const out = { ...scalars, Query: {}, Mutation: {} };

  for (const { name: moduleName, resolvers } of mods) {
    if (!resolvers || typeof resolvers !== "object") continue;

    for (const rootType of ["Query", "Mutation"]) {
      if (!resolvers[rootType]) continue;

      for (const fieldName of Object.keys(resolvers[rootType])) {
        if (out[rootType][fieldName]) {
          throw new Error(
            `[GraphQL merge] Conflicto en ${rootType}.${fieldName} (módulo: ${moduleName})`,
          );
        }
        out[rootType][fieldName] = resolvers[rootType][fieldName];
      }
    }

    for (const typeName of Object.keys(resolvers)) {
      if (typeName === "Query" || typeName === "Mutation") continue;

      const typeResolvers = resolvers[typeName];
      if (!typeResolvers || typeof typeResolvers !== "object") continue;

      if (!out[typeName]) out[typeName] = {};

      for (const fieldName of Object.keys(typeResolvers)) {
        if (out[typeName][fieldName]) {
          throw new Error(
            `[GraphQL merge] Conflicto en ${typeName}.${fieldName} (módulo: ${moduleName})`,
          );
        }
        out[typeName][fieldName] = typeResolvers[fieldName];
      }
    }
  }

  return out;
}

module.exports = mergeResolvers;
