"use strict";

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Attendance = require("../models/Attendance");
const RehearsalSession = require("../models/RehearsalSession");

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 500);
const dryRun = process.argv.includes("--dry-run");
const includeExisting = process.argv.includes("--all");

function sameTime(a, b) {
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

async function main() {
  await connectDB();

  const query = includeExisting
    ? {}
    : { $or: [{ attendanceDate: { $exists: false } }, { attendanceDate: null }] };

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let missingSessionFallbacks = 0;
  let lastId = null;

  while (true) {
    const pageQuery = lastId ? { ...query, _id: { $gt: lastId } } : query;
    const attendances = await Attendance.find(pageQuery)
      .select("_id session legacyDate createdAt attendanceDate")
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (attendances.length === 0) break;
    scanned += attendances.length;
    lastId = attendances[attendances.length - 1]._id;

    const sessionIds = [...new Set(attendances.map((a) => String(a.session)).filter(Boolean))];
    const sessions = await RehearsalSession.find({ _id: { $in: sessionIds } })
      .select("_id date dateNormalized")
      .lean();
    const sessionsById = new Map(sessions.map((s) => [String(s._id), s]));

    const ops = [];
    for (const attendance of attendances) {
      const session = sessionsById.get(String(attendance.session));
      const attendanceDate =
        attendance.legacyDate ||
        session?.dateNormalized ||
        session?.date ||
        attendance.createdAt ||
        null;

      if (!attendanceDate) {
        skipped += 1;
        continue;
      }

      if (!session) missingSessionFallbacks += 1;
      if (sameTime(attendance.attendanceDate, attendanceDate)) {
        skipped += 1;
        continue;
      }

      ops.push({
        updateOne: {
          filter: { _id: attendance._id },
          update: { $set: { attendanceDate } },
        },
      });
    }

    if (ops.length > 0) {
      if (!dryRun) await Attendance.bulkWrite(ops, { ordered: false });
      updated += ops.length;
    }

    console.log(
      `[backfillAttendanceDate] scanned=${scanned} updated=${updated} skipped=${skipped}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        includeExisting,
        scanned,
        updated,
        skipped,
        missingSessionFallbacks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[backfillAttendanceDate] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
