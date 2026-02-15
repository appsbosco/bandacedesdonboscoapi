const { gql } = require("apollo-server");

module.exports = gql`
  type Parent {
    id: ID
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    phone: String
    role: String
    avatar: String
    children: [User]
    notificationTokens: [String]
  }

  input ParentInput {
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    phone: String
    role: String
    avatar: String
    children: [ID]
  }

  extend type Query {
    getParent: Parent
    getParents: [Parent]
  }

  extend type Mutation {
    newParent(input: ParentInput): Parent
  }
`;
