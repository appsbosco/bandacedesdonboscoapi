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

  extend type Query {
    products: [Product!]!
    orders: [Order!]!
    orderByUserId(userId: ID): [Order!]!
    orderById(id: ID!): Order
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
    createOrder(userId: ID!, products: [InputOrderProduct!]!): Order
    completeOrder(orderId: ID!): Order
  }
`;
