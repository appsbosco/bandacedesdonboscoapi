const { gql } = require("apollo-server");

//Schema
const typeDefs = gql`
  #################################################
  # Types and inputs

  # User

  type User {
    id: ID
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    birthday: String
    carnet: String
    state: String
    grade: String
    phone: String
    role: String
    instrument: String
    avatar: String
  }

  input UserInput {
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    birthday: String
    carnet: String
    state: String
    grade: String
    phone: String
    role: String
    instrument: String
    avatar: String
  }

  input AuthInput {
    email: String!
    password: String!
  }

  # Attendance
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

  # Medical Record

  type MedicalRecord {
    id: ID
    identification: String
    sex: String
    bloodType: String
    address: String
    familyMemberName: String
    familyMemberNumber: String
    familyMemberNumberId: String
    familyMemberRelationship: String
    familyMemberOccupation: String
    illness: String
    medicine: String
    medicineOnTour: String
    user: ID
  }

  input MedicalRecordInput {
    identification: String
    sex: String
    bloodType: String
    address: String
    familyMemberName: String
    familyMemberNumber: String
    familyMemberNumberId: String
    familyMemberRelationship: String
    familyMemberOccupation: String
    illness: String
    medicine: String
    medicineOnTour: String
  }

  # Inventory

  type Inventory {
    id: ID
    condition: String
    brand: String
    model: String
    numberId: String
    serie: String
    mainteinance: String
    details: String
    user: User
  }

  input InventoryInput {
    brand: String
    model: String
    numberId: String
    serie: String
    condition: String
    mainteinance: String
    details: String
  }

  # Token
  type Token {
    token: String
  }

  # Events

  type Event {
    id: ID
    title: String
    place: String
    date: String
    time: String
    arrival: String
    departure: String
    description: String
  }

  input EventInput {
    place: String!
    date: String!
    title: String
    time: String
    arrival: String
    departure: String
    description: String
  }

  input EmailInput {
    to: String!
    subject: String!
    text: String
    html: String!
  }

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
  #################################################

  # Queries

  type Query {
    # Users
    getUser: User
    getUsers: [User]

    # Attendance
    getAttendance(id: ID!): Attendance
    getAttendanceByUser: [Attendance]
    getAllAttendance: [Attendance]

    # Medical Record
    getMedicalRecord(id: ID!): MedicalRecord
    getMedicalRecords: [MedicalRecord]
    getMedicalRecordByUser: [MedicalRecord]

    # Inventory
    getInventory(id: ID!): Inventory
    getInventories: [Inventory]
    getInventoryByUser: [Inventory]

    # Events
    getEvent(id: ID!): Event
    getEvents: [Event]

    # Payments
    getPaymentEvents: [PaymentEvent!]!
    getPaymentsByEvent(paymentEvent: ID!): [Payment!]!
  }

  #################################################

  # Mutations

  type Mutation {
    # Users
    newUser(input: UserInput): User
    authUser(input: AuthInput): Token
    updateUser(id: ID!, input: UserInput): User
    deleteUser(id: ID!): String

    uploadProfilePic(id: ID!, avatar: String!): User!

    # Attendance
    newAttendance(input: AttendanceInput): Attendance
    updateAttendance(id: ID!, input: AttendanceInput): Attendance
    deleteAttendance(id: ID!): String

    # Medical Record
    newMedicalRecord(input: MedicalRecordInput): MedicalRecord
    updateMedicalRecord(id: ID!, input: MedicalRecordInput): MedicalRecord
    deleteMedicalRecord(id: ID!): String

    # Inventory
    newInventory(input: InventoryInput): Inventory
    updateInventory(id: ID!, input: InventoryInput): Inventory
    deleteInventory(id: ID!): String

    # Events
    newEvent(input: EventInput): Event
    updateEvent(id: ID!, input: EventInput): Event
    deleteEvent(id: ID!): String

    # Email
    sendEmail(input: EmailInput!): Boolean

    # Payments
    createPaymentEvent(input: PaymentEventInput!): PaymentEvent!
    createPayment(input: PaymentInput!): Payment!
    updatePayment(paymentId: ID!, input: PaymentInput!): Payment!
    deletePayment(paymentId: ID!): Payment!
  }
`;

module.exports = typeDefs;
