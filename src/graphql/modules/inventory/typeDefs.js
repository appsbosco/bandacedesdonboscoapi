const { gql } = require("apollo-server");

module.exports = gql`
  enum InventoryStatus {
    ON_TIME
    DUE_SOON
    OVERDUE
    NOT_APPLICABLE
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
    # legacy fields (do NOT rename)
    brand: String
    model: String
    numberId: String
    serie: String
    condition: String      # tenencia — this IS the ownership concept
    mainteinance: String   # legacy free-text notes
    details: String
    # phase-1 additions
    instrumentType: String
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

  # ── Facets ─────────────────────────────────────────────────────────────────
  type InventoryFacetValue {
    value: String!
    count: Int!
  }

  type InventoryFacets {
    byStatus:    [InventoryFacetValue!]!
    byCondition: [InventoryFacetValue!]!   # tenencia — grouped by condition field
    byInstrument: [InventoryFacetValue!]!
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

  # ── Admin cleanup ──────────────────────────────────────────────────────────
  type AdminCleanupInventoriesResult {
    count: Int!
    deleted: Int!
    dryRun: Boolean!
    message: String!
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
    instrumentType: String
    hasInstrument: Boolean
    lastMaintenanceAt: String
    nextMaintenanceDueAt: String
    maintenanceIntervalDays: Int
  }

  input InventoryFilterInput {
    searchText: String
    condition:  String          # tenencia filter — maps to Inventory.condition
    status:     InventoryStatus
    userId:     ID
  }

  input AddMaintenanceInput {
    performedAt: String!
    type:        MaintenanceType
    notes:       String
    performedBy: String
    cost:        Float
  }

  # ── Queries ────────────────────────────────────────────────────────────────
  extend type Query {
    getInventory(id: ID!): Inventory
    getInventories: [Inventory]
    getInventoryByUser(userId: ID): [Inventory]

    inventoriesPaginated(filter: InventoryFilterInput, pagination: PaginationInput): InventoriesPaginatedResult!
    inventoryStats: InventoryStatsSummary!
    inventoryMaintenanceHistory(inventoryId: ID!): [InventoryMaintenance!]!
  }

  # ── Mutations ──────────────────────────────────────────────────────────────
  extend type Mutation {
    newInventory(input: InventoryInput): Inventory
    updateInventory(id: ID!, input: InventoryInput): Inventory
    deleteInventory(id: ID!): String

    # Assignment
    assignInventoryToUser(inventoryId: ID!, userId: ID!): Inventory!
    unassignInventory(inventoryId: ID!): String

    # Maintenance
    addMaintenanceRecord(inventoryId: ID!, input: AddMaintenanceInput!): InventoryMaintenance!
    deleteMaintenanceRecord(id: ID!): String

    # Admin cleanup (removes inventory records where user is null)
    adminCleanupInventories(dryRun: Boolean): AdminCleanupInventoriesResult!
  }
`;
