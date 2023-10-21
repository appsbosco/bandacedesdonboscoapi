const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const typeDefs = require("./database/schema");
const resolvers = require("./database/resolvers");
const cors = require("cors");

// Import JWT
const jwt = require("jsonwebtoken");

// Import Environment Variables
require("dotenv").config();

// Import DB Connection
const dbConnection = require("./config/database");

// Connect to DB
dbConnection();

// Create an async function to start the server
const startServer = async () => {
  const app = express();

  // Create an ApolloServer instance
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      const token = req.headers["authorization"] || "";
      if (token) {
        try {
          const user = jwt.verify(
            token.replace("Bearer ", ""),
            process.env.JWT_SECRET
          );
          return {
            user,
          };
        } catch (error) {
          console.log(error);
        }
      }
    },
  });

  app.use(cors());

  try {
    await server.start();
    server.applyMiddleware({ app, path: "/api/graphql" });

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  } catch (error) {
    console.error("Error starting the server:");
    console.error(error);
  }
};

startServer();
