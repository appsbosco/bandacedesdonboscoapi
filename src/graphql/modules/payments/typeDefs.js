const { gql } = require("apollo-server");

module.exports = gql`
  type PaymentEvent {
    _id: ID!
    name: String
    date: String
    description: String
  }

  input PaymentEventInput {
    name: String
    date: String
    description: String
  }

  type Payment {
    _id: ID!
    user: User
    paymentEvent: PaymentEvent
    amount: Float
    description: String
    date: String
  }

  input PaymentInput {
    user: ID
    paymentEvent: ID
    description: String
    amount: Float
    date: String
  }

  extend type Query {
    getPaymentEvents: [PaymentEvent!]!
    getPaymentsByEvent(paymentEvent: ID!): [Payment!]!
  }

  extend type Mutation {
    createPaymentEvent(input: PaymentEventInput!): PaymentEvent!
    createPayment(input: PaymentInput!): Payment!
    updatePayment(paymentId: ID!, input: PaymentInput!): Payment!
    deletePayment(paymentId: ID!): Payment!
  }
`;
