const mongoose = require("mongoose");
const Parent = require("../../../../../models/Parents");
const User = require("../../../../../models/User");
const Attendance = require("../../../../../models/Attendance");
const AttendanceClass = require("../../../../../models/ClassAttendance");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);
  if (!currentUser) throw new Error("No autenticado");
  return currentUser;
}

function getUserIdFromCtx(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  const id = (u && (u.id || u._id || u.userId)) || null;
  if (!id) throw new Error("No se pudo obtener userId del contexto");
  return id;
}

function parseDateRange(dateRangeInput) {
  const now = new Date();
  let from, to, presetName;

  if (!dateRangeInput || !dateRangeInput.preset) {
    from = new Date(now);
    from.setDate(from.getDate() - 90);
    to = now;
    presetName = "LAST_90_DAYS";
  } else {
    const { preset, from: customFrom, to: customTo } = dateRangeInput;

    switch (preset) {
      case "LAST_30_DAYS":
        from = new Date(now);
        from.setDate(from.getDate() - 30);
        to = now;
        presetName = "LAST_30_DAYS";
        break;
      case "LAST_90_DAYS":
        from = new Date(now);
        from.setDate(from.getDate() - 90);
        to = now;
        presetName = "LAST_90_DAYS";
        break;
      case "LAST_180_DAYS":
        from = new Date(now);
        from.setDate(from.getDate() - 180);
        to = now;
        presetName = "LAST_180_DAYS";
        break;
      case "CURRENT_YEAR":
        from = new Date(now.getFullYear(), 0, 1);
        to = now;
        presetName = "CURRENT_YEAR";
        break;
      case "ALL_TIME":
        from = new Date(0);
        to = now;
        presetName = "ALL_TIME";
        break;
      default:
        if (!customFrom || !customTo) {
          throw new Error("Custom date range requires 'from' and 'to' fields");
        }
        from = new Date(customFrom);
        to = new Date(customTo);
        presetName = "CUSTOM";
        break;
    }
  }

  return { from, to, presetName };
}

async function aggregateAttendanceMetrics(childIds, dateRange) {
  const pipeline = [
    {
      $match: {
        user: { $in: childIds.map((id) => new mongoose.Types.ObjectId(id)) },
        createdAt: { $gte: dateRange.from, $lte: dateRange.to },
      },
    },
    {
      $group: {
        _id: "$user",
        totalSessions: { $sum: 1 },
        present: {
          $sum: { $cond: [{ $eq: ["$status", "PRESENT"] }, 1, 0] },
        },
        absentJustified: {
          $sum: { $cond: [{ $eq: ["$status", "ABSENT_JUSTIFIED"] }, 1, 0] },
        },
        absentUnjustified: {
          $sum: { $cond: [{ $eq: ["$status", "ABSENT_UNJUSTIFIED"] }, 1, 0] },
        },
        late: {
          $sum: { $cond: [{ $eq: ["$status", "LATE"] }, 1, 0] },
        },
        withdrawalJustified: {
          $sum: { $cond: [{ $eq: ["$status", "JUSTIFIED_WITHDRAWAL"] }, 1, 0] },
        },
        withdrawalUnjustified: {
          $sum: {
            $cond: [{ $eq: ["$status", "UNJUSTIFIED_WITHDRAWAL"] }, 1, 0],
          },
        },
        lastRecordDate: { $max: "$createdAt" },
      },
    },
  ];

  const results = await Attendance.aggregate(pipeline);
  const metricsMap = new Map();

  results.forEach((r) => {
    const childId = r._id.toString();
    const attendanceRate =
      r.totalSessions > 0 ? (r.present / r.totalSessions) * 100 : 0;

    metricsMap.set(childId, {
      totalSessions: r.totalSessions,
      present: r.present,
      absentJustified: r.absentJustified,
      absentUnjustified: r.absentUnjustified,
      late: r.late,
      withdrawalJustified: r.withdrawalJustified,
      withdrawalUnjustified: r.withdrawalUnjustified,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
      lastRecordDate: r.lastRecordDate ? r.lastRecordDate.toISOString() : null,
    });
  });

  return metricsMap;
}

async function aggregateClassMetrics(childIds, dateRange) {
  const pipeline = [
    {
      $match: {
        student: { $in: childIds.map((id) => new mongoose.Types.ObjectId(id)) }, // ✅ AGREGAR new
        date: { $gte: dateRange.from, $lte: dateRange.to },
      },
    },
    {
      $group: {
        _id: "$student",
        totalClasses: { $sum: 1 },
        present: {
          $sum: { $cond: [{ $eq: ["$attendanceStatus", "Presente"] }, 1, 0] },
        },
        absentJustified: {
          $sum: {
            $cond: [
              { $eq: ["$attendanceStatus", "Ausencia Justificada"] },
              1,
              0,
            ],
          },
        },
        absentUnjustified: {
          $sum: {
            $cond: [
              { $eq: ["$attendanceStatus", "Ausencia No Justificada"] },
              1,
              0,
            ],
          },
        },
        totalPending: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "Pendiente"] }, 1, 0] },
        },
        totalPaid: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "Pagado"] }, 1, 0] },
        },
        totalScholarship: {
          $sum: { $cond: [{ $eq: ["$paymentStatus", "Becado"] }, 1, 0] },
        },
        lastClassDate: { $max: "$date" },
      },
    },
  ];

  const results = await AttendanceClass.aggregate(pipeline);
  const metricsMap = new Map();

  results.forEach((r) => {
    const childId = r._id.toString();
    const attendanceRate =
      r.totalClasses > 0 ? (r.present / r.totalClasses) * 100 : 0;

    metricsMap.set(childId, {
      totalClasses: r.totalClasses,
      present: r.present,
      absentJustified: r.absentJustified,
      absentUnjustified: r.absentUnjustified,
      attendanceRate: parseFloat(attendanceRate.toFixed(2)),
      paymentSummary: {
        totalPending: r.totalPending,
        totalPaid: r.totalPaid,
        totalScholarship: r.totalScholarship,
        pendingAmount: r.totalPending,
      },
      lastClassDate: r.lastClassDate ? r.lastClassDate.toISOString() : null,
    });
  });

  return metricsMap;
}

async function getRecentRehearsalAttendance(childIds, dateRange) {
  const records = await Attendance.find({
    user: { $in: childIds },
    createdAt: { $gte: dateRange.from, $lte: dateRange.to },
  })
    .sort({ createdAt: -1 })
    .limit(10 * childIds.length)
    .populate("recordedBy", "name firstSurName")
    .lean();

  const recordsMap = new Map();
  records.forEach((rec) => {
    const childId = rec.user.toString();
    if (!recordsMap.has(childId)) {
      recordsMap.set(childId, []);
    }

    const arr = recordsMap.get(childId);
    if (arr.length < 10) {
      arr.push({
        id: rec._id.toString(),
        date: rec.createdAt.toISOString(),
        status: rec.status,
        notes: rec.notes || null,
        sessionId: rec.session ? rec.session.toString() : null,
        recordedBy: rec.recordedBy
          ? `${rec.recordedBy.name} ${rec.recordedBy.firstSurName}`
          : null,
      });
    }
  });

  return recordsMap;
}

async function getRecentClassAttendance(childIds, dateRange) {
  const records = await AttendanceClass.find({
    student: { $in: childIds },
    date: { $gte: dateRange.from, $lte: dateRange.to },
  })
    .sort({ date: -1 })
    .limit(10 * childIds.length)
    .populate("instructor", "name firstSurName")
    .lean();

  const recordsMap = new Map();
  records.forEach((rec) => {
    const childId = rec.student.toString();
    if (!recordsMap.has(childId)) {
      recordsMap.set(childId, []);
    }

    const arr = recordsMap.get(childId);
    if (arr.length < 10) {
      arr.push({
        id: rec._id.toString(),
        date: rec.date.toISOString(),
        attendanceStatus: rec.attendanceStatus,
        paymentStatus: rec.paymentStatus,
        justification: rec.justification || null,
        instructorName: rec.instructor
          ? `${rec.instructor.name} ${rec.instructor.firstSurName}`
          : null,
      });
    }
  });

  return recordsMap;
}

async function getPendingPayments(childIds, dateRange) {
  const now = new Date();
  const pending = await AttendanceClass.find({
    student: { $in: childIds },
    paymentStatus: "Pendiente",
    date: { $gte: dateRange.from, $lte: dateRange.to },
  })
    .sort({ date: 1 })
    .populate("instructor", "name firstSurName")
    .lean();

  const pendingMap = new Map();
  pending.forEach((p) => {
    const childId = p.student.toString();
    if (!pendingMap.has(childId)) {
      pendingMap.set(childId, []);
    }

    const daysOverdue = Math.floor(
      (now - new Date(p.date)) / (1000 * 60 * 60 * 24),
    );

    pendingMap.get(childId).push({
      id: p._id.toString(),
      date: p.date.toISOString(),
      instructorName: p.instructor
        ? `${p.instructor.name} ${p.instructor.firstSurName}`
        : "N/A",
      daysOverdue,
    });
  });

  return pendingMap;
}

async function getParentDashboard(ctx, dateRangeInput, childIdFilter) {
  requireAuth(ctx);
  const parentId = getUserIdFromCtx(ctx);

  const parent = await Parent.findById(parentId).lean();
  if (!parent) throw new Error("Parent no encontrado");

  let childrenIds = (parent.children || []).map((id) => id.toString());
  if (childrenIds.length === 0) {
    return buildEmptyDashboard(parent, dateRangeInput);
  }

  if (childIdFilter) {
    if (!childrenIds.includes(childIdFilter)) {
      throw new Error("No autorizado: ese hijo no pertenece a este parent");
    }
    childrenIds = [childIdFilter];
  }

  const dateRange = parseDateRange(dateRangeInput);

  const children = await User.find({ _id: { $in: childrenIds } })
    .select(
      "name firstSurName secondSurName email phone avatar instrument grade state",
    )
    .lean();

  children.forEach((child) => {
    if (child.state !== "Estudiante Activo" && child.state !== "Exalumno") {
      throw new Error(
        `Usuario ${child._id} no es estudiante y no puede ser hijo`,
      );
    }
  });

  const [
    attendanceMetricsMap,
    classMetricsMap,
    recentRehearsalMap,
    recentClassMap,
    pendingPaymentsMap,
  ] = await Promise.all([
    aggregateAttendanceMetrics(childrenIds, dateRange),
    aggregateClassMetrics(childrenIds, dateRange),
    getRecentRehearsalAttendance(childrenIds, dateRange),
    getRecentClassAttendance(childrenIds, dateRange),
    getPendingPayments(childrenIds, dateRange),
  ]);

  const childDashboards = children.map((child) => {
    const childId = child._id.toString();

    const attendanceMetrics = attendanceMetricsMap.get(childId) || {
      totalSessions: 0,
      present: 0,
      absentJustified: 0,
      absentUnjustified: 0,
      late: 0,
      withdrawalJustified: 0,
      withdrawalUnjustified: 0,
      attendanceRate: 0,
      lastRecordDate: null,
    };

    const classMetrics = classMetricsMap.get(childId) || {
      totalClasses: 0,
      present: 0,
      absentJustified: 0,
      absentUnjustified: 0,
      attendanceRate: 0,
      paymentSummary: {
        totalPending: 0,
        totalPaid: 0,
        totalScholarship: 0,
        pendingAmount: 0,
      },
      lastClassDate: null,
    };

    return {
      child: {
        id: childId,
        name: child.name,
        firstSurName: child.firstSurName,
        secondSurName: child.secondSurName,
        email: child.email || null,
        phone: child.phone || null,
        avatar: child.avatar || null,
        instrument: child.instrument || null,
        grade: child.grade || null,
        state: child.state,
      },
      attendanceMetrics,
      classMetrics,
      recentRehearsalAttendance: recentRehearsalMap.get(childId) || [],
      recentClassAttendance: recentClassMap.get(childId) || [],
      pendingPayments: pendingPaymentsMap.get(childId) || [],
    };
  });

  return {
    parent: {
      id: parent._id.toString(),
      name: parent.name,
      firstSurName: parent.firstSurName,
      secondSurName: parent.secondSurName,
      email: parent.email,
      phone: parent.phone || null,
      avatar: parent.avatar || null,
      totalChildren: parent.children.length,
    },
    children: childDashboards,
    dateRange: {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
      presetName: dateRange.presetName,
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildEmptyDashboard(parent, dateRangeInput) {
  const dateRange = parseDateRange(dateRangeInput);

  return {
    parent: {
      id: parent._id.toString(),
      name: parent.name,
      firstSurName: parent.firstSurName,
      secondSurName: parent.secondSurName,
      email: parent.email,
      phone: parent.phone || null,
      avatar: parent.avatar || null,
      totalChildren: 0,
    },
    children: [],
    dateRange: {
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
      presetName: dateRange.presetName,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getParentDashboard,
};
