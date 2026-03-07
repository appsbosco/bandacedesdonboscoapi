/**
 * scripts/migrate_flight_passengers_to_routes.js
 *
 * Migrates the old routeGroup-based passenger assignments to the new
 * TourRoute / TourRouteAssignment model.
 *
 * For each tour:
 *   1. Groups flights by routeGroup (or direction if no routeGroup).
 *   2. Creates a TourRoute for each unique group.
 *   3. Assigns flights to their TourRoute (sets flight.routeId).
 *   4. Migrates flight.passengers → TourRouteAssignments.
 *   5. Prints a report.
 *
 * Run: node scripts/migrate_flight_passengers_to_routes.js
 * Safe to re-run: skips routes/assignments that already exist.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const dbConnection = require("../config/database");

const Tour = require("../models/Tour");
const TourFlight = require("../models/TourFlight");
const TourRoute = require("../models/TourRoute");
const TourRouteAssignment = require("../models/TourRouteAssignment");

async function migrate() {
  await dbConnection();
  console.log("Connected to database.");

  const tours = await Tour.find({}).select("_id name").lean();
  console.log(`Found ${tours.length} tour(s) to process.\n`);

  let totalRoutesCreated = 0;
  let totalFlightsAssigned = 0;
  let totalPassengersMigrated = 0;
  let totalUnassigned = 0;

  for (const tour of tours) {
    const tourId = tour._id.toString();
    console.log(`\n── Tour: ${tour.name} (${tourId})`);

    const flights = await TourFlight.find({ tour: tourId }).lean();
    if (flights.length === 0) {
      console.log("   No flights. Skipping.");
      continue;
    }

    // Separate already-assigned flights
    const unassigned = flights.filter((f) => !f.routeId);
    const alreadyAssigned = flights.filter((f) => f.routeId);
    console.log(`   Flights: ${flights.length} total, ${alreadyAssigned.length} already assigned, ${unassigned.length} to process.`);

    // Group unassigned flights by routeGroup + direction
    // Key: routeGroup if present, else `${direction}` as fallback
    const groups = new Map();
    for (const flight of unassigned) {
      const groupKey = flight.routeGroup
        ? `rg:${flight.routeGroup}`
        : `dir:${flight.direction}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, { routeGroup: flight.routeGroup, direction: flight.direction, flights: [] });
      }
      groups.get(groupKey).flights.push(flight);
    }

    for (const [groupKey, group] of groups.entries()) {
      // Determine route direction: CONNECTING flights belong to their parent direction
      // If group is all CONNECTING, try to infer from routeGroup name, default to OUTBOUND
      let routeDirection = group.direction;
      if (routeDirection === "CONNECTING") {
        const hasOutbound = group.flights.some((f) => f.direction === "OUTBOUND");
        const hasInbound = group.flights.some((f) => f.direction === "INBOUND");
        routeDirection = hasInbound ? "INBOUND" : "OUTBOUND";
      }

      // If direction is CONNECTING but no other direction in the group, skip — can't determine
      // Actually group is keyed by routeGroup, so the group may have mixed directions
      // Determine from majority or from non-CONNECTING flights
      const primaryFlights = group.flights.filter((f) => f.direction !== "CONNECTING");
      if (primaryFlights.length > 0) {
        const directions = new Set(primaryFlights.map((f) => f.direction));
        // If mixed OUTBOUND+INBOUND in same routeGroup (shouldn't happen), default to OUTBOUND
        routeDirection = directions.has("OUTBOUND") ? "OUTBOUND" : "INBOUND";
      }

      // Determine a name for this route
      const sortedFlights = [...group.flights].sort((a, b) => new Date(a.departureAt) - new Date(b.departureAt));
      const origin = sortedFlights[0]?.origin;
      const destination = sortedFlights[sortedFlights.length - 1]?.destination;
      const routeName = group.routeGroup || `${routeDirection === "OUTBOUND" ? "Ida" : "Vuelta"} — ${origin || "?"}→${destination || "?"}`;

      // Check if a route with this name already exists for this tour+direction
      let route = await TourRoute.findOne({ tour: tourId, name: routeName, direction: routeDirection });
      if (!route) {
        route = await TourRoute.create({
          tour: tourId,
          name: routeName,
          direction: routeDirection,
          origin: origin || undefined,
          destination: destination || undefined,
        });
        totalRoutesCreated++;
        console.log(`   [+] Created route: "${routeName}" (${routeDirection})`);
      } else {
        console.log(`   [=] Reusing route: "${routeName}" (${routeDirection})`);
      }

      // Assign flights to this route
      for (const flight of group.flights) {
        if (flight.routeId) continue; // already assigned in a previous run
        await TourFlight.findByIdAndUpdate(flight._id, { $set: { routeId: route._id } });
        totalFlightsAssigned++;
      }

      // Migrate passengers from flights to route assignments
      const allPassengerIds = new Set();
      for (const flight of group.flights) {
        for (const p of flight.passengers || []) {
          allPassengerIds.add(p.participant.toString());
        }
      }

      for (const participantId of allPassengerIds) {
        try {
          await TourRouteAssignment.findOneAndUpdate(
            { route: route._id, participant: participantId },
            {
              $setOnInsert: {
                tour: tourId,
                route: route._id,
                direction: routeDirection,
                participant: participantId,
              },
            },
            { upsert: true, new: true }
          );
          totalPassengersMigrated++;
        } catch (err) {
          if (err.code !== 11000) {
            console.error(`   [!] Failed to migrate passenger ${participantId}: ${err.message}`);
          }
          // 11000 = duplicate key (already migrated), safe to ignore
        }
      }

      console.log(`   [>] "${routeName}": ${group.flights.length} flight(s), ${allPassengerIds.size} passenger assignment(s).`);
    }

    // Report on flights that could not be grouped
    const stillUnassigned = await TourFlight.find({ tour: tourId, routeId: null }).lean();
    if (stillUnassigned.length > 0) {
      console.log(`   [?] ${stillUnassigned.length} flight(s) still unassigned after migration:`);
      for (const f of stillUnassigned) {
        console.log(`       - ${f.airline} ${f.flightNumber} (${f.direction}) ${f.origin}→${f.destination}`);
      }
      totalUnassigned += stillUnassigned.length;
    }
  }

  console.log("\n── Migration complete ──────────────────────────────────────");
  console.log(`   Routes created:       ${totalRoutesCreated}`);
  console.log(`   Flights assigned:     ${totalFlightsAssigned}`);
  console.log(`   Passengers migrated:  ${totalPassengersMigrated}`);
  console.log(`   Still unassigned:     ${totalUnassigned}`);
  console.log("────────────────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
