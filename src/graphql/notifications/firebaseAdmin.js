// /src/notifications/firebaseAdmin.js
"use strict";

const admin = require("firebase-admin");

let _app = null;

function getFirebaseAdmin() {
  if (_app) return _app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "[firebaseAdmin] Faltan variables de entorno: " +
        "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });

  console.log("[firebaseAdmin] Firebase Admin SDK inicializado ✓");
  return _app;
}

module.exports = { getFirebaseAdmin };
