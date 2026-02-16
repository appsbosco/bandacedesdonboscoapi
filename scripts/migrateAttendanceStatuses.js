// scripts/migrateAttendanceStatuses.js
const mongoose = require("mongoose");
require("dotenv").config();

async function migrateStatuses() {
  await mongoose.connect(process.env.MONGO_URI);

  const Attendance = mongoose.model(
    "Attendance",
    new mongoose.Schema({}, { strict: false }),
    "attendanceRecords",
  );

  // Mapeo correcto de estados actuales → estados finales
  const migrations = [
    {
      from: "JUSTIFIED_ABSENCE",
      to: "ABSENT_JUSTIFIED",
    },
    {
      from: "UNJUSTIFIED_ABSENCE",
      to: "ABSENT_UNJUSTIFIED",
    },
    // UNJUSTIFIED_WITHDRAWAL y PRESENT ya están correctos
  ];

  for (const { from, to } of migrations) {
    const result = await Attendance.updateMany(
      { status: from },
      { $set: { status: to } },
    );
    console.log(`✓ Migrated ${result.modifiedCount} records: ${from} → ${to}`);
  }

  console.log("\n✅ Migration complete!");

  // Verificar estados finales
  const finalStatuses = await Attendance.distinct("status");
  console.log("\n📊 Estados después de migración:");
  console.log(finalStatuses);

  await mongoose.disconnect();
}

migrateStatuses().catch(console.error);
