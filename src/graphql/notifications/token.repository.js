// /src/notifications/token.repository.js
"use strict";

const User = require("../../../models/User");

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

  for (const user of users) {
    const unique = [...new Set(user.notificationTokens)];
    for (const token of unique) {
      if (!tokenToUsers.has(token)) tokenToUsers.set(token, []);
      tokenToUsers.get(token).push(user._id.toString());
    }
  }

  const tokens = [...tokenToUsers.keys()];

  console.log("[tokenRepository] Tokens cargados para dispatch", {
    usersWithTokens: users.length,
    uniqueTokens: tokens.length,
    sampleTokens: tokens.slice(0, 5).map(maskToken),
  });

  return {
    tokens,
    tokenToUsers,
  };
}

/**
 * Elimina tokens inválidos de todos los usuarios que los tengan.
 * @param {string[]} invalidTokens
 */
async function removeInvalidTokens(invalidTokens) {
  if (!invalidTokens.length) return;

  await User.updateMany(
    { notificationTokens: { $in: invalidTokens } },
    { $pull: { notificationTokens: { $in: invalidTokens } } },
  );

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

module.exports = { getAllTokens, removeInvalidTokens, getTokensByUserId };

function maskToken(token) {
  if (!token || typeof token !== "string") return "<invalid>";
  if (token.length <= 12) return token;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
