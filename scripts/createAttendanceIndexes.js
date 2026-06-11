"use strict";

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Attendance = require("../models/Attendance");

function sameKeyPattern(a = {}, b = {}) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  await connectDB();

  const collection = Attendance.collection;
  const indexes = [
    {
      keys: { attendanceDate: -1, _id: -1 },
      options: { name: "attendanceDate_desc_id_desc" },
    },
    {
      keys: { user: 1, attendanceDate: -1 },
      options: { name: "user_1_attendanceDate_desc" },
    },
    {
      keys: { session: 1, user: 1 },
      options: { unique: true, name: "session_1_user_1_unique" },
    },
    {
      keys: { session: 1, status: 1 },
      options: { name: "session_1_status_1" },
    },
    {
      keys: { status: 1, attendanceDate: -1 },
      options: { name: "status_1_attendanceDate_desc" },
    },
  ];

  const existingIndexes = await collection.indexes();

  for (const { keys, options } of indexes) {
    const existing = existingIndexes.find((index) => sameKeyPattern(index.key, keys));
    if (existing) {
      console.log(
        `[createAttendanceIndexes] exists ${existing.name} for ${JSON.stringify(keys)}`,
      );
      continue;
    }

    try {
      const name = await collection.createIndex(keys, { background: true, ...options });
      console.log(`[createAttendanceIndexes] created ${name}`);
    } catch (error) {
      if (error?.code === 85) {
        console.log(
          `[createAttendanceIndexes] exists with different name for ${JSON.stringify(keys)}`,
        );
        continue;
      }
      throw error;
    }
  }
}

main()
  .catch((error) => {
    console.error("[createAttendanceIndexes] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
