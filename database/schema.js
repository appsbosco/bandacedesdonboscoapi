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
    notificationTokens: [String]
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
    notificationTokens: [String]
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
  #Asistencia a presentaciones

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

  #################################################
  #Exalumnos
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
  #Guatemala
  type Guatemala {
    id: ID
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [User]
    authorized: Boolean!
  }

  input GuatemalaInput {
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [ID]
    authorized: Boolean
  }

  #Apoyo
  type Apoyo {
    id: ID
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [User]
    availability: String
  }

  input ApoyoInput {
    fullName: String
    phoneNumber: String
    identification: String
    instrument: String
    email: String
    comments: String
    children: [ID]
    availability: String
  }

  type ColorGuardCampRegistration {
    id: ID!
    teamName: String!
    instructorName: String!
    phoneNumber: String!
    email: String!
    participantQuantity: Int!
  }

  input ColorGuardCampRegistrationInput {
    teamName: String!
    instructorName: String!
    phoneNumber: String!
    email: String!
    participantQuantity: Int!
  }

  #################################################
  ## Almuerzos
  type Product {
    id: ID!
    name: String!
    description: String
    category: String
    price: Float!
    availableForDays: String!
    photo: String
    closingDate: String
    createdAt: String
  }

  type Order {
    id: ID!
    userId: User!
    products: [OrderProduct!]!
    orderDate: String
    isCompleted: Boolean
  }

  type OrderProduct {
    productId: Product!
    quantity: Int!
  }

  input InputOrderProduct {
    productId: ID!
    quantity: Int!
  }

  #################################################
  ############# TICKET #################

  #################################################

  type Ticket {
    id: ID!
    userId: ID
    eventId: ID!
    type: String!
    paid: Boolean!
    amountPaid: Float!
    totalAmount: Float!
    qrCode: String
    scanned: Boolean!
    buyerName: String
    buyerEmail: String
  }

  type EventTicket {
    id: ID!
    name: String!
    date: String!
    description: String!
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

    # Presentations
    getPerformanceAttendanceByEvent(event: ID!): [PerformanceAttendance]
    getHotel(id: ID!): Hotel
    getHotels: [Hotel]

    # Exalumnos
    getExAlumnos: [Exalumno!]!
    getGuatemala: [Guatemala!]!
    getApoyo: [Apoyo!]!

    # Color Guard
    getColorGuardCampRegistrations: [ColorGuardCampRegistration!]!

    # Almuerzos
    products: [Product!]!
    orders: [Order!]!
    orderByUserId(userId: ID): [Order!]!
    orderById(id: ID!): Order

    # Tickets
    getTickets(eventId: ID!): [Ticket]
    getEventsT: [Event]
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

    addGuatemala(input: GuatemalaInput!): Guatemala!
    addApoyo(input: ApoyoInput!): Apoyo!

    createColorGuardCampRegistration(
      input: ColorGuardCampRegistrationInput!
    ): ColorGuardCampRegistration!

    # Presentations
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

    ##Almuerzos

    createProduct(
      name: String!
      description: String
      category: String
      price: Float!
      availableForDays: String!
      photo: String
      closingDate: String!
    ): Product
    updateProduct(
      id: ID!
      name: String
      description: String
      category: String
      price: Float
      availableForDays: String
      photo: String
      closingDate: String
    ): Product
    deleteProduct(id: ID!): Product
    createOrder(userId: ID!, products: [InputOrderProduct!]!): Order
    completeOrder(orderId: ID!): Order

    upgradeUserGrades: Boolean!

    updateNotificationToken(userId: ID!, token: String!): User

    # Tickets
    createEvent(name: String!, date: String!, description: String!): EventTicket
    assignTickets(
      userId: ID!
      eventId: ID!
      type: String!
      totalAmount: Float!
    ): Ticket

    purchaseTicket(
      eventId: ID!
      buyerName: String!
      buyerEmail: String!
      totalAmount: Float!
    ): Ticket
    updatePaymentStatus(ticketId: ID!, amountPaid: Float!): Ticket
    validateTicket(qrCode: String!): Ticket
  }
`;

module.exports = typeDefs;
