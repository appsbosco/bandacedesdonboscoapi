"use strict";

/**
 * Lista estudiantes no exalumnos que no están asociados a ningún padre/madre.
 *
 * Uso:
 *   node scripts/usersWithoutParents.js
 */

const mongoose = require("mongoose");

const { connectDB, disconnectDB } = require("../config/database");
const User = require("../models/User");
const Parent = require("../models/Parents");

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

async function findUsersWithoutParents() {
  const parentCollection = Parent.collection.name;

  return User.aggregate([
    {
      $match: {
        state: { $ne: "Exalumno" },
        role: { $nin: [/^staff$/i, /^Instructor de instrumento$/i] },
      },
    },
    {
      $lookup: {
        from: parentCollection,
        localField: "_id",
        foreignField: "children",
        as: "parents",
      },
    },
    {
      $match: {
        parents: { $size: 0 },
      },
    },
    {
      $project: {
        _id: 0,
        fullName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$name", ""] },
                " ",
                { $ifNull: ["$firstSurName", ""] },
                " ",
                { $ifNull: ["$secondSurName", ""] },
              ],
            },
          },
        },
        instrument: { $ifNull: ["$instrument", ""] },
      },
    },
    {
      $sort: {
        fullName: 1,
      },
    },
  ]);
}

async function main() {
  try {
    await connectDB();

    const users = await findUsersWithoutParents();
    const rows = users.map((user) => ({
      nombreCompleto: normalizeText(user.fullName),
      instrument: normalizeText(user.instrument),
    }));

    console.log("\nUsuarios estudiantes sin padre/madre registrado:");
    console.table(rows);
    console.log(`Total de usuarios encontrados: ${rows.length}`);
  } catch (error) {
    console.error("Error al listar usuarios sin padres:", error);
    process.exitCode = 1;
  } finally {
    try {
      await disconnectDB();
    } catch (disconnectError) {
      console.error("Error al cerrar la conexión a MongoDB:", disconnectError);
      process.exitCode = 1;
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  }
}

main();
