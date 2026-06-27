"use strict";

const Attendance = require("../../../../../models/Attendance");
const AttendanceReminderNotificationLog = require("../../../../../models/AttendanceReminderNotificationLog");
const Event = require("../../../../../models/Events");
const RehearsalSession = require("../../../../../models/RehearsalSession");
const User = require("../../../../../models/User");
const { normalizeDateToStartOfDayCR } = require("../../../../../utils/dates");
const { inferSectionFromInstrument } = require("../../../../../utils/sections");
const { dispatchToTokens } = require("../../../notifications/notification.dispatcher");
const { EVENTS } = require("../../../notifications/notification.templates");
const { normalizeNotificationTokens } = require("../../../notifications/token.repository");

const DEFAULT_TIMEZONE = "America/Costa_Rica";
const REMINDER_TYPE = "attendance_reminder";
const SECTION_LEADER_ROLES = ["Asistente de sección", "Principal de sección"];
const ATTENDANCE_SECTIONS = [
  "FLAUTAS",
  "CLARINETES",
  "SAXOFONES",
  "TROMPETAS",
  "TROMBONES",
  "TUBAS",
  "EUFONIOS",
  "CORNOS",
  "MALLETS",
  "PERCUSION",
  "COLOR_GUARD",
  "DANZA",
];

function getTimezone() {
  return process.env.ATTENDANCE_REMINDER_TIMEZONE || DEFAULT_TIMEZONE;
}

function getDatePartsInTimezone(date = new Date(), timeZone = getTimezone()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function getDateKeyCR(date = new Date()) {
  const parts = getDatePartsInTimezone(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getReminderSlotCR(date = new Date()) {
  const parts = getDatePartsInTimezone(date);
  return `${parts.hour}:00`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isEnabled() {
  return process.env.ATTENDANCE_REMINDER_ENABLED === "true";
}

function isPastMaxHour(now = new Date()) {
  const maxHour = Number(process.env.ATTENDANCE_REMINDER_MAX_HOUR_CR || 21);
  if (!Number.isFinite(maxHour)) return false;
  const hour = Number(getDatePartsInTimezone(now).hour);
  return Number.isFinite(hour) && hour > maxHour;
}

function groupLeadersBySection(users = []) {
  const map = new Map();
  for (const user of users) {
    const section = inferSectionFromInstrument(user.instrument);
    if (!section) continue;
    if (!map.has(section)) map.set(section, []);
    map.get(section).push(user);
  }
  return map;
}

function buildRecipientTokenMap(recipients = []) {
  const recipientTokens = new Map();
  for (const recipient of recipients) {
    const tokens = normalizeNotificationTokens(recipient.notificationTokens || []);
    if (tokens.length) recipientTokens.set(String(recipient._id), tokens);
  }
  return recipientTokens;
}

function uniqueById(users = []) {
  const seen = new Set();
  const result = [];
  for (const user of users) {
    const id = String(user._id);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(user);
  }
  return result;
}

async function reserveReminderLogs({ eventId, recipients, dateKey, reminderSlot }) {
  if (!recipients.length) {
    return { reservedRecipientIds: new Set(), skippedDuplicates: 0 };
  }

  const now = new Date();
  const operations = recipients.map((recipient) => ({
    updateOne: {
      filter: {
        event: eventId,
        recipientUser: recipient._id,
        dateKey,
        type: REMINDER_TYPE,
        reminderSlot,
      },
      update: {
        $setOnInsert: {
          event: eventId,
          recipientUser: recipient._id,
          dateKey,
          type: REMINDER_TYPE,
          reminderSlot,
          createdAt: now,
        },
      },
      upsert: true,
    },
  }));

  const writeResult = await AttendanceReminderNotificationLog.bulkWrite(operations, {
    ordered: false,
  });

  const upsertedIds = writeResult.upsertedIds || {};
  const insertedIndexes = Object.keys(upsertedIds).map((key) => Number(key));
  const reservedRecipientIds = new Set(
    insertedIndexes
      .map((index) => recipients[index])
      .filter(Boolean)
      .map((recipient) => String(recipient._id)),
  );

  return {
    reservedRecipientIds,
    skippedDuplicates: recipients.length - reservedRecipientIds.size,
  };
}

async function markReservedLogsWithError({ eventId, recipientIds, dateKey, reminderSlot, error }) {
  if (!recipientIds.length) return;
  await AttendanceReminderNotificationLog.updateMany(
    {
      event: eventId,
      recipientUser: { $in: recipientIds },
      dateKey,
      type: REMINDER_TYPE,
      reminderSlot,
    },
    {
      $set: {
        error: String(error || "Unknown notification error").slice(0, 1000),
      },
    },
  ).catch((err) => {
    console.warn("[attendance-reminder] No se pudo guardar error en logs", err.message);
  });
}

async function getTodayRehearsals({ dateStart, dateEnd, eventId }) {
  const query = {
    category: "rehearsal",
    date: { $gte: dateStart, $lt: dateEnd },
  };
  if (eventId) query._id = eventId;
  return Event.find(query)
    .select("_id title date time category")
    .sort({ date: 1, _id: 1 })
    .lean();
}

async function getMissingSectionsForDate(dateStart) {
  // RehearsalSession no referencia Event en el modelo actual. El vínculo posible
  // es el día normalizado CR: si hay un Event rehearsal hoy, cada sección debe
  // tener registros de Attendance en su RehearsalSession de ese día.
  const sessions = await RehearsalSession.find({
    dateNormalized: dateStart,
    section: { $in: ATTENDANCE_SECTIONS },
  })
    .select("_id section")
    .lean();

  const sessionIds = sessions.map((session) => session._id);
  const attendanceCounts = sessionIds.length
    ? await Attendance.aggregate([
        { $match: { session: { $in: sessionIds } } },
        { $group: { _id: "$session", count: { $sum: 1 } } },
      ])
    : [];

  const countBySessionId = new Map(
    attendanceCounts.map((row) => [String(row._id), row.count]),
  );
  const sessionBySection = new Map(
    sessions.map((session) => [session.section, session]),
  );

  const missingSections = [];
  const recordedSections = [];

  for (const section of ATTENDANCE_SECTIONS) {
    const session = sessionBySection.get(section);
    const hasAttendance = session
      ? (countBySessionId.get(String(session._id)) || 0) > 0
      : false;

    if (hasAttendance) recordedSections.push(section);
    else missingSections.push(section);
  }

  return { missingSections, recordedSections };
}

async function sendAttendanceReminderNotificationsForToday({
  dryRun = false,
  eventId,
  reminderSlot,
  now,
} = {}) {
  const currentDate = now ? new Date(now) : new Date();
  const dateKey = getDateKeyCR(currentDate);
  const slot = reminderSlot || getReminderSlotCR(currentDate);
  const dateStart = normalizeDateToStartOfDayCR(dateKey);
  const dateEnd = addDays(dateStart, 1);

  if (!dryRun && !isEnabled()) {
    return {
      dateKey,
      reminderSlot: slot,
      dryRun,
      enabled: false,
      rehearsalsFound: 0,
      rehearsalsNeedingAttendance: 0,
      results: [],
    };
  }

  if (!dryRun && isPastMaxHour(currentDate)) {
    return {
      dateKey,
      reminderSlot: slot,
      dryRun,
      enabled: true,
      skipped: true,
      reason: "ATTENDANCE_REMINDER_MAX_HOUR_CR exceeded",
      rehearsalsFound: 0,
      rehearsalsNeedingAttendance: 0,
      results: [],
    };
  }

  const rehearsals = await getTodayRehearsals({ dateStart, dateEnd, eventId });
  const sectionStatus = rehearsals.length
    ? await getMissingSectionsForDate(dateStart)
    : { missingSections: [], recordedSections: [] };

  const leaders = rehearsals.length
    ? await User.find(
        {
          role: { $in: SECTION_LEADER_ROLES },
          notificationTokens: { $exists: true, $not: { $size: 0 } },
        },
        { _id: 1, role: 1, instrument: 1, notificationTokens: 1 },
      ).lean()
    : [];

  const leadersBySection = groupLeadersBySection(leaders);
  const results = [];

  for (const rehearsal of rehearsals) {
    const missingSections = sectionStatus.missingSections;
    const attendanceAlreadyRecorded = missingSections.length === 0;
    const recipients = attendanceAlreadyRecorded
      ? []
      : uniqueById(
          missingSections.flatMap((section) => leadersBySection.get(section) || []),
        );
    const recipientTokenMap = buildRecipientTokenMap(recipients);
    const recipientsWithTokens = recipients.filter((recipient) =>
      recipientTokenMap.has(String(recipient._id)),
    );

    let reservedRecipientIds = new Set();
    let skippedDuplicates = 0;
    let sendSummary = { successCount: 0, failureCount: 0 };
    const errors = [];

    if (!dryRun && recipientsWithTokens.length) {
      try {
        const reservation = await reserveReminderLogs({
          eventId: rehearsal._id,
          recipients: recipientsWithTokens,
          dateKey,
          reminderSlot: slot,
        });
        reservedRecipientIds = reservation.reservedRecipientIds;
        skippedDuplicates = reservation.skippedDuplicates;
      } catch (err) {
        errors.push(err.message);
        console.error("[attendance-reminder] Error reservando logs", err);
      }
    }

    const tokensToSend = dryRun
      ? normalizeNotificationTokens(
          recipientsWithTokens.flatMap((recipient) => recipient.notificationTokens || []),
        )
      : normalizeNotificationTokens(
          recipientsWithTokens
            .filter((recipient) => reservedRecipientIds.has(String(recipient._id)))
            .flatMap((recipient) => recipientTokenMap.get(String(recipient._id)) || []),
        );

    if (!dryRun && tokensToSend.length) {
      try {
        sendSummary =
          (await dispatchToTokens(EVENTS.ATTENDANCE_REHEARSAL_REMINDER, tokensToSend, {
            eventId: String(rehearsal._id),
            eventTitle: rehearsal.title || "Ensayo",
            eventDate: rehearsal.date instanceof Date
              ? rehearsal.date.toISOString()
              : String(rehearsal.date),
            eventTime: rehearsal.time || "",
            category: "rehearsal",
            type: REMINDER_TYPE,
            dateKey,
            reminderSlot: slot,
          })) || sendSummary;
        if (sendSummary.error) {
          errors.push(sendSummary.error);
          await markReservedLogsWithError({
            eventId: rehearsal._id,
            recipientIds: [...reservedRecipientIds],
            dateKey,
            reminderSlot: slot,
            error: sendSummary.error,
          });
        }
      } catch (err) {
        errors.push(err.message);
        await markReservedLogsWithError({
          eventId: rehearsal._id,
          recipientIds: [...reservedRecipientIds],
          dateKey,
          reminderSlot: slot,
          error: err.message,
        });
      }
    }

    results.push({
      eventId: String(rehearsal._id),
      eventTitle: rehearsal.title || "",
      eventDate: rehearsal.date instanceof Date
        ? rehearsal.date.toISOString()
        : String(rehearsal.date),
      eventTime: rehearsal.time || "",
      attendanceAlreadyRecorded,
      missingSections,
      recordedSections: sectionStatus.recordedSections,
      recipientCount: recipientsWithTokens.length,
      tokenCount: tokensToSend.length,
      skippedDuplicates,
      sent: !dryRun && tokensToSend.length > 0,
      successCount: sendSummary.successCount || 0,
      failureCount: sendSummary.failureCount || 0,
      errors,
    });
  }

  const rehearsalsNeedingAttendance = results.filter(
    (result) => !result.attendanceAlreadyRecorded,
  ).length;

  return {
    dateKey,
    reminderSlot: slot,
    dryRun,
    enabled: isEnabled(),
    rehearsalsFound: rehearsals.length,
    rehearsalsNeedingAttendance,
    results,
  };
}

module.exports = {
  ATTENDANCE_SECTIONS,
  SECTION_LEADER_ROLES,
  getDateKeyCR,
  getReminderSlotCR,
  sendAttendanceReminderNotificationsForToday,
};
