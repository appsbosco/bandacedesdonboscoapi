const { gql } = require("apollo-server");

module.exports = gql`
  type ColorGuardCampRegistration {
    id: ID!
    teamName: String!
    instructorName: String!
    phoneNumber: String!
    email: String!
    participantQuantity: Int!
  }

  input ColorGuardCampRegistrationInput {
    teamName: String!
    instructorName: String!
    phoneNumber: String!
    email: String!
    participantQuantity: Int!
  }

  extend type Query {
    getColorGuardCampRegistrations: [ColorGuardCampRegistration!]!
  }

  extend type Mutation {
    createColorGuardCampRegistration(
      input: ColorGuardCampRegistrationInput!
    ): ColorGuardCampRegistration!
  }
`;
