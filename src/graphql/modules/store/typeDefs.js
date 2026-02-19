// store/typeDefs.js
const { gql } = require("apollo-server");

module.exports = gql`
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

  type OrderItem {
    id: ID!
    productId: Product!
    quantity: Int!
    quantityPickedUp: Int!
    status: String!
    pickedUpAt: String
  }

  type Order {
    id: ID!
    userId: User!
    products: [OrderItem!]!
    orderDate: String
    fulfillmentDate: String
    isCompleted: Boolean
  }

  input InputOrderProduct {
    productId: ID!
    quantity: Int!
  }

  # Reportes
  type DaySummary {
    date: String!
    totalOrders: Int!
    totalItems: Int!
    totalUnits: Int!
    pendingUnits: Int!
    pickedUpUnits: Int!
  }

  type ProductRangeSummary {
    productId: ID!
    name: String!
    totalOrdered: Int!
    totalPickedUp: Int!
    totalPending: Int!
  }

  type DayProductBreakdown {
    date: String!
    products: [ProductDayDetail!]!
  }

  type ProductDayDetail {
    productId: ID!
    name: String!
    totalOrdered: Int!
    totalPickedUp: Int!
    totalPending: Int!
  }

  extend type Query {
    products: [Product!]!
    orders: [Order!]!
    orderByUserId(userId: ID): [Order!]!
    orderById(id: ID!): Order

    # Reportes
    reportDailySummary(startDate: String!, endDate: String!): [DaySummary!]!
    reportProductRange(
      startDate: String!
      endDate: String!
    ): [ProductRangeSummary!]!
    reportDayBreakdown(
      startDate: String!
      endDate: String!
    ): [DayProductBreakdown!]!
  }

  extend type Mutation {
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

    createOrder(
      userId: ID!
      products: [InputOrderProduct!]!
      fulfillmentDate: String
    ): Order

    completeOrder(orderId: ID!): Order

    recordPickup(
      orderId: ID!
      itemId: ID!
      quantityPickedUp: Int!
      pickedUpAt: String
    ): Order
  }
`;
