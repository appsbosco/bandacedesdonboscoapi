const mongoose = require("mongoose");

const StatusHistoryEntrySchema = new mongoose.Schema(
  {
    requestStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    },
    justificationStatus: {
      type: String,
      enum: ["PENDING_REVIEW", "JUSTIFIED", "NOT_JUSTIFIED"],
    },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedByModel: { type: String, enum: ["User", "Parent"], default: "User" },
    notes: { type: String, maxlength: 500 },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const AbsencePermissionSchema = new mongoose.Schema(
  {
    // ─── Who the attendance exception applies to ─────────────────────────
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ─── Who made the request ────────────────────────────────────────────
    requesterType: {
      type: String,
      enum: ["PARENT", "USER"],
      required: true,
    },
    requestedByParent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
    },
    requestedByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ─── What event the request applies to ───────────────────────────────
    permissionType: {
      type: String,
      enum: ["ABSENCE", "LATE_ARRIVAL", "EARLY_WITHDRAWAL"],
      default: "ABSENCE",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["REHEARSAL", "PERFORMANCE"],
      required: true,
    },
    rehearsalSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RehearsalSession",
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },
    // Denormalized date for fast range queries without joining
    absenceDate: {
      type: Date,
      required: true,
      index: true,
    },

    // ─── Reason and supporting files ─────────────────────────────────────
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    attachments: [{ type: String }],

    // ─── Request lifecycle ────────────────────────────────────────────────
    requestStatus: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },

    // Separate from requestStatus: being approved doesn't automatically
    // mean the absence is justified. Admin decides independently.
    justificationStatus: {
      type: String,
      enum: ["PENDING_REVIEW", "JUSTIFIED", "NOT_JUSTIFIED"],
      default: "PENDING_REVIEW",
      index: true,
    },

    // ─── Review metadata ─────────────────────────────────────────────────
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: { type: Date },
    adminNotes: { type: String, maxlength: 1000 },

    // ─── Audit trail ─────────────────────────────────────────────────────
    statusHistory: [StatusHistoryEntrySchema],
  },
  { timestamps: true },
);

// ─── Uniqueness: one pending/approved request per student per session ──────────
// Sparse partial indexes so null values don't collide.
AbsencePermissionSchema.index(
  { student: 1, rehearsalSession: 1 },
  {
    unique: true,
    partialFilterExpression: {
      rehearsalSession: { $exists: true, $ne: null },
      requestStatus: { $in: ["PENDING", "APPROVED"] },
    },
    name: "unique_student_session_active",
  },
);

AbsencePermissionSchema.index(
  { student: 1, event: 1 },
  {
    unique: true,
    partialFilterExpression: {
      event: { $exists: true, $ne: null },
      requestStatus: { $in: ["PENDING", "APPROVED"] },
    },
    name: "unique_student_event_active",
  },
);

// ─── Performance indexes ───────────────────────────────────────────────────────
AbsencePermissionSchema.index({ requestStatus: 1, absenceDate: -1 });
AbsencePermissionSchema.index({ requestedByParent: 1, createdAt: -1 });
AbsencePermissionSchema.index({ requestedByUser: 1, createdAt: -1 });
AbsencePermissionSchema.index({ student: 1, absenceDate: -1 });
AbsencePermissionSchema.index({ rehearsalSession: 1, requestStatus: 1 });
AbsencePermissionSchema.index({ event: 1, requestStatus: 1 });
AbsencePermissionSchema.index({ targetType: 1, absenceDate: -1 });
AbsencePermissionSchema.index({ permissionType: 1, absenceDate: -1 });

module.exports = mongoose.model("AbsencePermission", AbsencePermissionSchema);
