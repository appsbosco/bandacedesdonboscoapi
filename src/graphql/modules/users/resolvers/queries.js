/**
 * users - Queries
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

const userService = require("../services/user.service");

module.exports = {
  getUser: async (_, __, ctx) => userService.getUser(ctx),

  getUsers: async () => userService.getUsers(),

  usersWithoutMedicalRecord: async () =>
    userService.usersWithoutMedicalRecord(),

  usersWithoutAvatar: async () => userService.usersWithoutAvatar(),

  usersWithoutNotificationTokens: async () =>
    userService.usersWithoutNotificationTokens(),

  usersWithStatus: async () => userService.usersWithStatus(),

  usersWithMissingData: async () => userService.usersWithMissingData(),

  getInstructorStudents: async (_, __, ctx) =>
    userService.getInstructorStudents(ctx),

  getUsersByInstrument: async (_, __, ctx) =>
    userService.getUsersByInstrument(ctx),
};
