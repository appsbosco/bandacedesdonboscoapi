"use strict";

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Attendance = require("../models/Attendance");
const RehearsalSession = require("../models/RehearsalSession");
const User = require("../models/User");

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 500);
const commit = process.argv.includes("--commit");
const includeSessionOrphans = !process.argv.includes("--users-only");
const MAX_PRINT_IDS = Number(process.env.MAX_PRINT_IDS || 50);

async function existingIdSet(Model, ids) {
  const docs = await Model.find({ _id: { $in: ids } }).select("_id").lean();
  return new Set(docs.map((doc) => String(doc._id)));
}

async function main() {
  await connectDB();

  let scanned = 0;
  let userOrphans = 0;
  let sessionOrphans = 0;
  let deleted = 0;
  let lastId = null;
  const affectedIds = [];

  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const attendances = await Attendance.find(query)
      .select("_id user session")
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (attendances.length === 0) break;
    scanned += attendances.length;
    lastId = attendances[attendances.length - 1]._id;

    const userIds = [...new Set(attendances.map((a) => String(a.user)).filter(Boolean))];
    const sessionIds = [...new Set(attendances.map((a) => String(a.session)).filter(Boolean))];
    const users = await existingIdSet(User, userIds);
    const sessions = includeSessionOrphans
      ? await existingIdSet(RehearsalSession, sessionIds)
      : new Set(sessionIds);

    const orphanIds = [];
    for (const attendance of attendances) {
      const missingUser = !attendance.user || !users.has(String(attendance.user));
      const missingSession = includeSessionOrphans
        ? !attendance.session || !sessions.has(String(attendance.session))
        : false;

      if (missingUser) userOrphans += 1;
      if (missingSession) sessionOrphans += 1;

      if (missingUser || missingSession) {
        orphanIds.push(attendance._id);
        if (affectedIds.length < MAX_PRINT_IDS) affectedIds.push(String(attendance._id));
      }
    }

    if (commit && orphanIds.length > 0) {
      const result = await Attendance.deleteMany({ _id: { $in: orphanIds } });
      deleted += result.deletedCount || 0;
    }

    console.log(
      `[cleanupOrphanAttendances] scanned=${scanned} orphans=${userOrphans + sessionOrphans} deleted=${deleted}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: commit ? "commit" : "dryRun",
        scanned,
        userOrphans,
        sessionOrphans,
        deleted,
        affectedIdsPreview: affectedIds,
        nextStep: commit ? "done" : "Run again with --commit to delete these records.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[cleanupOrphanAttendances] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
