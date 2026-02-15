const { gql } = require("apollo-server");

module.exports = gql`
  type Guatemala {
    id: ID
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [User]
    authorized: Boolean!
  }

  input GuatemalaInput {
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [ID]
    authorized: Boolean
  }

  extend type Query {
    getGuatemala: [Guatemala!]!
  }

  extend type Mutation {
    addGuatemala(input: GuatemalaInput!): Guatemala!
  }
`;
