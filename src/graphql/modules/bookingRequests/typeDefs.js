const { gql } = require("apollo-server");

module.exports = gql`
  enum BookingRequestEnsemble {
    BANDAS_DE_CONCIERTO
    BIG_BAND
    BANDA_DE_MARCHA
    CIMARRONA
  }

  enum BookingRequestStatus {
    NEW
    IN_REVIEW
    CONTACTED
    QUOTED
    CLOSED
  }

  enum BookingRequestEventType {
    CONCERT
    FESTIVAL
    PARADE
    WEDDING
    CORPORATE
    INSTITUTIONAL
    COMMUNITY
    PRIVATE
    PROTOCOL
    OTHER
  }

  enum BookingBudgetCurrency {
    CRC
    USD
  }

  input BookingRequestInput {
    ensemble: BookingRequestEnsemble!
    fullName: String!
    company: String
    email: String!
    phone: String!
    eventType: BookingRequestEventType!
    eventTypeOther: String
    eventDate: String!
    eventTime: String!
    venue: String!
    province: String!
    canton: String!
    district: String!
    address: String!
    estimatedDuration: String!
    expectedAudience: Int
    estimatedBudget: Float
    budgetCurrency: BookingBudgetCurrency
    message: String!
    acceptedDataPolicy: Boolean!
  }

  input BookingRequestFilterInput {
    ensemble: BookingRequestEnsemble
    status: BookingRequestStatus
    dateFrom: String
    dateTo: String
    searchText: String
  }

  input UpdateBookingRequestStatusInput {
    status: BookingRequestStatus!
    statusNotes: String
  }

  type BookingRequest {
    id: ID!
    ensemble: BookingRequestEnsemble!
    fullName: String!
    company: String
    email: String!
    phone: String!
    eventType: BookingRequestEventType!
    eventTypeOther: String
    eventDate: String!
    eventTime: String!
    venue: String!
    province: String!
    canton: String!
    district: String!
    address: String!
    estimatedDuration: String!
    expectedAudience: Int
    estimatedBudget: Float
    budgetCurrency: BookingBudgetCurrency
    message: String!
    acceptedDataPolicy: Boolean!
    status: BookingRequestStatus!
    statusNotes: String
    notificationEmailSentAt: String
    confirmationEmailSentAt: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    getBookingRequests(filter: BookingRequestFilterInput): [BookingRequest!]!
    getBookingRequest(id: ID!): BookingRequest
  }

  extend type Mutation {
    createBookingRequest(input: BookingRequestInput!): BookingRequest!
    updateBookingRequestStatus(
      id: ID!
      input: UpdateBookingRequestStatusInput!
    ): BookingRequest!
  }
`;
