const { gql } = require("apollo-server");

module.exports = gql`
  enum InventoryStatus {
    ON_TIME
    DUE_SOON
    OVERDUE
    NOT_APPLICABLE
  }

  enum InventoryOwnership {
    PERSONAL
    INSTITUTIONAL
    BORROWED
  }

  enum MaintenanceType {
    PREVENTIVE
    CORRECTIVE
    TUNING
    CLEANING
    OTHER
  }

  # ── Core inventory record ──────────────────────────────────────────────────
  type Inventory {
    id: ID
    user: User
    # legacy fields
    brand: String
    model: String
    numberId: String
    serie: String
    condition: String
    mainteinance: String
    details: String
    # phase-1 additions
    instrumentType: String
    ownership: InventoryOwnership
    hasInstrument: Boolean
    lastMaintenanceAt: String
    nextMaintenanceDueAt: String
    maintenanceIntervalDays: Int
    createdAt: String
    updatedAt: String
    # computed
    status: InventoryStatus
  }

  # ── Maintenance record ─────────────────────────────────────────────────────
  type InventoryMaintenance {
    id: ID!
    inventory: ID!
    performedAt: String!
    type: MaintenanceType!
    notes: String
    performedBy: String
    cost: Float
    createdAt: String
  }

  # ── Facets for filter sidebar ──────────────────────────────────────────────
  type InventoryFacetValue {
    value: String!
    count: Int!
  }

  type InventoryFacets {
    byStatus:      [InventoryFacetValue!]!
    byOwnership:   [InventoryFacetValue!]!
    byInstrument:  [InventoryFacetValue!]!
  }

  type InventoryStatsSummary {
    total: Int!
    onTime: Int!
    dueSoon: Int!
    overdue: Int!
    notApplicable: Int!
  }

  # ── Paginated result ───────────────────────────────────────────────────────
  type InventoriesPaginatedResult {
    items: [Inventory!]!
    total: Int!
    page: Int!
    limit: Int!
    facets: InventoryFacets!
  }

  # ── Inputs ─────────────────────────────────────────────────────────────────
  input InventoryInput {
    brand: String
    model: String
    numberId: String
    serie: String
    condition: String
    mainteinance: String
    details: String
    # phase-1
    instrumentType: String
    ownership: InventoryOwnership
    hasInstrument: Boolean
    lastMaintenanceAt: String
    nextMaintenanceDueAt: String
    maintenanceIntervalDays: Int
  }

  input InventoryFilterInput {
    searchText: String
    ownership:  InventoryOwnership
    status:     InventoryStatus
    userId:     ID
  }

  input AddMaintenanceInput {
    performedAt:  String!
    type:         MaintenanceType
    notes:        String
    performedBy:  String
    cost:         Float
  }

  # ── Queries ────────────────────────────────────────────────────────────────
  extend type Query {
    getInventory(id: ID!): Inventory
    getInventories: [Inventory]
    getInventoryByUser(userId: ID): [Inventory]

    # paginated — primary query for the new inventory page
    inventoriesPaginated(filter: InventoryFilterInput, pagination: PaginationInput): InventoriesPaginatedResult!

    # stats summary for header cards
    inventoryStats: InventoryStatsSummary!

    # maintenance history for a single record
    inventoryMaintenanceHistory(inventoryId: ID!): [InventoryMaintenance!]!
  }

  # ── Mutations ──────────────────────────────────────────────────────────────
  extend type Mutation {
    newInventory(input: InventoryInput): Inventory
    updateInventory(id: ID!, input: InventoryInput): Inventory
    deleteInventory(id: ID!): String

    addMaintenanceRecord(inventoryId: ID!, input: AddMaintenanceInput!): InventoryMaintenance!
    deleteMaintenanceRecord(id: ID!): String
  }
`;
