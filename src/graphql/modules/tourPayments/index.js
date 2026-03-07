/**
 * src/graphql/modules/tourPayments/index.js
 *
 * Módulo GraphQL: sistema financiero completo por participante de gira.
 *
 * Entidades:
 *   TourPaymentPlan            → cronograma/plantilla de cuotas de la gira
 *   ParticipantFinancialAccount → cuenta financiera individual por participante
 *   ParticipantInstallment      → cuotas individuales del participante
 *   TourPayment                 → pagos reales registrados
 */
"use strict";

const typeDefs = require("./typeDefs");
const queries = require("./resolvers/queries");
const mutations = require("./resolvers/mutations");
const types = require("./resolvers/types");

module.exports = {
  name: "tourPayments",
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
