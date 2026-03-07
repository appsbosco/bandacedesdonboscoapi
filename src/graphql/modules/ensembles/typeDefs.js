const { gql } = require("apollo-server-express");

module.exports = gql`
  type Ensemble {
    id: ID!
    key: String!
    name: String!
    category: String!
    isDefault: Boolean!
    isActive: Boolean!
    sortOrder: Int!
    memberCount: Int!
    createdAt: String!
    updatedAt: String!
  }

  """ Counts for the two ensemble tabs — always eligible roles only. """
  type EnsembleCounts {
    membersTotal: Int!
    availableTotal: Int!
  }

  """ Instrument distribution for eligible members of an ensemble. """
  type InstrumentStat {
    instrument: String!
    count: Int!
  }

  type BulkEnsembleResult {
    updatedCount: Int!
    skippedCount: Int!
    errors: [BulkEnsembleError!]!
  }

  type BulkEnsembleError {
    userId: ID!
    reason: String!
  }

  input UsersFilterInput {
    searchText: String
    state: String
    role: String
    """ Multi-role OR filter — matches users with any of the given roles """
    roles: [String!]
    instrument: String
    grade: String
    """ OR filter: users in ANY of these ensemble keys """
    ensembleKeys: [String!]
    """ AND filter: users in ALL of these ensemble keys """
    ensembleAllOf: [String!]
  }

  input PaginationInput {
    page: Int
    limit: Int
    sortBy: String
    sortDir: String
  }

  type UsersPage {
    items: [User!]!
    total: Int!
    page: Int!
    limit: Int!
    facets: UsersFacets!
  }

  type UsersFacets {
    byState: [FacetBucket!]!
    byRole: [FacetBucket!]!
    byInstrument: [FacetBucket!]!
    byEnsemble: [FacetBucket!]!
  }

  type FacetBucket {
    value: String!
    count: Int!
  }

  extend type Query {
    ensembles(activeOnly: Boolean): [Ensemble!]!
    usersPaginated(filter: UsersFilterInput, pagination: PaginationInput): UsersPage!
    ensembleMembers(ensembleKey: String!, filter: UsersFilterInput, pagination: PaginationInput): UsersPage!
    """ Users NOT in this ensemble — for the 'Disponibles' tab. """
    ensembleAvailable(ensembleKey: String!, filter: UsersFilterInput, pagination: PaginationInput): UsersPage!
    """ Fast member+available counts for header badges. """
    ensembleCounts(ensembleKey: String!): EnsembleCounts!
    """ Instrument distribution for eligible members of an ensemble. """
    ensembleInstrumentStats(ensembleKey: String!): [InstrumentStat!]!
  }

  extend type Mutation {
    """ Replace all non-default ensembles for a user. MARCHING always kept. """
    setUserEnsembles(userId: ID!, ensembleKeys: [String!]!): User!

    """ Bulk add users to ensembles. """
    addUserToEnsembles(userIds: [ID!]!, ensembleKeys: [String!]!): BulkEnsembleResult!

    """ Bulk remove users from ensembles. MARCHING is never removed. """
    removeUserFromEnsembles(userIds: [ID!]!, ensembleKeys: [String!]!): BulkEnsembleResult!
  }
`;
