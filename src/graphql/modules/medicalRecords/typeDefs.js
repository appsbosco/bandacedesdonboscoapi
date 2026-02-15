const { gql } = require("apollo-server");

module.exports = gql`
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

  extend type Query {
    getMedicalRecord(id: ID!): MedicalRecord
    getMedicalRecords: [MedicalRecord]

    # backward-compatible (en el schema original no había args)
    getMedicalRecordByUser(userId: ID): [MedicalRecord]
  }

  extend type Mutation {
    newMedicalRecord(input: MedicalRecordInput): MedicalRecord
    updateMedicalRecord(id: ID!, input: MedicalRecordInput): MedicalRecord
    deleteMedicalRecord(id: ID!): String
  }
`;
