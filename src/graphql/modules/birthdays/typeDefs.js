const { gql } = require("apollo-server");

module.exports = gql`
  type BirthdayPerson {
    id: ID!
    name: String!
    firstSurName: String
    secondSurName: String
    fullName: String!
    birthday: String!
    instrument: String
    avatar: String
    role: String
    ageTurning: Int
    birthdayMonth: Int!
    birthdayDay: Int!
    isToday: Boolean!
  }

  type BirthdayCalendarEvent {
    id: ID!
    title: String!
    start: String!
    end: String!
    allDay: Boolean!
    type: String!
    icon: String!
    birthdayUserId: ID!
    birthdayUserName: String!
    instrument: String
    avatar: String
    ageTurning: Int
  }

  extend type Query {
    birthdaysForCalendar(year: Int): [BirthdayCalendarEvent!]!
    todaysBirthdays: [BirthdayPerson!]!
    upcomingBirthdays(days: Int): [BirthdayPerson!]!
  }
`;
