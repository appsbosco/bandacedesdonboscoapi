/**
 * scripts/normalize_user_bands.js
 *
 * 1. Maps variant band name strings to canonical display names from Ensemble registry.
 * 2. Removes duplicates.
 * 3. Ensures "Banda de marcha" is always present.
 *
 * Safe to re-run (idempotent).
 * Run: node scripts/normalize_user_bands.js
 */

require("dotenv").config({ path: "./config/.env" });
const mongoose = require("mongoose");
const dbConnection = require("../config/database");
const User = require("../models/User");
const { normalizeBandsArray } = require("../src/utils/ensembleRegistry");

async function normalize() {
  await dbConnection();
  console.log("Connected. Running bands normalization…\n");

  const users = await User.find({}).select("_id name firstSurName bands").lean();
  console.log(`Processing ${users.length} user(s).\n`);

  let changedCount = 0;
  let unchangedCount = 0;
  let unknownBands = new Set();

  for (const user of users) {
    const original = user.bands || [];
    const normalized = normalizeBandsArray(original);

    // Detect unknown values (ones that got dropped)
    const originalNormNames = new Set(normalized);
    for (const b of original) {
      if (b && !originalNormNames.has(b)) {
        unknownBands.add(b);
      }
    }

    // Check if anything changed (order doesn't matter for comparison)
    const originalSet = new Set(original);
    const normalizedSet = new Set(normalized);
    const changed =
      originalSet.size !== normalizedSet.size ||
      [...normalizedSet].some((n) => !originalSet.has(n));

    if (changed) {
      await User.findByIdAndUpdate(user._id, { $set: { bands: normalized } });
      changedCount++;
      console.log(`  [~] ${user.firstSurName} ${user.name}:`);
      console.log(`      Before: [${original.join(", ")}]`);
      console.log(`      After:  [${normalized.join(", ")}]`);
    } else {
      unchangedCount++;
    }
  }

  console.log("\n── Normalization complete ──────────────────────────────────");
  console.log(`   Users updated:   ${changedCount}`);
  console.log(`   Users unchanged: ${unchangedCount}`);
  if (unknownBands.size > 0) {
    console.log(`\n   Unknown band strings (dropped):`);
    for (const b of unknownBands) {
      console.log(`     - "${b}"`);
    }
    console.log("   ⚠ Add these to ensembleRegistry.js VARIANT_MAP if needed.");
  }
  console.log("────────────────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

normalize().catch((err) => {
  console.error("Normalization failed:", err);
  process.exit(1);
});
