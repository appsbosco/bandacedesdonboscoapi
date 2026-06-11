const mongoose = require("mongoose");

const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const Apoyo = require("../../../../../models/Apoyo");
const Guatemala = require("../../../../../models/Guatemala");
const Attendance = require("../../../../../models/Attendance");
const AttendanceClass = require("../../../../../models/ClassAttendance");
const MedicalRecord = require("../../../../../models/MedicalRecord");
const PerformanceAttendance = require("../../../../../models/PerformanceAttendance");
const EventRoster = require("../../../../../models/EventRoster");
const Payment = require("../../../../../models/Payment");
const Order = require("../../../../../models/Order");
const { Ticket } = require("../../../../../models/Tickets");
const Inventory = require("../../../../../models/Inventory");
const InventoryMaintenance = require("../../../../../models/InventoryMaintenance");
const Document = require("../../../../../models/Document");
const RehearsalSession = require("../../../../../models/RehearsalSession");
const Formation = require("../../../../../models/Formation");
const Tour = require("../../../../../models/Tour");
const TourFlight = require("../../../../../models/TourFlight");
const TourRoom = require("../../../../../models/TourRoom");
const TourItinerary = require("../../../../../models/TourItinerary");
const TourItineraryAssignment = require("../../../../../models/TourItineraryAssignment");
const TourRoute = require("../../../../../models/TourRoute");
const TourRouteAssignment = require("../../../../../models/TourRouteAssignment");
const TourParticipant = require("../../../../../models/TourParticipant");
const TourPayment = require("../../../../../models/TourPayment");
const ParticipantInstallment = require("../../../../../models/ParticipantInstallment");
const ParticipantFinancialAccount = require("../../../../../models/ParticipantFinancialAccount");
const TourPaymentPlan = require("../../../../../models/TourPaymentPlan");
const TourImportBatch = require("../../../../../models/TourImportBatch");
const Events = require("../../../../../models/Events");
const CashSession = require("../../../../../models/CashSession");
const CashBox = require("../../../../../models/CashBox");
const FinanceAccount = require("../../../../../models/FinanceAccount");
const InventoryItem = require("../../../../../models/InventoryItem");
const InventoryMovement = require("../../../../../models/InventoryMovement");
const Expense = require("../../../../../models/Expense");
const BankEntry = require("../../../../../models/BankEntry");
const CommitteeLedgerEntry = require("../../../../../models/CommitteeLedgerEntry");
const BudgetInitialization = require("../../../../../models/BudgetInitialization");
const ActivitySettlement = require("../../../../../models/ActivitySettlement");
const Sale = require("../../../../../models/Sale");
const Committee = require("../../../../../models/Committee");
const FormationTemplate = require("../../../../../models/FormationTemplate");
const {
  removeTourParticipantSafely,
} = require("../../tours/services/tourParticipantRemoval.service");

function isMongooseModel(candidate) {
  return (
    typeof candidate === "function" &&
    typeof candidate.deleteMany === "function" &&
    typeof candidate.updateMany === "function"
  );
}

function resolveMongooseModel(moduleValue, modelName) {
  const candidates = [
    moduleValue,
    moduleValue?.default,
    moduleValue?.[modelName],
    moduleValue?.default?.[modelName],
    moduleValue?.default?.default,
  ].filter(Boolean);

  const model = candidates.find(isMongooseModel);

  if (!model) {
    const keys =
      moduleValue && typeof moduleValue === "object"
        ? Object.keys(moduleValue)
        : [];
    const defaultKeys =
      moduleValue?.default && typeof moduleValue.default === "object"
        ? Object.keys(moduleValue.default)
        : [];

    throw new Error(
      `[deleteUserCascade] ${modelName} no resolvió a un modelo Mongoose válido. ` +
        `Tipo recibido: ${typeof moduleValue}. Keys: ${keys.join(", ")}. ` +
        `Default keys: ${defaultKeys.join(", ")}`,
    );
  }

  return model;
}

async function loadPracticeModels() {
  const [
    PracticeSequenceModule,
    PracticePresetModule,
    MetronomeQuickSettingsModule,
  ] = await Promise.all([
    import("../../../../../models/PracticeTools/PracticeSequence.js"),
    import("../../../../../models/PracticeTools/PracticePreset.js"),
    import("../../../../../models/PracticeTools/MetronomeQuickSettings.js"),
  ]);

  return {
    PracticeSequence: resolveMongooseModel(
      PracticeSequenceModule,
      "PracticeSequence",
    ),
    PracticePreset: resolveMongooseModel(PracticePresetModule, "PracticePreset"),
    MetronomeQuickSettings: resolveMongooseModel(
      MetronomeQuickSettingsModule,
      "MetronomeQuickSettings",
    ),
  };
}

async function runCascadeStep(stepName, operation) {
  try {
    const result = await operation();
    return { stepName, ok: true, result };
  } catch (error) {
    error.message = `[deleteUserCascade:${stepName}] ${error.message}`;
    throw error;
  }
}

async function runCascadeSteps(steps) {
  return Promise.all(
    steps.map(({ name, operation }) => runCascadeStep(name, operation)),
  );
}

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(id);
}

async function deleteUserCascade(userIdInput) {
  const userId = toObjectId(userIdInput);
  const { PracticeSequence, PracticePreset, MetronomeQuickSettings } =
    await loadPracticeModels();

  const inventoryIds = await Inventory.find({ user: userId }).distinct("_id");
  const linkedTourParticipants = await TourParticipant.find(
    { linkedUser: userId },
    { _id: 1 },
  ).lean();

  for (const participant of linkedTourParticipants) {
    await removeTourParticipantSafely({
      participantId: participant._id,
      actor: null,
      removalSource: "USER_CASCADE",
      removalReason: "El User vinculado fue eliminado de la plataforma",
    });
  }

  await runCascadeSteps([
    {
      name: "User.students.pull",
      operation: () =>
        User.updateMany({ students: userId }, { $pull: { students: userId } }),
    },
    {
      name: "User.instructor.unset",
      operation: () =>
        User.updateMany({ instructor: userId }, { $unset: { instructor: 1 } }),
    },
    {
      name: "Parent.children.pull",
      operation: () =>
        Parent.updateMany({ children: userId }, { $pull: { children: userId } }),
    },
    {
      name: "Apoyo.children.pull",
      operation: () =>
        Apoyo.updateMany({ children: userId }, { $pull: { children: userId } }),
    },
    {
      name: "Guatemala.children.pull",
      operation: () =>
        Guatemala.updateMany(
          { children: userId },
          { $pull: { children: userId } },
        ),
    },

    {
      name: "Attendance.deleteByUser",
      operation: () => Attendance.deleteMany({ user: userId }),
    },
    {
      name: "Attendance.recordedBy.unset",
      operation: () =>
        Attendance.updateMany(
          { recordedBy: userId },
          { $unset: { recordedBy: 1 } },
        ),
    },
    {
      name: "AttendanceClass.deleteByStudentOrInstructor",
      operation: () =>
        AttendanceClass.deleteMany({
          $or: [{ student: userId }, { instructor: userId }],
        }),
    },
    {
      name: "MedicalRecord.deleteByUser",
      operation: () => MedicalRecord.deleteMany({ user: userId }),
    },
    {
      name: "PerformanceAttendance.deleteByUser",
      operation: () => PerformanceAttendance.deleteMany({ user: userId }),
    },
    {
      name: "EventRoster.deleteByUser",
      operation: () => EventRoster.deleteMany({ user: userId }),
    },
    {
      name: "EventRoster.attendanceMarkedBy.unset",
      operation: () =>
        EventRoster.updateMany(
          { attendanceMarkedBy: userId },
          { $unset: { attendanceMarkedBy: 1, attendanceMarkedAt: 1 } },
        ),
    },
    {
      name: "EventRoster.createdBy.unset",
      operation: () =>
        EventRoster.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "EventRoster.transportPaidBy.unset",
      operation: () =>
        EventRoster.updateMany(
          { transportPaidBy: userId },
          { $unset: { transportPaidBy: 1, transportPaidAt: 1 } },
        ),
    },
    {
      name: "Payment.deleteByUser",
      operation: () => Payment.deleteMany({ user: userId }),
    },
    {
      name: "Order.deleteByUserId",
      operation: () => Order.deleteMany({ userId }),
    },
    {
      name: "Ticket.deleteByUserId",
      operation: () => Ticket.deleteMany({ userId }),
    },
    {
      name: "InventoryMaintenance.deleteRelated",
      operation: () =>
        InventoryMaintenance.deleteMany({
          $or: [{ inventory: { $in: inventoryIds } }, { createdBy: userId }],
        }),
    },
    {
      name: "Inventory.deleteByUser",
      operation: () => Inventory.deleteMany({ user: userId }),
    },
    {
      name: "Document.deleteByOwner",
      operation: () => Document.deleteMany({ owner: userId }),
    },
    {
      name: "Document.createdBy.unset",
      operation: () =>
        Document.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "Document.updatedBy.unset",
      operation: () =>
        Document.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "RehearsalSession.takenBy.unset",
      operation: () =>
        RehearsalSession.updateMany(
          { takenBy: userId },
          { $unset: { takenBy: 1, takenAt: 1 } },
        ),
    },
    {
      name: "Formation.excludedUserIds.pull",
      operation: () =>
        Formation.updateMany(
          { excludedUserIds: userId },
          { $pull: { excludedUserIds: userId } },
        ),
    },
    {
      name: "Formation.createdBy.unset",
      operation: () =>
        Formation.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "Formation.slots.clearUser",
      operation: () =>
        Formation.updateMany(
          { "slots.userId": userId },
          {
            $set: {
              "slots.$[slot].userId": null,
              "slots.$[slot].displayName": null,
              "slots.$[slot].avatar": null,
              "slots.$[slot].locked": false,
            },
          },
          { arrayFilters: [{ "slot.userId": userId }] },
        ),
    },
    {
      name: "PracticeSequence.deleteByUser",
      operation: () => PracticeSequence.deleteMany({ user: userId }),
    },
    {
      name: "PracticePreset.deleteByUser",
      operation: () => PracticePreset.deleteMany({ user: userId }),
    },
    {
      name: "MetronomeQuickSettings.deleteByUser",
      operation: () => MetronomeQuickSettings.deleteMany({ user: userId }),
    },

    {
      name: "TourParticipant.addedBy.unset",
      operation: () =>
        TourParticipant.updateMany(
          { addedBy: userId },
          { $unset: { addedBy: 1 } },
        ),
    },
    {
      name: "TourParticipant.updatedBy.unset",
      operation: () =>
        TourParticipant.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "TourPayment.linkedUser.unset",
      operation: () =>
        TourPayment.updateMany(
          { linkedUser: userId },
          { $unset: { linkedUser: 1 } },
        ),
    },
    {
      name: "TourPayment.registeredBy.unset",
      operation: () =>
        TourPayment.updateMany(
          { registeredBy: userId },
          { $unset: { registeredBy: 1 } },
        ),
    },
    {
      name: "ParticipantInstallment.createdBy.unset",
      operation: () =>
        ParticipantInstallment.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "ParticipantInstallment.updatedBy.unset",
      operation: () =>
        ParticipantInstallment.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "ParticipantFinancialAccount.createdBy.unset",
      operation: () =>
        ParticipantFinancialAccount.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "ParticipantFinancialAccount.updatedBy.unset",
      operation: () =>
        ParticipantFinancialAccount.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "ParticipantFinancialAccount.adjustments.appliedBy.unset",
      operation: () =>
        ParticipantFinancialAccount.updateMany(
          { "adjustments.appliedBy": userId },
          { $unset: { "adjustments.$[adj].appliedBy": 1 } },
          { arrayFilters: [{ "adj.appliedBy": userId }] },
        ),
    },
    {
      name: "TourPaymentPlan.createdBy.unset",
      operation: () =>
        TourPaymentPlan.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "TourPaymentPlan.updatedBy.unset",
      operation: () =>
        TourPaymentPlan.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "TourImportBatch.createdBy.unset",
      operation: () =>
        TourImportBatch.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "TourImportBatch.confirmedBy.unset",
      operation: () =>
        TourImportBatch.updateMany(
          { confirmedBy: userId },
          { $unset: { confirmedBy: 1, confirmedAt: 1 } },
        ),
    },
    {
      name: "Tour.createdBy.unset",
      operation: () =>
        Tour.updateMany({ createdBy: userId }, { $unset: { createdBy: 1 } }),
    },
    {
      name: "Tour.updatedBy.unset",
      operation: () =>
        Tour.updateMany({ updatedBy: userId }, { $unset: { updatedBy: 1 } }),
    },
    {
      name: "TourFlight.createdBy.unset",
      operation: () =>
        TourFlight.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "TourFlight.updatedBy.unset",
      operation: () =>
        TourFlight.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "TourRoom.createdBy.unset",
      operation: () =>
        TourRoom.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "TourRoom.updatedBy.unset",
      operation: () =>
        TourRoom.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "TourItinerary.createdBy.unset",
      operation: () =>
        TourItinerary.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "TourItinerary.updatedBy.unset",
      operation: () =>
        TourItinerary.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "TourItineraryAssignment.createdBy.unset",
      operation: () =>
        TourItineraryAssignment.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "TourRoute.createdBy.unset",
      operation: () =>
        TourRoute.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "TourRoute.updatedBy.unset",
      operation: () =>
        TourRoute.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "TourRouteAssignment.createdBy.unset",
      operation: () =>
        TourRouteAssignment.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "Events.createdBy.unset",
      operation: () =>
        Events.updateMany({ createdBy: userId }, { $unset: { createdBy: 1 } }),
    },
    {
      name: "Events.updatedBy.unset",
      operation: () =>
        Events.updateMany({ updatedBy: userId }, { $unset: { updatedBy: 1 } }),
    },
    {
      name: "CashSession.createdBy.unset",
      operation: () =>
        CashSession.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "CashSession.closedBy.unset",
      operation: () =>
        CashSession.updateMany(
          { closedBy: userId },
          { $unset: { closedBy: 1 } },
        ),
    },
    {
      name: "CashBox.createdBy.unset",
      operation: () =>
        CashBox.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "FinanceAccount.createdBy.unset",
      operation: () =>
        FinanceAccount.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "InventoryItem.createdBy.unset",
      operation: () =>
        InventoryItem.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "InventoryMovement.createdBy.unset",
      operation: () =>
        InventoryMovement.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "InventoryMovement.voidedBy.unset",
      operation: () =>
        InventoryMovement.updateMany(
          { voidedBy: userId },
          { $unset: { voidedBy: 1 } },
        ),
    },
    {
      name: "Expense.createdBy.unset",
      operation: () =>
        Expense.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "Expense.voidedBy.unset",
      operation: () =>
        Expense.updateMany(
          { voidedBy: userId },
          { $unset: { voidedBy: 1 } },
        ),
    },
    {
      name: "BankEntry.createdBy.unset",
      operation: () =>
        BankEntry.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "BankEntry.voidedBy.unset",
      operation: () =>
        BankEntry.updateMany(
          { voidedBy: userId },
          { $unset: { voidedBy: 1 } },
        ),
    },
    {
      name: "CommitteeLedgerEntry.createdBy.unset",
      operation: () =>
        CommitteeLedgerEntry.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "CommitteeLedgerEntry.voidedBy.unset",
      operation: () =>
        CommitteeLedgerEntry.updateMany(
          { voidedBy: userId },
          { $unset: { voidedBy: 1 } },
        ),
    },
    {
      name: "BudgetInitialization.createdBy.unset",
      operation: () =>
        BudgetInitialization.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "BudgetInitialization.voidedBy.unset",
      operation: () =>
        BudgetInitialization.updateMany(
          { voidedBy: userId },
          { $unset: { voidedBy: 1 } },
        ),
    },
    {
      name: "ActivitySettlement.createdBy.unset",
      operation: () =>
        ActivitySettlement.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "ActivitySettlement.voidedBy.unset",
      operation: () =>
        ActivitySettlement.updateMany(
          { voidedBy: userId },
          { $unset: { voidedBy: 1 } },
        ),
    },
    {
      name: "Sale.createdBy.unset",
      operation: () =>
        Sale.updateMany({ createdBy: userId }, { $unset: { createdBy: 1 } }),
    },
    {
      name: "Sale.voidedBy.unset",
      operation: () =>
        Sale.updateMany({ voidedBy: userId }, { $unset: { voidedBy: 1 } }),
    },
    {
      name: "Committee.createdBy.unset",
      operation: () =>
        Committee.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
    {
      name: "Committee.updatedBy.unset",
      operation: () =>
        Committee.updateMany(
          { updatedBy: userId },
          { $unset: { updatedBy: 1 } },
        ),
    },
    {
      name: "FormationTemplate.createdBy.unset",
      operation: () =>
        FormationTemplate.updateMany(
          { createdBy: userId },
          { $unset: { createdBy: 1 } },
        ),
    },
  ]);
}

module.exports = {
  deleteUserCascade,
  __test: {
    loadPracticeModels,
    resolveMongooseModel,
    runCascadeStep,
  },
};
