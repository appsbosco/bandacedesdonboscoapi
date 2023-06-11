//Import Apollo Server
const { ApolloServer } = require("apollo-server");
const typeDefs = require("./database/schema");
const resolvers = require("./database/resolvers");
const nodemailer = require("nodemailer");

//Import JWT
const jwt = require("jsonwebtoken");

//Import Environment Variables
require("dotenv").config({ path: ".env" });

//Import DB Connection
const dbConnection = require("./config/database");

//Connect to DB
dbConnection();

//Create Server Variale
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    console.log(req.headers["authorization"]);
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

//Run Server
server.listen({ port: 4000 }).then(({ url }) => {
  console.log(`Server runnnig on ${url} `);
});
