const { gql } = require("apollo-server");

module.exports = gql`
  type Exalumno {
    id: ID!
    fullName: String!
    phoneNumber: String!
    identification: String!
    instrument: String!
    yearGraduated: Int!
    email: String!
    address: String!
    instrumentCondition: String!
  }

  input ExalumnoInput {
    fullName: String!
    phoneNumber: String!
    identification: String!
    instrument: String!
    yearGraduated: Int!
    email: String!
    address: String!
    instrumentCondition: String!
  }

  extend type Query {
    getExAlumnos: [Exalumno!]!
  }

  extend type Mutation {
    addExAlumno(input: ExalumnoInput!): Exalumno!
  }
`;
