"use strict";

require("dotenv").config({ path: "./config/.env" });

const admin = require("./config/firebase");
const mongoose = require("mongoose");
const { connectDB, disconnectDB } = require("./config/database");
const User = require("./models/User");

async function sendTestNotification() {
  await connectDB();
  try {
    const users = await User.find({
      notificationTokens: { $exists: true, $ne: [] },
    });

    const tokens = users.flatMap((user) => user.notificationTokens);

    if (tokens.length === 0) {
      console.log("No hay tokens registrados para recibir notificaciones.");
      return;
    }

    const message = {
      notification: {
        title: "Nuevo Producto Disponible",
        body: "Un nuevo producto ha sido añadido y ya puedes hacer la solicitud de tu almuerzo.",
      },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`${response.successCount} mensajes enviados exitosamente.`);

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.log(`Error en token índice ${idx}:`, resp.error);
        }
      });
    }
  } catch (error) {
    console.error("Error al enviar la notificación:", error);
  } finally {
    await disconnectDB();
  }
}

sendTestNotification();
