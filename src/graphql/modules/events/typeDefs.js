const { gql } = require("apollo-server");

module.exports = gql`
  type Event {
    id: ID
    title: String
    place: String
    date: String
    time: String
    arrival: String
    departure: String
    description: String
    type: String
  }

  input EventInput {
    place: String!
    date: String!
    title: String
    time: String
    arrival: String
    departure: String
    description: String
    type: String
  }

  extend type Query {
    getEvent(id: ID!): Event
    getEvents: [Event]
  }

  extend type Mutation {
    newEvent(input: EventInput): Event
    updateEvent(id: ID!, input: EventInput): Event
    deleteEvent(id: ID!): String
  }
`;
