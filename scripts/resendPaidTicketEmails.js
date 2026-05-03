"use strict";

require("dotenv").config({ path: "./config/.env" });

const mongoose = require("mongoose");
const dbConnection = require("../config/database");
const { Ticket } = require("../models/Tickets");
const { EventTicket } = require("../models/EventTicket");
const ticketsService = require("../src/graphql/modules/tickets/services/tickets.service");

function parseArgs(argv) {
  const args = {
    dryRun: true,
    includeAlreadySent: true,
    allEvents: false,
    eventId: null,
    eventName: null,
    limit: 0,
    source: "all",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--send") args.dryRun = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--all-events") args.allEvents = true;
    else if (arg === "--event-id") {
      args.eventId = next;
      i += 1;
    } else if (arg === "--event-name") {
      args.eventName = next;
      i += 1;
    } else if (arg === "--limit") {
      args.limit = Number(next || 0);
      i += 1;
    } else if (arg === "--source") {
      args.source = String(next || "all").trim();
      i += 1;
    } else if (arg === "--only-not-sent") {
      args.includeAlreadySent = false;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Resend paid ticket emails.

Usage:
  npm run tickets:resend-paid -- --event-id <id>
  npm run tickets:resend-paid -- --event-name "Show de Comedia" --send
  npm run tickets:resend-paid -- --all-events --only-not-sent

Options:
  --event-id <id>       Resend tickets for a specific event id.
  --event-name <text>   Resend tickets for events whose name matches text.
  --all-events          Allow all events. Required when no event filter is used.
  --send                Actually send emails. Default is dry-run.
  --dry-run             Preview recipients without sending. Default.
  --only-not-sent       Skip tickets with paymentEmailSentAt already set.
  --source <value>      all, excel_import, or manual. Default: all.
  --limit <number>      Stop after this many tickets.
`);
}

function buildAdminContext() {
  return {
    user: {
      _id: null,
      id: null,
      role: "Admin",
      email: "script@bandacedesdonbosco.local",
      name: "Ticket resend script",
    },
  };
}

async function resolveEventIds({ eventId, eventName, allEvents }) {
  if (eventId) return [eventId];

  if (eventName) {
    const events = await EventTicket.find({
      name: { $regex: eventName, $options: "i" },
    })
      .select("_id name date")
      .lean();

    if (!events.length) {
      throw new Error(`No events matched --event-name "${eventName}"`);
    }

    console.log("Matched events:");
    events.forEach((event) => {
      console.log(`- ${event._id}: ${event.name}`);
    });

    return events.map((event) => event._id);
  }

  if (allEvents) return null;

  throw new Error("Use --event-id, --event-name, or --all-events");
}

function buildTicketQuery({ eventIds, includeAlreadySent, source }) {
  const query = {
    paid: true,
    status: { $ne: "cancelled" },
    $or: [
      { buyerEmail: { $exists: true, $ne: "" } },
      { userId: { $exists: true, $ne: null } },
    ],
  };

  if (eventIds) query.eventId = { $in: eventIds };
  if (!includeAlreadySent) {
    query.$and = [
      {
        $or: [
          { paymentEmailSentAt: { $exists: false } },
          { paymentEmailSentAt: null },
        ],
      },
    ];
  }
  if (source !== "all") query.source = source;

  return query;
}

function describeTicket(ticket) {
  const eventName = ticket.eventId?.name || ticket.eventId?.toString() || "";
  return [
    ticket._id.toString(),
    eventName,
    ticket.buyerEmail,
    ticket.buyerName || "Sin nombre",
    `${ticket.ticketQuantity || 1} entrada(s)`,
    ticket.source || "manual",
  ].join(" | ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!["all", "excel_import", "manual"].includes(args.source)) {
    throw new Error("--source must be all, excel_import, or manual");
  }

  await dbConnection();

  const eventIds = await resolveEventIds(args);
  const query = buildTicketQuery({
    eventIds,
    includeAlreadySent: args.includeAlreadySent,
    source: args.source,
  });

  let cursorQuery = Ticket.find(query)
    .populate({ path: "eventId", select: "name date description" })
    .sort({ createdAt: 1 });

  if (Number.isInteger(args.limit) && args.limit > 0) {
    cursorQuery = cursorQuery.limit(args.limit);
  }

  const tickets = await cursorQuery;

  console.log(`Found ${tickets.length} paid ticket(s) with recipient email.`);
  if (args.dryRun) {
    console.log("Dry-run only. Add --send to send emails.");
  }

  const ctx = buildAdminContext();
  let sent = 0;
  let failed = 0;

  for (const ticket of tickets) {
    const line = describeTicket(ticket);

    if (args.dryRun) {
      console.log(`[DRY] ${line}`);
      continue;
    }

    try {
      if (ticket.source === "excel_import") {
        await ticketsService.resendImportedTicketEmail(
          { ticketId: ticket._id },
          ctx,
        );
      } else {
        await ticketsService.resendTicketEmail({ ticketId: ticket._id }, ctx);
      }

      sent += 1;
      console.log(`[SENT] ${line}`);
    } catch (error) {
      failed += 1;
      console.error(`[FAIL] ${line}`);
      console.error(`       ${error.message}`);
    }
  }

  console.log(`Done. sent=${sent} failed=${failed} dryRun=${args.dryRun}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
