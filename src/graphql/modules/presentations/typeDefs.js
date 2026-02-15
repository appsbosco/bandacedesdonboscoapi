const { gql } = require("apollo-server");

module.exports = gql`
  type PerformanceAttendance {
    id: ID
    user: User
    event: Event
    attended: String
    busNumber: Int
    hotel: Hotel
  }

  input PerformanceAttendanceInput {
    user: ID
    event: ID
    attended: String
    busNumber: Int
    hotel: ID
  }

  type Hotel {
    id: ID
    name: String
  }

  input HotelInput {
    name: String
  }

  extend type Query {
    getPerformanceAttendanceByEvent(event: ID!): [PerformanceAttendance]
    getHotel(id: ID!): Hotel
    getHotels: [Hotel]
  }

  extend type Mutation {
    newPerformanceAttendance(
      input: PerformanceAttendanceInput
    ): PerformanceAttendance
    updatePerformanceAttendance(
      id: ID!
      input: PerformanceAttendanceInput
    ): PerformanceAttendance
    deletePerformanceAttendance(id: ID!): String

    newHotel(input: HotelInput): Hotel
    updateHotel(id: ID!, input: HotelInput): Hotel
    deleteHotel(id: ID!): String
  }
`;
