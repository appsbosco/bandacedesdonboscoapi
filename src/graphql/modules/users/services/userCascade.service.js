const mongoose = require("mongoose");

const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const Apoyo = require("../../../../../models/Apoyo");
const Guatemala = require("../../../../../models/Guatemala");
const Attendance = require("../../../../../models/Attendance");
const AttendanceClass = require("../../../../../models/ClassAttendance");
const MedicalRecord = require("../../../../../models/MedicalRecord");
const PerformanceAttendance = require("../../../../../models/PerformanceAttendance");
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

async function loadPracticeModels() {
  const [
    { default: PracticeSequence },
    { default: PracticePreset },
    { default: MetronomeQuickSettings },
  ] = await Promise.all([
    import("../../../../../models/PracticeTools/PracticeSequence.js"),
    import("../../../../../models/PracticeTools/PracticePreset.js"),
    import("../../../../../models/PracticeTools/MetronomeQuickSettings.js"),
  ]);

  return { PracticeSequence, PracticePreset, MetronomeQuickSettings };
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

  await Promise.all([
    User.updateMany({ students: userId }, { $pull: { students: userId } }),
    User.updateMany({ instructor: userId }, { $unset: { instructor: 1 } }),
    Parent.updateMany({ children: userId }, { $pull: { children: userId } }),
    Apoyo.updateMany({ children: userId }, { $pull: { children: userId } }),
    Guatemala.updateMany({ children: userId }, { $pull: { children: userId } }),

    Attendance.deleteMany({ user: userId }),
    Attendance.updateMany({ recordedBy: userId }, { $unset: { recordedBy: 1 } }),
    AttendanceClass.deleteMany({
      $or: [{ student: userId }, { instructor: userId }],
    }),
    MedicalRecord.deleteMany({ user: userId }),
    PerformanceAttendance.deleteMany({ user: userId }),
    Payment.deleteMany({ user: userId }),
    Order.deleteMany({ userId }),
    Ticket.deleteMany({ userId }),
    InventoryMaintenance.deleteMany({
      $or: [
        { inventory: { $in: inventoryIds } },
        { createdBy: userId },
      ],
    }),
    Inventory.deleteMany({ user: userId }),
    Document.deleteMany({ owner: userId }),
    Document.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    Document.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    RehearsalSession.updateMany(
      { takenBy: userId },
      { $unset: { takenBy: 1, takenAt: 1 } },
    ),
    Formation.updateMany(
      { excludedUserIds: userId },
      { $pull: { excludedUserIds: userId } },
    ),
    Formation.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
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
    PracticeSequence.deleteMany({ user: userId }),
    PracticePreset.deleteMany({ user: userId }),
    MetronomeQuickSettings.deleteMany({ user: userId }),

    TourParticipant.updateMany(
      { linkedUser: userId },
      { $unset: { linkedUser: 1 } },
    ),
    TourParticipant.updateMany(
      { addedBy: userId },
      { $unset: { addedBy: 1 } },
    ),
    TourParticipant.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    TourPayment.updateMany(
      { linkedUser: userId },
      { $unset: { linkedUser: 1 } },
    ),
    TourPayment.updateMany(
      { registeredBy: userId },
      { $unset: { registeredBy: 1 } },
    ),
    ParticipantInstallment.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    ParticipantInstallment.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    ParticipantFinancialAccount.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    ParticipantFinancialAccount.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    ParticipantFinancialAccount.updateMany(
      { "adjustments.appliedBy": userId },
      { $unset: { "adjustments.$[adj].appliedBy": 1 } },
      { arrayFilters: [{ "adj.appliedBy": userId }] },
    ),
    TourPaymentPlan.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    TourPaymentPlan.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    TourImportBatch.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    TourImportBatch.updateMany(
      { confirmedBy: userId },
      { $unset: { confirmedBy: 1, confirmedAt: 1 } },
    ),
    Tour.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    Tour.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    TourFlight.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    TourFlight.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    TourRoom.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    TourRoom.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    TourItinerary.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    TourItinerary.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    TourItineraryAssignment.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    TourRoute.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    TourRoute.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    TourRouteAssignment.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    Events.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    Events.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    CashSession.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    CashSession.updateMany(
      { closedBy: userId },
      { $unset: { closedBy: 1 } },
    ),
    CashBox.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    FinanceAccount.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    InventoryItem.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    InventoryMovement.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    InventoryMovement.updateMany(
      { voidedBy: userId },
      { $unset: { voidedBy: 1 } },
    ),
    Expense.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    Expense.updateMany(
      { voidedBy: userId },
      { $unset: { voidedBy: 1 } },
    ),
    BankEntry.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    BankEntry.updateMany(
      { voidedBy: userId },
      { $unset: { voidedBy: 1 } },
    ),
    CommitteeLedgerEntry.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    CommitteeLedgerEntry.updateMany(
      { voidedBy: userId },
      { $unset: { voidedBy: 1 } },
    ),
    BudgetInitialization.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    BudgetInitialization.updateMany(
      { voidedBy: userId },
      { $unset: { voidedBy: 1 } },
    ),
    ActivitySettlement.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    ActivitySettlement.updateMany(
      { voidedBy: userId },
      { $unset: { voidedBy: 1 } },
    ),
    Sale.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    Sale.updateMany(
      { voidedBy: userId },
      { $unset: { voidedBy: 1 } },
    ),
    Committee.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
    Committee.updateMany(
      { updatedBy: userId },
      { $unset: { updatedBy: 1 } },
    ),
    FormationTemplate.updateMany(
      { createdBy: userId },
      { $unset: { createdBy: 1 } },
    ),
  ]);
}

module.exports = {
  deleteUserCascade,
};
