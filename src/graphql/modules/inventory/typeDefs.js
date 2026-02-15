const { gql } = require("apollo-server");

module.exports = gql`
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

  extend type Query {
    getInventory(id: ID!): Inventory
    getInventories: [Inventory]

    # backward-compatible (en el schema original no había args)
    getInventoryByUser(userId: ID): [Inventory]
  }

  extend type Mutation {
    newInventory(input: InventoryInput): Inventory
    updateInventory(id: ID!, input: InventoryInput): Inventory
    deleteInventory(id: ID!): String
  }
`;
