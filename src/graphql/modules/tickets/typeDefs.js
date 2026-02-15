const { gql } = require("apollo-server");

module.exports = gql`
  input EmailInput {
    to: String!
    subject: String!
    text: String
    html: String!
  }

  type Ticket {
    id: ID!
    userId: User
    eventId: ID!
    type: String!
    paid: Boolean!
    amountPaid: Float!
    ticketQuantity: Int!
    qrCode: String
    scanned: Boolean!
    scans: Int!
    buyerName: String
    buyerEmail: String
    raffleNumbers: [String]
  }

  input TicketInput {
    userId: ID!
    eventId: ID!
    type: String!
    ticketQuantity: Int!
  }

  type EventTicket {
    id: ID!
    name: String!
    date: String!
    description: String!
    ticketLimit: Int!
    totalTickets: Int!
    raffleEnabled: Boolean!
    price: Float!
  }

  type RaffleNumberInfo {
    number: String!
    buyerName: String
    buyerEmail: String
    userId: User
    paid: Boolean
  }

  extend type Query {
    getTickets(eventId: ID): [Ticket!]!
    getTicketsNumbers(eventId: ID): [RaffleNumberInfo]!
    getEventsT: [EventTicket]
  }

  extend type Mutation {
    # Email
    sendEmail(input: EmailInput!): Boolean

    # Events (tickets)
    createEvent(
      name: String!
      date: String!
      description: String!
      ticketLimit: Int!
      raffleEnabled: Boolean!
      price: Float!
    ): EventTicket!

    assignTickets(input: TicketInput!): Ticket

    purchaseTicket(
      eventId: ID!
      buyerName: String!
      buyerEmail: String!
      ticketQuantity: Int!
    ): Ticket

    sendCourtesyTicket(
      eventId: ID!
      buyerName: String!
      buyerEmail: String!
      ticketQuantity: Int!
    ): Ticket!

    updatePaymentStatus(ticketId: ID!, amountPaid: Float!): Ticket
    validateTicket(qrCode: String!): Ticket
  }
`;
