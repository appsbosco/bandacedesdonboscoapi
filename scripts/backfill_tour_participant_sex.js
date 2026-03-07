// scripts/backfill_tour_participant_sex.js
// Ensures all TourParticipant documents have the sex field set.
// Documents without sex get the default "UNKNOWN".
// Safe to run multiple times (idempotent).

require("dotenv").config();
const mongoose = require("mongoose");
const dbConnection = require("../config/database");

async function backfill() {
  await dbConnection();
  const db = mongoose.connection.db;
  const collection = db.collection("tourparticipants");

  // Find all docs where sex field is missing
  const cursor = collection.find({ sex: { $exists: false } });
  let updated = 0;

  for await (const doc of cursor) {
    await collection.updateOne(
      { _id: doc._id },
      { $set: { sex: "UNKNOWN" } },
    );
    updated++;
  }

  console.log(`Backfill complete. Updated ${updated} TourParticipant document(s).`);
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
