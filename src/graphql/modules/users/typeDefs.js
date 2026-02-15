const { gql } = require("apollo-server-express");

module.exports = gql`
  type User {
    id: ID
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    birthday: String
    carnet: String
    state: String
    grade: String
    phone: String
    role: String
    instrument: String
    avatar: String
    bands: [String]
    attendance: [Attendance]
    medicalRecord: [MedicalRecord]
    inventory: [Inventory]
    notificationTokens: [String]
    students: [User]
  }

  input UserInput {
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    birthday: String
    carnet: String
    state: String
    grade: String
    phone: String
    role: String
    instrument: String
    avatar: String
    bands: [String]
  }

  input AuthInput {
    email: String!
    password: String!
  }

  type Token {
    token: String
  }

  type UserStatus {
    user: User
    hasMedicalRecord: Boolean
    hasAvatar: Boolean
    hasNotificationTokens: Boolean
  }

  type UserMissingData {
    name: String
    instrument: String
    missingFields: String
    summary: String
  }

  extend type Query {
    getUser: User
    getUsers: [User]

    getInstructorStudents: [User!]!
    getUsersByInstrument: [User!]!

    usersWithoutMedicalRecord: [User]
    usersWithoutAvatar: [User]
    usersWithoutNotificationTokens: [User]
    usersWithStatus: [UserStatus]
    usersWithMissingData: [UserMissingData]
  }

  extend type Mutation {
    newUser(input: UserInput): User
    authUser(input: AuthInput): Token
    updateUser(id: ID!, input: UserInput): User
    deleteUser(id: ID!): String

    requestReset(email: String!): Boolean!
    resetPassword(token: String!, newPassword: String!): Boolean!

    uploadProfilePic(id: ID!, avatar: String!): User!

    upgradeUserGrades: Boolean!
    updateUserState: Boolean!
    updateNotificationToken(userId: ID!, token: String!): User
  }
`;
