// Database configuration

const mongoose = require("mongoose");
require("dotenv").config({ path: "./config/.env" });

function isProductionMongo(uri = "") {
  return /mongodb(\+srv)?:\/\/.+\/APP-BCDB(\?|$)/i.test(uri);
}

const dbConnection = async () => {
  try {
    const mongoUri = process.env.DB_MONGO;
    const isProdNode = process.env.NODE_ENV === "production";
    const allowProdDbInDev = process.env.ALLOW_PROD_DB_IN_DEV === "true";

    if (!isProdNode && isProductionMongo(mongoUri) && !allowProdDbInDev) {
      throw new Error(
        "Refusing to connect local backend to production MongoDB. Set ALLOW_PROD_DB_IN_DEV=true only if you explicitly want that.",
      );
    }

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("DB connected");
  } catch (error) {
    console.log("An error ocurred");
    console.log(error);
    process.exit(1);
  }
};

module.exports = dbConnection;
