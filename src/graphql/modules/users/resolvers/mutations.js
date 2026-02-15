/**
 * users - Mutations
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

const userService = require("../services/user.service");

module.exports = {
  newUser: async (_, { input }, ctx) => userService.newUser(input, ctx),

  uploadProfilePic: async (_, { id, avatar }) =>
    userService.uploadProfilePic(id, avatar),

  authUser: async (_, { input }, ctx) => userService.authUser(input, ctx),

  updateUser: async (_, { id, input }, ctx) =>
    userService.updateUser(id, input, ctx),

  deleteUser: async (_, { id }, ctx) => userService.deleteUser(id, ctx),

  requestReset: async (_, { email }) => userService.requestReset(email),

  resetPassword: async (_, { token, newPassword }) =>
    userService.resetPassword(token, newPassword),

  updateNotificationToken: async (_, { userId, token }) =>
    userService.updateNotificationToken(userId, token),

  upgradeUserGrades: async () => userService.upgradeUserGrades(),

  updateUserState: async () => userService.updateUserState(),
};
