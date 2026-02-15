const { gql } = require("apollo-server");

module.exports = gql`
  type Attendance {
    id: ID
    user: User
    date: String
    attended: String!
  }

  input AttendanceInput {
    user: ID!
    date: String!
    attended: String!
  }

  extend type Query {
    getAttendance(id: ID!): Attendance

    getAttendanceByUser(userId: ID): [Attendance]

    getAllAttendance: [Attendance]
  }

  extend type Mutation {
    newAttendance(input: AttendanceInput): Attendance
    updateAttendance(id: ID!, input: AttendanceInput): Attendance
    deleteAttendance(id: ID!): String
  }
`;
