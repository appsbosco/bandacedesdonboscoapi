const admin = require("firebase-admin");

const serviceAccount = require("./bcdb-app-9466f-firebase-adminsdk-zgvqc-f234733af3.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
