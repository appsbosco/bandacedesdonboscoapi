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
    bands: [String]
    attendance: [Attendance]
    medicalRecord: [MedicalRecord]
    inventory: [Inventory]
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
    bands: [String]
  }

  type Parent {
    id: ID
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    phone: String
    role: String
    avatar: String
    children: [User]
  }

  input ParentInput {
    name: String
    firstSurName: String
    secondSurName: String
    email: String
    password: String
    phone: String
    role: String
    avatar: String
    children: [ID]
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
    allergies: String
    user: User
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
    allergies: String
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

  type Exalumno {
    id: ID!
    fullName: String!
    phoneNumber: String!
    identification: String!
    instrument: String!
    yearGraduated: Int!
    email: String!
    address: String!
    instrumentCondition: String!
  }

  input ExalumnoInput {
    fullName: String!
    phoneNumber: String!
    identification: String!
    instrument: String!
    yearGraduated: Int!
    email: String!
    address: String!
    instrumentCondition: String!
  }

  #################################################

  # Queries

  type Query {
    # Users
    getUser: User
    getUsers: [User]

    getParent: Parent
    getParents: [Parent]

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

    getExAlumnos: [Exalumno!]!
  }

  #################################################

  # Mutations

  type Mutation {
    # Users
    newUser(input: UserInput): User
    newParent(input: ParentInput): Parent

    authUser(input: AuthInput): Token
    updateUser(id: ID!, input: UserInput): User
    deleteUser(id: ID!): String
    # Request a password reset.
    requestReset(email: String!): Boolean!

    # Reset the password using a token.
    resetPassword(token: String!, newPassword: String!): Boolean!

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

    addExAlumno(input: ExalumnoInput!): Exalumno!
  }
`;

module.exports = typeDefs;
