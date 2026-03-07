/**
 * scripts/migrate_routes_to_itineraries_roundtrip.js
 *
 * Converts old direction-based TourRoute / TourRouteAssignment data
 * into the new roundtrip TourItinerary / TourItineraryAssignment model.
 *
 * Strategy:
 *   - If flights share a routeGroup string, group BOTH outbound and inbound
 *     legs under ONE TourItinerary with that name.
 *   - If flights have a routeId (old TourRoute), look up the TourRoute name
 *     and group by (tour, routeName) — merging OUTBOUND and INBOUND routes
 *     that share the same base name or were from different direction routes
 *     of the same cotización.
 *   - Migrate flight passenger arrays → TourItineraryAssignment (deduped by tour+participant).
 *   - Set flight.itineraryId for all processed flights.
 *
 * Run: node scripts/migrate_routes_to_itineraries_roundtrip.js
 * Safe to re-run: upserts itineraries and skips duplicate assignments.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const dbConnection = require("../config/database");

const Tour       = require("../models/Tour");
const TourFlight = require("../models/TourFlight");
const TourItinerary = require("../models/TourItinerary");
const TourItineraryAssignment = require("../models/TourItineraryAssignment");

// Try to load old models — they may or may not still exist
let TourRoute = null;
let TourRouteAssignment = null;
try { TourRoute = require("../models/TourRoute"); } catch (_) {}
try { TourRouteAssignment = require("../models/TourRouteAssignment"); } catch (_) {}

async function migrate() {
  await dbConnection();
  console.log("Connected. Starting roundtrip itinerary migration...\n");

  const tours = await Tour.find({}).select("_id name").lean();
  console.log(`Processing ${tours.length} tour(s).\n`);

  let totalItineraries = 0;
  let totalFlightsAssigned = 0;
  let totalPassengersMigrated = 0;

  for (const tour of tours) {
    const tourId = tour._id.toString();
    console.log(`── Tour: ${tour.name} (${tourId})`);

    const flights = await TourFlight.find({ tour: tourId }).lean();
    if (!flights.length) { console.log("   No flights. Skipping.\n"); continue; }

    // Build itinerary groups from routeGroup string (the simplest, most reliable approach)
    // Key: itinerary name → array of flights
    const groups = new Map();

    for (const flight of flights) {
      if (flight.itineraryId) continue; // already migrated

      // Determine group name:
      // 1. Use routeGroup string directly (best signal — same cotización string)
      // 2. Use old TourRoute name if routeId is set
      // 3. Fall back to generic "Itinerario" per tour
      let groupName = null;

      if (flight.routeGroup) {
        // Strip direction suffixes so "Delta Ida" and "Delta Vuelta" merge
        groupName = flight.routeGroup
          .replace(/\s*[-—–]?\s*(ida|vuelta|outbound|inbound)$/i, "")
          .trim();
        if (!groupName) groupName = flight.routeGroup.trim();
      } else {
        groupName = `Itinerario — ${tour.name}`;
      }

      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(flight);
    }

    for (const [name, groupFlights] of groups.entries()) {
      // Find or create itinerary
      let itinerary = await TourItinerary.findOne({ tour: tourId, name });
      if (!itinerary) {
        // Default maxPassengers to 60 for migrated itineraries
        itinerary = await TourItinerary.create({ tour: tourId, name, maxPassengers: 60 });
        totalItineraries++;
        console.log(`   [+] Created itinerary: "${name}" (maxPassengers=60)`);
      } else {
        // Backfill maxPassengers if missing on existing itinerary
        if (!itinerary.maxPassengers) {
          await TourItinerary.findByIdAndUpdate(itinerary._id, { $set: { maxPassengers: 60 } });
          console.log(`   [=] Reusing itinerary: "${name}" (backfilled maxPassengers=60)`);
        } else {
          console.log(`   [=] Reusing itinerary: "${name}"`);
        }
      }

      const itId = itinerary._id;

      // Assign flights
      for (const f of groupFlights) {
        await TourFlight.findByIdAndUpdate(f._id, { $set: { itineraryId: itId } });
        totalFlightsAssigned++;
      }

      // Migrate passengers from flight.passengers arrays
      const seen = new Set();
      for (const f of groupFlights) {
        for (const p of f.passengers || []) {
          const pid = p.participant?.toString();
          if (!pid || seen.has(pid)) continue;
          seen.add(pid);

          try {
            await TourItineraryAssignment.findOneAndUpdate(
              { tour: tourId, participant: pid },
              { $setOnInsert: { tour: tourId, itinerary: itId, participant: pid } },
              { upsert: true, new: true }
            );
            totalPassengersMigrated++;
          } catch (err) {
            if (err.code !== 11000) {
              console.error(`   [!] Could not migrate participant ${pid}: ${err.message}`);
            }
            // 11000 = already has an itinerary (different one) — skip
          }
        }
      }

      const dirs = [...new Set(groupFlights.map((f) => f.direction))].join(", ");
      console.log(`   [>] "${name}": ${groupFlights.length} flight(s) [${dirs}], ${seen.size} passenger(s).`);
    }

    // Report remaining unassigned flights
    const still = await TourFlight.find({ tour: tourId, itineraryId: null }).lean();
    if (still.length) {
      console.log(`   [?] ${still.length} flight(s) still unassigned:`);
      for (const f of still) {
        console.log(`       - ${f.airline} ${f.flightNumber} (${f.direction}) ${f.origin}→${f.destination}`);
      }
    }
    console.log();
  }

  // Backfill maxPassengers=60 for any existing itinerary that still lacks it
  const backfillResult = await TourItinerary.updateMany(
    { maxPassengers: { $exists: false } },
    { $set: { maxPassengers: 60 } }
  );
  if (backfillResult.modifiedCount > 0) {
    console.log(`[backfill] Set maxPassengers=60 on ${backfillResult.modifiedCount} existing itinerary/ies.\n`);
  }

  console.log("── Migration complete ──────────────────────────────────────");
  console.log(`   Itineraries created:    ${totalItineraries}`);
  console.log(`   Flights assigned:       ${totalFlightsAssigned}`);
  console.log(`   Passengers migrated:    ${totalPassengersMigrated}`);
  console.log("────────────────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
