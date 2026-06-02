"use strict";

const mongoose = require("mongoose");
require("dotenv").config({ path: "./config/.env" });

function isProductionMongo(uri = "") {
  return /mongodb(\+srv)?:\/\/.+\/APP-BCDB(\?|$)/i.test(uri);
}

// Cached promise to prevent duplicate connection attempts
let _connectionPromise = null;

/**
 * Returns the active Mongoose URI from the environment.
 * Accepts DB_MONGO, MONGODB_URI, or MONGO_URI (in that order of precedence).
 */
function resolveMongoUri() {
  const uri = process.env.DB_MONGO || process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error(
      "No se encontró la URI de MongoDB. Define DB_MONGO, MONGODB_URI o MONGO_URI en .env"
    );
  }
  return uri;
}

/**
 * Connects to MongoDB exactly once.
 * Safe to call from server, workers, and scripts — re-uses the existing connection.
 */
async function connectDB() {
  const state = mongoose.connection.readyState;
  // 1 = connected, 2 = connecting
  if (state === 1) {
    console.log("[MongoDB] Ya está conectado — reutilizando conexión.");
    return;
  }
  if (state === 2) {
    console.log("[MongoDB] Conexión en progreso — esperando...");
    return _connectionPromise;
  }

  const mongoUri = resolveMongoUri();
  const isProdNode = process.env.NODE_ENV === "production";
  const allowProdDbInDev = process.env.ALLOW_PROD_DB_IN_DEV === "true";

  if (!isProdNode && isProductionMongo(mongoUri) && !allowProdDbInDev) {
    throw new Error(
      "Rechazando conexión local al MongoDB de producción. " +
        "Establece ALLOW_PROD_DB_IN_DEV=true solo si lo quieres explícitamente."
    );
  }

  _connectionPromise = mongoose
    .connect(mongoUri, {
      // Atlas M0: limitar el pool para no agotar los 500 slots
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 8_000,
      socketTimeoutMS: 30_000,
      appName: "bcdb-api",
    })
    .then(() => {
      console.log("[MongoDB] Conectado a:", mongoose.connection.host);
    })
    .catch((err) => {
      console.error("[MongoDB] Error de conexión:", err.message);
      _connectionPromise = null;
      throw err;
    });

  return _connectionPromise;
}

/**
 * Gracefully disconnects from MongoDB.
 * Use in scripts and workers at the end of execution.
 */
async function disconnectDB() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log("[MongoDB] Conexión cerrada limpiamente.");
}

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
