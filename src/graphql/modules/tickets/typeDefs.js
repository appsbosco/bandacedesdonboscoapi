"use strict";

const { gql } = require("apollo-server");

module.exports = gql`
  # ===========================================================================
  # ENUMS
  # ===========================================================================

  enum TicketType {
    assigned
    purchased
    courtesy
    extra
  }

  enum TicketStatus {
    pending_payment
    paid
    checked_in
    partially_used
    fully_used
    cancelled
  }

  enum ScanResult {
    ok
    duplicate
    unpaid
    invalid
    blocked
  }

  # ===========================================================================
  # INPUTS
  # ===========================================================================

  input EmailInput {
    to: String!
    subject: String!
    text: String
    html: String!
  }

  # Asignación a un único usuario registrado
  input TicketInput {
    userId: ID!
    eventId: ID!
    type: TicketType!
    ticketQuantity: Int!
  }

  # Un destinatario en una asignación masiva.
  # userId es opcional — si se omite, name y email son requeridos.
  input BulkRecipient {
    userId: ID
    name: String
    email: String
    quantity: Int
  }

  # Asignación masiva mixta (usuarios registrados + externos)
  input AssignBulkInput {
    eventId: ID!
    type: TicketType!
    recipients: [BulkRecipient!]!
  }

  input TicketExcelImportInput {
    eventId: ID!
    fileBase64: String!
    filename: String
    sheetName: String
  }

  input ImportedTicketManualInput {
    eventId: ID!
    buyerName: String!
    buyerEmail: String!
    ticketQuantity: Int!
    paymentStatus: String!
  }

  # ===========================================================================
  # TIPOS — TICKET
  # ===========================================================================

  type ScanLogEntry {
    scannedAt: String!
    scannedBy: User
    location: String
    result: ScanResult!
    note: String
  }

  type Ticket {
    id: ID!
    userId: User
    eventId: ID!
    type: TicketType!
    source: String
    importKey: String
    status: TicketStatus!
    paid: Boolean!
    amountPaid: Float!
    ticketQuantity: Int!
    scans: Int!
    qrCode: String
    buyerName: String
    buyerEmail: String
    externalTicketNumbers: [String]
    paymentEmailSentAt: String
    paymentEmailSentForQuantity: Int
    raffleNumbers: [String]
    scanLog: [ScanLogEntry]
    notes: String
    cancelledAt: String
    cancelledBy: User
    createdAt: String
    updatedAt: String
  }

  # ===========================================================================
  # TIPOS — EVENTO
  # ===========================================================================

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

  type EventStats {
    eventId: ID!
    eventName: String!
    capacity: Int!
    totalIssued: Int!
    totalPaid: Int!
    totalCollected: Float!
    totalPending: Int!
    totalCheckedIn: Int!
    totalPartially: Int!
    totalUsed: Int!
    totalCancelled: Int!
    remaining: Int!
  }

  # ===========================================================================
  # TIPOS — RESULTADOS ESPECIALES
  # ===========================================================================

  # Resultado del escaneo QR — devuelve el estado completo para el operador
  type ValidationResult {
    result: ScanResult!
    canEnter: Boolean!
    message: String!
    ticket: Ticket
    totalDue: Float!
    balanceDue: Float!
    canMarkPaid: Boolean!
  }

  # Resultado de asignación masiva — informa éxitos y fallos individualmente
  type BulkAssignResult {
    succeeded: [Ticket!]!
    failed: [String!]!
    total: Int!
  }

  type TicketExcelImportResult {
    totalRows: Int!
    groupedRecipients: Int!
    createdTickets: Int!
    updatedTickets: Int!
    emailsSent: Int!
    fullyPaidRecipients: Int!
    partialRecipients: Int!
    pendingRecipients: Int!
    invalidRows: Int!
    failedRows: [String!]!
  }

  type RaffleNumberInfo {
    number: String!
    buyerName: String
    buyerEmail: String
    userId: User
    paid: Boolean
  }

  # ===========================================================================
  # QUERIES
  # ===========================================================================

  extend type Query {
    # Lista tickets, opcionalmente filtrados por evento y/o status
    getTickets(eventId: ID, status: TicketStatus): [Ticket!]!
    getMyTickets: [Ticket!]!

    # Números de rifa de un evento con su titular
    getTicketsNumbers(eventId: ID): [RaffleNumberInfo]!

    # Lista todos los eventos
    getEventsT: [EventTicket]

    # Estadísticas en tiempo real de un evento (para panel de escaneo)
    getEventStats(eventId: ID!): EventStats!

    # Búsqueda de tickets por nombre, email o número de rifa
    searchTickets(eventId: ID!, query: String!): [Ticket!]!
  }

  # ===========================================================================
  # MUTATIONS
  # ===========================================================================

  extend type Mutation {
    # ---- Email ---------------------------------------------------------------
    sendEmail(input: EmailInput!): Boolean

    # ---- Eventos -------------------------------------------------------------
    createEvent(
      name: String!
      date: String!
      description: String!
      ticketLimit: Int!
      raffleEnabled: Boolean!
      price: Float!
    ): EventTicket!

    # ---- Emisión de tickets --------------------------------------------------

    # Asigna tickets a un único usuario registrado
    assignTickets(input: TicketInput!): Ticket

    # Asignación masiva: múltiples destinatarios, registrados o no
    assignTicketsBulk(input: AssignBulkInput!): BulkAssignResult!

    # Registra una compra externa (persona sin cuenta)
    purchaseTicket(
      eventId: ID!
      buyerName: String!
      buyerEmail: String!
      ticketQuantity: Int!
    ): Ticket

    # Emite una entrada de cortesía (paid = true desde creación)
    sendCourtesyTicket(
      eventId: ID!
      buyerName: String!
      buyerEmail: String!
      ticketQuantity: Int!
    ): Ticket!

    importTicketsFromExcel(input: TicketExcelImportInput!): TicketExcelImportResult!
    addImportedTicketRecipient(input: ImportedTicketManualInput!): Ticket!
    resendImportedTicketEmail(ticketId: ID!): Boolean!

    # ---- Pago ----------------------------------------------------------------

    # Registra un abono y recalcula paid + status
    updatePaymentStatus(ticketId: ID!, amountPaid: Float!): Ticket
    settleTicketPayment(ticketId: ID!): Ticket

    # ---- Escaneo QR ----------------------------------------------------------

    # Valida un QR y registra el ingreso. Devuelve resultado detallado.
    # forceEntry: override de admin para entradas con deuda (requiere rol)
    validateTicket(
      qrPayload: String!
      location: String
      scannedBy: ID
      forceEntry: Boolean
    ): ValidationResult!

    # ---- Gestión administrativa ----------------------------------------------

    # Cancela un ticket. Irreversible.
    cancelTicket(ticketId: ID!, reason: String, cancelledBy: ID): Ticket!
    deleteTicket(ticketId: ID!): Boolean!
  }
`;
