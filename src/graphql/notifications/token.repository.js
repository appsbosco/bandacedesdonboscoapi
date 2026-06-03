// /src/notifications/token.repository.js
"use strict";

const User = require("../../../models/User");
const Parent = require("../../../models/Parents");

function normalizeNotificationToken(token) {
  if (typeof token !== "string") return null;
  const normalized = token.trim();
  return normalized.length ? normalized : null;
}

function normalizeNotificationTokens(tokens = []) {
  if (!Array.isArray(tokens)) return [];
  return [...new Set(tokens.map(normalizeNotificationToken).filter(Boolean))];
}

/**
 * Devuelve todos los tokens únicos de usuarios y padres que tengan al menos uno.
 * @returns {Promise<{ tokens: string[], tokenToRecipients: Map<string, string[]> }>}
 */
async function getAllTokens() {
  const [users, parents] = await Promise.all([
    User.find(
      { notificationTokens: { $exists: true, $not: { $size: 0 } } },
      { _id: 1, notificationTokens: 1 },
    ).lean(),
    Parent.find(
      { notificationTokens: { $exists: true, $not: { $size: 0 } } },
      { _id: 1, notificationTokens: 1 },
    ).lean(),
  ]);

  const tokenToRecipients = new Map();

  for (const recipient of [
    ...users.map((user) => ({ ...user, kind: "User" })),
    ...parents.map((parent) => ({ ...parent, kind: "Parent" })),
  ]) {
    const unique = normalizeNotificationTokens(recipient.notificationTokens);
    for (const token of unique) {
      if (!tokenToRecipients.has(token)) tokenToRecipients.set(token, []);
      tokenToRecipients.get(token).push(`${recipient.kind}:${recipient._id}`);
    }
  }

  return {
    tokens: [...tokenToRecipients.keys()],
    tokenToRecipients,
  };
}

/**
 * Elimina tokens inválidos de todos los usuarios que los tengan.
 * @param {string[]} invalidTokens
 */
async function removeInvalidTokens(invalidTokens) {
  return removeTokensFromAllAccounts(invalidTokens);
}

async function removeTokensFromAllAccounts(tokensToRemove) {
  const normalizedTokens = normalizeNotificationTokens(tokensToRemove);
  if (!normalizedTokens.length) {
    return { removedFromUsers: 0, removedFromParents: 0, tokensRemoved: 0 };
  }

  const [usersResult, parentsResult] = await Promise.all([
    User.updateMany(
      { notificationTokens: { $in: normalizedTokens } },
      { $pull: { notificationTokens: { $in: normalizedTokens } } },
    ),
    Parent.updateMany(
      { notificationTokens: { $in: normalizedTokens } },
      { $pull: { notificationTokens: { $in: normalizedTokens } } },
    ),
  ]);

  console.log(
    "[tokenRepository] Tokens eliminados de cuentas",
    {
      tokens: normalizedTokens.length,
      usersModified: usersResult.modifiedCount || 0,
      parentsModified: parentsResult.modifiedCount || 0,
    },
  );

  return {
    removedFromUsers: usersResult.modifiedCount || 0,
    removedFromParents: parentsResult.modifiedCount || 0,
    tokensRemoved: normalizedTokens.length,
  };
}

/**
 * Devuelve los tokens de un usuario específico (útil para pruebas).
 * @param {string} userId
 */
async function getTokensByUserId(userId) {
  const recipient =
    (await User.findById(userId, { notificationTokens: 1 }).lean()) ||
    (await Parent.findById(userId, { notificationTokens: 1 }).lean());
  if (!recipient) {
    throw new Error(`[tokenRepository] Usuario no encontrado: ${userId}`);
  }
  return normalizeNotificationTokens(recipient.notificationTokens);
}

async function getTokensByRecipientIds(userIds = [], parentIds = []) {
  const [users, parents] = await Promise.all([
    User.find({ _id: { $in: userIds.filter(Boolean) } }, { notificationTokens: 1 }).lean(),
    Parent.find({ _id: { $in: parentIds.filter(Boolean) } }, { notificationTokens: 1 }).lean(),
  ]);

  return normalizeNotificationTokens(
    [...users, ...parents].flatMap((recipient) => recipient.notificationTokens || []),
  );
}

async function dedupeNotificationTokensForModel(Model) {
  const docs = await Model.find(
    { notificationTokens: { $exists: true } },
    { _id: 1, notificationTokens: 1 },
  );

  const summary = {
    scanned: docs.length,
    tokensBefore: 0,
    tokensAfter: 0,
    duplicatesRemoved: 0,
    invalidBasicValuesRemoved: 0,
    modified: 0,
  };

  for (const doc of docs) {
    const original = Array.isArray(doc.notificationTokens) ? doc.notificationTokens : [];
    const normalized = normalizeNotificationTokens(original);
    const normalizedInputCount = original.map(normalizeNotificationToken).filter(Boolean).length;

    summary.tokensBefore += original.length;
    summary.tokensAfter += normalized.length;
    summary.invalidBasicValuesRemoved += original.length - normalizedInputCount;
    summary.duplicatesRemoved += normalizedInputCount - normalized.length;

    const changed =
      original.length !== normalized.length ||
      original.some((token, index) => token !== normalized[index]);

    if (changed) {
      doc.notificationTokens = normalized;
      await doc.save();
      summary.modified += 1;
    }
  }

  return summary;
}

async function dedupeNotificationTokensForAllUsers() {
  return dedupeNotificationTokensForModel(User);
}

async function dedupeNotificationTokensForAllParents() {
  return dedupeNotificationTokensForModel(Parent);
}

async function cleanupAllNotificationTokens() {
  const [users, parents] = await Promise.all([
    dedupeNotificationTokensForAllUsers(),
    dedupeNotificationTokensForAllParents(),
  ]);

  return {
    users,
    parents,
    totals: {
      scanned: users.scanned + parents.scanned,
      tokensBefore: users.tokensBefore + parents.tokensBefore,
      tokensAfter: users.tokensAfter + parents.tokensAfter,
      duplicatesRemoved: users.duplicatesRemoved + parents.duplicatesRemoved,
      invalidBasicValuesRemoved:
        users.invalidBasicValuesRemoved + parents.invalidBasicValuesRemoved,
      modified: users.modified + parents.modified,
    },
  };
}

module.exports = {
  getAllTokens,
  removeInvalidTokens,
  removeTokensFromAllAccounts,
  getTokensByUserId,
  getTokensByRecipientIds,
  normalizeNotificationToken,
  normalizeNotificationTokens,
  dedupeNotificationTokensForAllUsers,
  dedupeNotificationTokensForAllParents,
  cleanupAllNotificationTokens,
};
