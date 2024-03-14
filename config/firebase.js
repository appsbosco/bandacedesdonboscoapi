const admin = require("firebase-admin");

const serviceAccount = require("./bcdb-app-9466f-firebase-adminsdk-zgvqc-d6e7d65d9d.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
