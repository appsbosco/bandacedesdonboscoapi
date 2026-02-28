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

  type AttendanceSummary {
    studentId: ID!
    total: Int!
    present: Int!
    justifiedAbsence: Int!
    unjustifiedAbsence: Int!
    attendanceRate: String!
    records: [AttendanceClass!]!
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
    getStudentsWithoutInstructor: [User!]!
    getStudentAttendanceSummary(studentId: ID!): AttendanceSummary!
  }

  extend type Mutation {
    assignStudentToInstructor(studentId: ID!): Boolean!
    removeStudentFromInstructor(studentId: ID!): Boolean!
    deleteStudent(studentId: ID!): Boolean!
    markAttendanceAndPayment(input: AttendanceClassInput!): AttendanceClass!
  }
`;
