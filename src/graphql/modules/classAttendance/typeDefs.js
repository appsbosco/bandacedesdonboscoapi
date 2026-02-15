const { gql } = require("apollo-server");

module.exports = gql`
  type AttendanceClass {
    id: ID!
    student: User!
    instructor: User!
    date: String!
    attendanceStatus: String!
    justification: String
    paymentStatus: String!
  }

  input AttendanceClassInput {
    studentId: ID!
    date: String!
    attendanceStatus: String!
    justification: String
    paymentStatus: String!
  }

  extend type Query {
    getInstructorStudentsAttendance(date: String!): [AttendanceClass]
    getAllAttendances: [AttendanceClass!]!
  }

  extend type Mutation {
    assignStudentToInstructor(studentId: ID!): Boolean!
    markAttendanceAndPayment(input: AttendanceClassInput!): AttendanceClass!
  }
`;
