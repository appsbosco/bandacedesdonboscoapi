/**
 * src/graphql/shared/errors.js
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

const { GraphQLError } = require("graphql");

function error(code, message, extraExtensions = {}) {
  return new GraphQLError(message, {
    extensions: {
      code,
      ...extraExtensions,
    },
  });
}

module.exports = { error };
