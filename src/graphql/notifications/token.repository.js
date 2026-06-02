// /src/notifications/token.repository.js
"use strict";

const User = require("../../../models/User");
const Parent = require("../../../models/Parents");

/**
 * Devuelve todos los tokens únicos de usuarios que tengan al menos uno.
 * @returns {Promise<{ tokens: string[], userMap: Map<string, string[]> }>}
 *   userMap: token → [userId, ...]  (para limpieza dirigida)
 */
async function getAllTokens() {
  const users = await User.find(
    { notificationTokens: { $exists: true, $not: { $size: 0 } } },
    { _id: 1, notificationTokens: 1 },
  ).lean();

  // token → Set<userId>  para deduplicar
  const tokenToUsers = new Map();

  for (const recipient of users) {
    const unique = [...new Set(recipient.notificationTokens)];
    for (const token of unique) {
      if (!tokenToUsers.has(token)) tokenToUsers.set(token, []);
      tokenToUsers.get(token).push(recipient._id.toString());
    }
  }

  return {
    tokens: [...tokenToUsers.keys()],
    tokenToUsers,
  };
}

/**
 * Elimina tokens inválidos de todos los usuarios que los tengan.
 * @param {string[]} invalidTokens
 */
async function removeInvalidTokens(invalidTokens) {
  if (!invalidTokens.length) return;

  await Promise.all([
    User.updateMany(
      { notificationTokens: { $in: invalidTokens } },
      { $pull: { notificationTokens: { $in: invalidTokens } } },
    ),
    Parent.updateMany(
      { notificationTokens: { $in: invalidTokens } },
      { $pull: { notificationTokens: { $in: invalidTokens } } },
    ),
  ]);

  console.log(
    `[tokenRepository] Tokens inválidos eliminados: ${invalidTokens.length}`,
  );
}

/**
 * Devuelve los tokens de un usuario específico (útil para pruebas).
 * @param {string} userId
 */
async function getTokensByUserId(userId) {
  const user = await User.findById(userId, { notificationTokens: 1 }).lean();
  if (!user)
    throw new Error(`[tokenRepository] Usuario no encontrado: ${userId}`);
  return [...new Set(user.notificationTokens || [])];
}

async function getTokensByRecipientIds(userIds = [], parentIds = []) {
  const [users, parents] = await Promise.all([
    User.find({ _id: { $in: userIds.filter(Boolean) } }, { notificationTokens: 1 }).lean(),
    Parent.find({ _id: { $in: parentIds.filter(Boolean) } }, { notificationTokens: 1 }).lean(),
  ]);

  return [
    ...new Set(
      [...users, ...parents].flatMap((recipient) => recipient.notificationTokens || []),
    ),
  ];
}

module.exports = {
  getAllTokens,
  removeInvalidTokens,
  getTokensByUserId,
  getTokensByRecipientIds,
};
