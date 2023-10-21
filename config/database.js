// Database configuration

const mongoose = require("mongoose");
require("dotenv").config({ path: "./config/.env" });

const dbConnection = async () => {
  try {
    await mongoose.connect(process.env.DB_MONGO, {
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
