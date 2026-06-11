const assert = require("node:assert/strict");
const { test } = require("node:test");
const mongoose = require("mongoose");

const User = require("../../models/User");
const Parent = require("../../models/Parents");
const Apoyo = require("../../models/Apoyo");
const Guatemala = require("../../models/Guatemala");
const Attendance = require("../../models/Attendance");
const AttendanceClass = require("../../models/ClassAttendance");
const MedicalRecord = require("../../models/MedicalRecord");
const PerformanceAttendance = require("../../models/PerformanceAttendance");
const EventRoster = require("../../models/EventRoster");
const Payment = require("../../models/Payment");
const Order = require("../../models/Order");
const { Ticket } = require("../../models/Tickets");
const Inventory = require("../../models/Inventory");
const InventoryMaintenance = require("../../models/InventoryMaintenance");
const Document = require("../../models/Document");
const RehearsalSession = require("../../models/RehearsalSession");
const Formation = require("../../models/Formation");
const Tour = require("../../models/Tour");
const TourFlight = require("../../models/TourFlight");
const TourRoom = require("../../models/TourRoom");
const TourItinerary = require("../../models/TourItinerary");
const TourItineraryAssignment = require("../../models/TourItineraryAssignment");
const TourRoute = require("../../models/TourRoute");
const TourRouteAssignment = require("../../models/TourRouteAssignment");
const TourParticipant = require("../../models/TourParticipant");
const TourPayment = require("../../models/TourPayment");
const ParticipantInstallment = require("../../models/ParticipantInstallment");
const ParticipantFinancialAccount = require("../../models/ParticipantFinancialAccount");
const TourPaymentPlan = require("../../models/TourPaymentPlan");
const TourImportBatch = require("../../models/TourImportBatch");
const Events = require("../../models/Events");
const CashSession = require("../../models/CashSession");
const CashBox = require("../../models/CashBox");
const FinanceAccount = require("../../models/FinanceAccount");
const InventoryItem = require("../../models/InventoryItem");
const InventoryMovement = require("../../models/InventoryMovement");
const Expense = require("../../models/Expense");
const BankEntry = require("../../models/BankEntry");
const CommitteeLedgerEntry = require("../../models/CommitteeLedgerEntry");
const BudgetInitialization = require("../../models/BudgetInitialization");
const ActivitySettlement = require("../../models/ActivitySettlement");
const Sale = require("../../models/Sale");
const Committee = require("../../models/Committee");
const FormationTemplate = require("../../models/FormationTemplate");
const PracticeSequence = require("../../models/PracticeTools/PracticeSequence");
const PracticePreset = require("../../models/PracticeTools/PracticePreset");
const MetronomeQuickSettings = require("../../models/PracticeTools/MetronomeQuickSettings");

const { deleteUser } = require("../../src/graphql/modules/users/services/user.service");
const {
  deleteUserCascade,
  __test,
} = require("../../src/graphql/modules/users/services/userCascade.service");

const operationModels = [
  User,
  Parent,
  Apoyo,
  Guatemala,
  Attendance,
  AttendanceClass,
  MedicalRecord,
  PerformanceAttendance,
  EventRoster,
  Payment,
  Order,
  Ticket,
  Inventory,
  InventoryMaintenance,
  Document,
  RehearsalSession,
  Formation,
  Tour,
  TourFlight,
  TourRoom,
  TourItinerary,
  TourItineraryAssignment,
  TourRoute,
  TourRouteAssignment,
  TourParticipant,
  TourPayment,
  ParticipantInstallment,
  ParticipantFinancialAccount,
  TourPaymentPlan,
  TourImportBatch,
  Events,
  CashSession,
  CashBox,
  FinanceAccount,
  InventoryItem,
  InventoryMovement,
  Expense,
  BankEntry,
  CommitteeLedgerEntry,
  BudgetInitialization,
  ActivitySettlement,
  Sale,
  Committee,
  FormationTemplate,
  PracticeSequence,
  PracticePreset,
  MetronomeQuickSettings,
];

function installCascadeMocks(t, options = {}) {
  const calls = {
    practiceSequenceDeleteMany: 0,
    practicePresetDeleteMany: 0,
    quickSettingsDeleteMany: 0,
  };

  for (const model of operationModels) {
    if (typeof model.updateMany === "function") {
      t.mock.method(model, "updateMany", async () => ({ modifiedCount: 0 }));
    }
    if (typeof model.deleteMany === "function") {
      t.mock.method(model, "deleteMany", async () => ({ deletedCount: 0 }));
    }
  }

  t.mock.method(Inventory, "find", () => ({
    distinct: async () => options.inventoryIds || [],
  }));
  t.mock.method(TourParticipant, "find", () => ({
    lean: async () => [],
  }));

  t.mock.method(PracticeSequence, "deleteMany", async (filter) => {
    calls.practiceSequenceDeleteMany += 1;
    if (options.failPracticeSequence) {
      throw new Error("simulated delete failure");
    }
    return { deletedCount: options.practiceSequenceDeletedCount ?? 0, filter };
  });
  t.mock.method(PracticePreset, "deleteMany", async () => {
    calls.practicePresetDeleteMany += 1;
    return { deletedCount: 0 };
  });
  t.mock.method(MetronomeQuickSettings, "deleteMany", async () => {
    calls.quickSettingsDeleteMany += 1;
    return { deletedCount: 0 };
  });

  return calls;
}

test("loadPracticeModels resolves PracticeTools CommonJS exports to Mongoose models", async () => {
  const models = await __test.loadPracticeModels();

  assert.equal(typeof models.PracticeSequence.deleteMany, "function");
  assert.equal(typeof models.PracticePreset.deleteMany, "function");
  assert.equal(typeof models.MetronomeQuickSettings.deleteMany, "function");
});

test("resolveMongooseModel accepts CommonJS object exports", () => {
  function PracticeSequenceMock() {}
  PracticeSequenceMock.deleteMany = async () => {};
  PracticeSequenceMock.updateMany = async () => {};

  const resolved = __test.resolveMongooseModel(
    { PracticeSequence: PracticeSequenceMock },
    "PracticeSequence",
  );

  assert.equal(resolved, PracticeSequenceMock);
});

test("resolveMongooseModel rejects invalid exports with a clear model name", () => {
  assert.throws(
    () => __test.resolveMongooseModel({ default: {} }, "PracticeSequence"),
    /PracticeSequence no resolvió a un modelo Mongoose válido/,
  );
});

test("deleteUserCascade deletes PracticeSequence records for the user", async (t) => {
  const calls = installCascadeMocks(t, { practiceSequenceDeletedCount: 2 });
  const userId = new mongoose.Types.ObjectId();

  await deleteUserCascade(userId);

  assert.equal(calls.practiceSequenceDeleteMany, 1);
  assert.equal(calls.practicePresetDeleteMany, 1);
  assert.equal(calls.quickSettingsDeleteMany, 1);
});

test("deleteUserCascade succeeds when no related documents exist", async (t) => {
  installCascadeMocks(t);

  await assert.doesNotReject(() =>
    deleteUserCascade(new mongoose.Types.ObjectId()),
  );
});

test("deleteUserCascade reports the failing cascade step", async (t) => {
  installCascadeMocks(t, { failPracticeSequence: true });

  await assert.rejects(
    () => deleteUserCascade(new mongoose.Types.ObjectId()),
    /deleteUserCascade:PracticeSequence\.deleteByUser/,
  );
});

test("deleteUser returns user-not-found before running cascade", async (t) => {
  t.mock.method(User, "findById", async () => null);

  await assert.rejects(
    () => deleteUser(new mongoose.Types.ObjectId().toString()),
    /El usuario no existe/,
  );
});
