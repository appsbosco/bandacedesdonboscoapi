"use strict";

require("dotenv").config({ path: "./config/.env" });

const admin = require("./config/firebase");
const { connectDB, disconnectDB } = require("./config/database");
const User = require("./models/User");

async function identifyInvalidTokens() {
  await connectDB();
  try {
    const users = await User.find({
      notificationTokens: { $exists: true, $ne: [] },
    });

    let tokens = users.flatMap((user) => user.notificationTokens);
    console.log("Total de tokens encontrados:", tokens.length);

    if (tokens.length === 0) {
      console.log("No hay tokens registrados.");
      return;
    }

    const invalidTokensSet = new Set();
    await Promise.all(
      tokens.map(async (token) => {
        try {
          await admin.messaging().send({
            token,
            notification: {
              title: "Otra prueba, perdón",
              body: "Otra prueba, perdón",
            },
          });
        } catch (error) {
          if (error.code === "messaging/registration-token-not-registered") {
            invalidTokensSet.add(token);
          }
        }
      })
    );

    const invalidTokens = Array.from(invalidTokensSet);

    if (invalidTokens.length > 0) {
      console.log("Tokens inválidos detectados:", invalidTokens);

      const usersWithInvalidTokens = await User.find({
        notificationTokens: { $in: invalidTokens },
      });

      console.log("\nUsuarios con tokens inválidos:");
      usersWithInvalidTokens.forEach((user) => {
        const userInvalidTokens = user.notificationTokens.filter((token) =>
          invalidTokens.includes(token)
        );
        console.log(
          `Usuario: ${user.name} ${user.firstSurName} (${user.email})`
        );
        console.log(`Tokens inválidos: ${userInvalidTokens.join(", ")}`);
        console.log("----------------------------");
      });
    } else {
      console.log("No hay tokens inválidos.");
    }
  } catch (error) {
    console.error("Error al verificar tokens inválidos:", error);
  } finally {
    await disconnectDB();
  }
}

identifyInvalidTokens();
