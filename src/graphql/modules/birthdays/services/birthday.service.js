"use strict";

/**
 * birthday.service.js
 *
 * Lógica de negocio para cumpleaños:
 * - Parseo robusto del campo `birthday` (String)
 * - Filtros de visibilidad: Admin ve todos; usuario normal solo su misma sección/instrument
 * - Staff sin instrument: role === "Staff" se agrupa por role
 * - Envío de notificaciones push con deduplicación diaria via BirthdayNotificationLog
 */

const User = require("../../../../../models/User");
const BirthdayNotificationLog = require("../../../../../models/BirthdayNotificationLog");
const { dispatchToTokens } = require("../../../notifications/notification.dispatcher");
const { EVENTS } = require("../../../notifications/notification.templates");
const { normalizeNotificationTokens } = require("../../../notifications/token.repository");

const TIMEZONE = "America/Costa_Rica";
const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);

// ─── Date utilities ───────────────────────────────────────────────────────────

/**
 * Returns today's {month, day} in Costa Rica timezone (1-indexed).
 */
function getTodayCR() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Returns date key "YYYY-MM-DD" in Costa Rica timezone.
 */
function getDateKeyCR(dateOverride) {
  const d = dateOverride || new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Parses a birthday string into { month, day } (1-indexed).
 * Supports: YYYY-MM-DD, DD/MM/YYYY, ISO string.
 * Returns null on failure.
 */
function parseBirthdayString(birthday) {
  if (!birthday || typeof birthday !== "string") return null;
  const s = birthday.trim();
  if (!s) return null;

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    const year = Number(m[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return { year, month, day };
  }

  // DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31)
      return { year, month, day };
  }

  // ISO string fallback
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Returns a Date for this birthday in the given year (for calendar events).
 * Time is set to noon UTC to avoid TZ offset surprises in calendar rendering.
 */
function getBirthdayDateForYear(birthday, year) {
  const parsed = parseBirthdayString(birthday);
  if (!parsed) return null;
  return new Date(Date.UTC(year, parsed.month - 1, parsed.day, 12, 0, 0));
}

/**
 * Returns true if the birthday matches today in Costa Rica timezone.
 */
function isBirthdayToday(birthday) {
  const parsed = parseBirthdayString(birthday);
  if (!parsed) return false;
  const today = getTodayCR();
  return parsed.month === today.month && parsed.day === today.day;
}

/**
 * Returns the age the person will turn in the given year.
 * Returns null if birthday year is unknown or in the future.
 */
function calculateAgeTurning(birthday, year) {
  const parsed = parseBirthdayString(birthday);
  if (!parsed || !parsed.year) return null;
  const age = year - parsed.year;
  return age > 0 ? age : null;
}

// ─── Visibility helpers ───────────────────────────────────────────────────────

function isAdmin(user) {
  return ADMIN_ROLES.has(String(user?.role ?? ""));
}

function isStaff(user) {
  return String(user?.role ?? "") === "Staff";
}

/**
 * Returns the section key for a user.
 * - instrument if present
 * - "Staff" if role === "Staff" and no instrument
 * - null otherwise
 */
function sectionKey(user) {
  if (user.instrument) return String(user.instrument);
  if (isStaff(user)) return "Staff";
  return null;
}

/**
 * Builds the Mongoose query filter for birthday visibility based on currentUser.
 * Admin: all users with a birthday.
 * Normal: only same instrument/section.
 * No section: empty result (returns null to signal).
 */
function buildVisibilityFilter(currentUser) {
  if (isAdmin(currentUser)) {
    return { birthday: { $exists: true, $nin: ["", null] } };
  }

  const section = sectionKey(currentUser);
  if (!section) return null; // caller must return []

  if (section === "Staff") {
    return {
      birthday: { $exists: true, $nin: ["", null] },
      role: "Staff",
    };
  }

  return {
    birthday: { $exists: true, $nin: ["", null] },
    instrument: section,
  };
}

// ─── Safe user projection ─────────────────────────────────────────────────────
// Never expose password, tokens, resetPasswordToken etc.
const SAFE_FIELDS = {
  _id: 1,
  name: 1,
  firstSurName: 1,
  secondSurName: 1,
  birthday: 1,
  instrument: 1,
  avatar: 1,
  role: 1,
};

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Returns BirthdayPerson list visible for currentUser, for the given year.
 */
async function getVisibleBirthdaysForUser(currentUser, { year } = {}) {
  const targetYear = year || getTodayCR().year;
  const filter = buildVisibilityFilter(currentUser);
  if (!filter) return [];

  const users = await User.find(filter, SAFE_FIELDS).lean();
  return users
    .map((u) => enrichBirthdayPerson(u, targetYear))
    .filter(Boolean);
}

/**
 * Returns today's birthdays visible for currentUser.
 */
async function getTodaysBirthdaysForUser(currentUser) {
  const all = await getVisibleBirthdaysForUser(currentUser);
  return all.filter((b) => b.isToday);
}

/**
 * Returns upcoming birthdays within `days` days, visible for currentUser.
 */
async function getUpcomingBirthdaysForUser(currentUser, { days = 30 } = {}) {
  const all = await getVisibleBirthdaysForUser(currentUser);
  const today = getTodayCR();
  const todayMs = new Date(today.year, today.month - 1, today.day).getTime();
  const limitMs = todayMs + days * 24 * 60 * 60 * 1000;

  return all
    .filter((b) => {
      const bDate = new Date(today.year, b.birthdayMonth - 1, b.birthdayDay).getTime();
      const nextDate = bDate < todayMs
        ? new Date(today.year + 1, b.birthdayMonth - 1, b.birthdayDay).getTime()
        : bDate;
      return nextDate <= limitMs;
    })
    .sort((a, b) => {
      const aMs = nextBirthdayMs(a, today);
      const bMs = nextBirthdayMs(b, today);
      return aMs - bMs;
    });
}

function nextBirthdayMs(person, today) {
  const todayMs = new Date(today.year, today.month - 1, today.day).getTime();
  const thisYear = new Date(today.year, person.birthdayMonth - 1, person.birthdayDay).getTime();
  return thisYear >= todayMs ? thisYear : new Date(today.year + 1, person.birthdayMonth - 1, person.birthdayDay).getTime();
}

/**
 * Returns BirthdayCalendarEvent list for the given year, visible for currentUser.
 */
async function getVisibleCalendarEventsForUser(currentUser, { year } = {}) {
  const targetYear = year || getTodayCR().year;
  const birthdays = await getVisibleBirthdaysForUser(currentUser, { year: targetYear });

  return birthdays.map((b) => ({
    id: `birthday-${b.id}-${targetYear}`,
    title: `🎂 Cumpleaños de ${b.fullName}`,
    start: getBirthdayDateForYear(b.birthday, targetYear)?.toISOString() ?? null,
    end: getBirthdayDateForYear(b.birthday, targetYear)?.toISOString() ?? null,
    allDay: true,
    type: "birthday",
    icon: "🎂",
    birthdayUserId: b.id,
    birthdayUserName: b.fullName,
    instrument: b.instrument ?? null,
    avatar: b.avatar ?? null,
    ageTurning: b.ageTurning ?? null,
  })).filter((e) => e.start !== null);
}

/**
 * Finds all users (no visibility restriction) whose birthday is today.
 * Used internally by the notification job.
 */
async function getUsersWithBirthdayToday() {
  const users = await User.find(
    { birthday: { $exists: true, $nin: ["", null] } },
    SAFE_FIELDS
  ).lean();
  return users.filter((u) => isBirthdayToday(u.birthday));
}

/**
 * Returns recipients who should receive a birthday push for a given birthdayUser.
 * - Same instrument: all users with same instrument (excluding the birthday person).
 * - Staff: all users with role "Staff" (excluding the birthday person).
 * - If birthdayUser has no instrument and is not Staff: nobody.
 * - Admin users: always receive birthday notifications.
 */
async function getBirthdayNotificationRecipientsForBirthdayUser(birthdayUser) {
  const section = sectionKey(birthdayUser);
  const birthdayUserId = String(birthdayUser._id);

  let sectionFilter;
  if (section === "Staff") {
    sectionFilter = { role: "Staff" };
  } else if (section) {
    sectionFilter = { instrument: section };
  } else {
    sectionFilter = null;
  }

  // Always include admins as recipients
  const adminFilter = { role: { $in: Array.from(ADMIN_ROLES) } };

  let sectionUsers = [];
  if (sectionFilter) {
    sectionUsers = await User.find(
      { ...sectionFilter, notificationTokens: { $exists: true, $not: { $size: 0 } } },
      { _id: 1, notificationTokens: 1 }
    ).lean();
  }

  const adminUsers = await User.find(
    { ...adminFilter, notificationTokens: { $exists: true, $not: { $size: 0 } } },
    { _id: 1, notificationTokens: 1 }
  ).lean();

  // Merge, deduplicate by _id, exclude birthday person
  const seen = new Set();
  const recipients = [];
  for (const u of [...sectionUsers, ...adminUsers]) {
    const id = String(u._id);
    if (id === birthdayUserId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    recipients.push(u);
  }

  return recipients;
}

/**
 * Sends birthday push notifications for today.
 * Uses BirthdayNotificationLog to prevent duplicates.
 *
 * @param {{ dryRun?: boolean, instrument?: string, userId?: string }} options
 */
async function sendBirthdayNotificationsForToday({ dryRun = false, instrument, userId } = {}) {
  const dateKey = getDateKeyCR();
  let birthdayUsers = await getUsersWithBirthdayToday();

  if (instrument) {
    birthdayUsers = birthdayUsers.filter((u) => u.instrument === instrument);
  }
  if (userId) {
    birthdayUsers = birthdayUsers.filter((u) => String(u._id) === userId);
  }

  const results = [];

  for (const birthdayUser of birthdayUsers) {
    const fullName = [birthdayUser.name, birthdayUser.firstSurName, birthdayUser.secondSurName]
      .filter(Boolean)
      .join(" ");

    const recipients = await getBirthdayNotificationRecipientsForBirthdayUser(birthdayUser);

    const tokensToSend = [];
    const skippedDuplicates = [];
    const newLogs = [];

    for (const recipient of recipients) {
      const recipientId = String(recipient._id);
      const birthdayUserId = String(birthdayUser._id);

      // Check duplicate
      const exists = await BirthdayNotificationLog.exists({
        birthdayUser: birthdayUserId,
        recipientUser: recipientId,
        dateKey,
        type: "birthday",
      });

      if (exists) {
        skippedDuplicates.push(recipientId);
        continue;
      }

      const tokens = normalizeNotificationTokens(recipient.notificationTokens || []);
      tokensToSend.push(...tokens);
      newLogs.push({ birthdayUserId, recipientId });
    }

    const uniqueTokens = normalizeNotificationTokens(tokensToSend);

    const logEntry = {
      birthdayUser: String(birthdayUser._id),
      birthdayUserName: fullName,
      instrument: birthdayUser.instrument ?? null,
      recipientCount: recipients.length,
      skippedDuplicates: skippedDuplicates.length,
      tokenCount: uniqueTokens.length,
      dateKey,
      dryRun,
    };

    if (!dryRun && uniqueTokens.length > 0) {
      await dispatchToTokens(EVENTS.BIRTHDAY_TODAY, uniqueTokens, {
        birthdayUserId: String(birthdayUser._id),
        fullName,
        instrument: birthdayUser.instrument || "",
      });

      // Save logs to prevent duplicates
      for (const { birthdayUserId: bId, recipientId } of newLogs) {
        await BirthdayNotificationLog.create({
          birthdayUser: bId,
          recipientUser: recipientId,
          dateKey,
          type: "birthday",
        }).catch((err) => {
          // unique constraint violation = already sent, ignore
          if (err.code !== 11000) console.warn("[birthday.service] Log save error:", err.message);
        });
      }
    }

    results.push(logEntry);
  }

  return {
    dateKey,
    dryRun,
    birthdayUsersFound: birthdayUsers.length,
    results,
  };
}

// ─── Enrichment helper ────────────────────────────────────────────────────────

function enrichBirthdayPerson(user, year) {
  const parsed = parseBirthdayString(user.birthday);
  if (!parsed) return null;

  const today = getTodayCR();
  const fullName = [user.name, user.firstSurName, user.secondSurName]
    .filter(Boolean)
    .join(" ");

  return {
    id: String(user._id),
    name: user.name,
    firstSurName: user.firstSurName ?? null,
    secondSurName: user.secondSurName ?? null,
    fullName,
    birthday: user.birthday,
    instrument: user.instrument ?? null,
    avatar: user.avatar ?? null,
    role: user.role ?? null,
    ageTurning: calculateAgeTurning(user.birthday, year),
    birthdayMonth: parsed.month,
    birthdayDay: parsed.day,
    isToday: parsed.month === today.month && parsed.day === today.day,
  };
}

module.exports = {
  parseBirthdayString,
  getBirthdayDateForYear,
  isBirthdayToday,
  calculateAgeTurning,
  getVisibleBirthdaysForUser,
  getTodaysBirthdaysForUser,
  getUpcomingBirthdaysForUser,
  getVisibleCalendarEventsForUser,
  getUsersWithBirthdayToday,
  getBirthdayNotificationRecipientsForBirthdayUser,
  sendBirthdayNotificationsForToday,
};
