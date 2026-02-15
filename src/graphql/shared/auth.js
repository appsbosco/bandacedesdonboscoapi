const { ApolloError } = require("apollo-server-express");

function requireAuth(context) {
  if (!context.user) {
    throw new ApolloError("No autenticado", "UNAUTHENTICATED");
  }
  return context.user;
}

function getUserId(user) {
  return user._id || user.id;
}

module.exports = { requireAuth, getUserId };
