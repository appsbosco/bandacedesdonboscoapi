/**
 * scripts/backfill_user_marching_band.js
 *
 * Ensures every user has "Banda de marcha" in their bands array.
 * Safe to run multiple times (uses $addToSet).
 *
 * Run: node scripts/backfill_user_marching_band.js
 */

require("dotenv").config({ path: "./config/.env" });
const mongoose = require("mongoose");
const dbConnection = require("../config/database");
const User = require("../models/User");

const MARCHING_NAME = "Banda de marcha";

async function backfill() {
  await dbConnection();
  console.log("Connected. Running marching band backfill…\n");

  // Find users missing marching band
  const missing = await User.find({
    $nor: [{ bands: MARCHING_NAME }],
  }).select("_id name firstSurName bands").lean();

  console.log(`Found ${missing.length} user(s) missing "${MARCHING_NAME}".`);

  if (missing.length === 0) {
    console.log("Nothing to do.\n");
    await mongoose.disconnect();
    return;
  }

  // Bulk update
  const result = await User.updateMany(
    { $nor: [{ bands: MARCHING_NAME }] },
    { $addToSet: { bands: MARCHING_NAME } }
  );

  console.log(`Updated ${result.modifiedCount} user(s).`);
  console.log("\nSample of updated users:");
  for (const u of missing.slice(0, 10)) {
    console.log(`  - ${u.firstSurName} ${u.name} (${u._id}): bands was [${(u.bands || []).join(", ")}]`);
  }
  if (missing.length > 10) console.log(`  … and ${missing.length - 10} more.`);

  console.log("\nBackfill complete.\n");
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
