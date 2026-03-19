const { gql } = require("apollo-server-express");

module.exports = gql`
  enum FormationType {
    SINGLE
    DOUBLE
  }

  # ── Formation ──────────────────────────────────────────────────────────────

  type Formation {
    id: ID!
    name: String!
    date: String!
    type: FormationType!
    """ Global column count — applies to wind blocks (BLOQUE_FRENTE / BLOQUE_ATRAS) """
    columns: Int!
    templateId: ID
    """ Section order per zone — fully configurable """
    zoneOrders: [ZoneOrder!]!
    """ Per-zone column overrides for Danza, Percusión, and Color Guard """
    zoneColumns: [ZoneColumns!]!
    instrumentMappings: [FormationInstrumentMapping!]!
    excludedUserIds: [ID!]!
    slots: [FormationSlot!]!
    zoneMemberCounts: [ZoneMemberCount!]!
    notes: String
    createdBy: FormationUser
    createdAt: String!
    updatedAt: String!
  }

  type FormationSlot {
    zone: String!
    row: Int!
    col: Int!
    """ Section key for color-coding only """
    section: String
    userId: ID
    displayName: String
    avatar: String
    locked: Boolean!
  }

  type ZoneOrder {
    zone: String!
    sectionOrder: [String!]!
  }

  """ Per-zone layout override for Danza, Percusión, and Color Guard """
  type ZoneColumns {
    zone: String!
    columns: Int!
    rows: Int
  }

  type ZoneMemberCount {
    zone: String!
    count: Int!
  }

  type FormationInstrumentMapping {
    instrument: String!
    section: String!
  }

  type FormationUser {
    id: ID!
    name: String
    firstSurName: String
  }

  # ── FormationTemplate ──────────────────────────────────────────────────────

  type FormationTemplate {
    id: ID!
    name: String!
    defaultColumns: Int!
    zoneOrders: [ZoneOrder!]!
    """ Per-zone column overrides for Danza, Percusión, and Color Guard """
    zoneColumns: [ZoneColumns!]!
    instrumentMappings: [FormationInstrumentMapping!]!
    notes: String
    createdBy: FormationUser
    createdAt: String!
    updatedAt: String!
  }

  # ── Users by section ───────────────────────────────────────────────────────

  type SectionMembers {
    section: String!
    count: Int!
    members: [SectionMember!]!
  }

  type SectionMember {
    userId: ID!
    """ name + firstSurName only """
    name: String!
    instrument: String
    avatar: String
  }

  type UnmappedUser {
    userId: ID!
    name: String!
    instrument: String
    avatar: String
  }

  type UsersBySectionResult {
    sections: [SectionMembers!]!
    unmapped: [UnmappedUser!]!
  }

  # ── Inputs ─────────────────────────────────────────────────────────────────

  input InstrumentMappingInput {
    instrument: String!
    section: String!
  }

  input ZoneOrderInput {
    zone: String!
    sectionOrder: [String!]!
  }

  input ZoneColumnsInput {
    zone: String!
    columns: Int!
    rows: Int
  }

  input FormationSlotInput {
    zone: String!
    row: Int!
    col: Int!
    section: String
    userId: ID
    displayName: String
    avatar: String
    locked: Boolean
  }

  input ZoneMemberCountInput {
    zone: String!
    count: Int!
  }

  input CreateFormationInput {
    name: String!
    date: String!
    type: FormationType!
    columns: Int!
    templateId: ID
    zoneOrders: [ZoneOrderInput!]!
    zoneColumns: [ZoneColumnsInput!]
    instrumentMappings: [InstrumentMappingInput!]
    excludedUserIds: [ID!]
    slots: [FormationSlotInput!]!
    zoneMemberCounts: [ZoneMemberCountInput!]
    notes: String
  }

  input UpdateFormationInput {
    name: String
    notes: String
    columns: Int
    expectedUpdatedAt: String
    excludedUserIds: [ID!]
    zoneOrders: [ZoneOrderInput!]
    zoneColumns: [ZoneColumnsInput!]
    slots: [FormationSlotInput!]
    zoneMemberCounts: [ZoneMemberCountInput!]
  }

  input CreateFormationTemplateInput {
    name: String!
    defaultColumns: Int!
    zoneOrders: [ZoneOrderInput!]!
    zoneColumns: [ZoneColumnsInput!]
    instrumentMappings: [InstrumentMappingInput!]
    notes: String
  }

  input UpdateFormationTemplateInput {
    name: String
    defaultColumns: Int
    zoneOrders: [ZoneOrderInput!]
    zoneColumns: [ZoneColumnsInput!]
    instrumentMappings: [InstrumentMappingInput!]
    notes: String
  }

  input FormationFilterInput {
    year: Int
    search: String
  }

  # ── Queries & Mutations ────────────────────────────────────────────────────

  extend type Query {
    formations(filter: FormationFilterInput): [Formation!]!
    formation(id: ID!): Formation

    formationTemplates: [FormationTemplate!]!
    formationTemplate(id: ID!): FormationTemplate

    """
    Active marching band members grouped by their parade section.
    excludedIds: users to omit from the result.
    instrumentMappings: overrides for instrument→section mapping.
    """
    formationUsersBySection(
      excludedIds: [ID!]
      instrumentMappings: [InstrumentMappingInput!]
    ): UsersBySectionResult!
  }

  extend type Mutation {
    createFormation(input: CreateFormationInput!): Formation!
    updateFormation(id: ID!, input: UpdateFormationInput!): Formation!
    deleteFormation(id: ID!): String!

    createFormationTemplate(input: CreateFormationTemplateInput!): FormationTemplate!
    updateFormationTemplate(id: ID!, input: UpdateFormationTemplateInput!): FormationTemplate!
    deleteFormationTemplate(id: ID!): String!
  }
`;
