const { gql } = require("apollo-server");

module.exports = gql`
  type Apoyo {
    id: ID
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [User]
    availability: String
  }

  input ApoyoInput {
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [ID]
    availability: String
  }

  extend type Query {
    getApoyo: [Apoyo!]!
  }

  extend type Mutation {
    addApoyo(input: ApoyoInput!): Apoyo!
  }
`;
