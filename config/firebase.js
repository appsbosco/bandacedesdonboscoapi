const admin = require("firebase-admin");

const serviceAccount = require("./bcdb-app-9466f-firebase-adminsdk-zgvqc-3d28f9dbe5.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
