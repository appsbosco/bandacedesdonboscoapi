const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const schema = require("./src/graphql/schema");
const resolvers = require("./src/graphql/resolvers");
const typeDefs = require("./src/graphql/base/typeDefs");

const dbConnection = require("./config/database");
const User = require("./models/User");

dbConnection();

function extractToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!auth) return null;
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}

const startServer = async () => {
  const app = express();

  app.use(
    cors({
      origin: "*",
      methods: "GET,POST,PUT,DELETE,OPTIONS",
      allowedHeaders: "Content-Type,Authorization",
    }),
  );

  const server = new ApolloServer({
    schema,
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      const token = extractToken(req);

      // Siempre devolvemos un objeto de context
      const ctx = { req, user: null, currentUser: null, me: null };

      if (!token) return ctx;

      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const userId = payload.id || payload._id || payload.sub;

        if (!userId) return ctx;

        const dbUser = await User.findById(userId)
          .select("_id email role name students")
          .lean();

        if (!dbUser) return ctx;

        const hydrated = {
          id: String(dbUser._id),
          email: dbUser.email,
          role: dbUser.role,
          name: dbUser.name,
        };

        req.user = hydrated;
        ctx.user = hydrated;
        ctx.currentUser = hydrated;
        ctx.me = hydrated;

        return ctx;
      } catch (error) {
        return ctx;
      }
    },
  });

  await server.start();
  server.applyMiddleware({ app, path: "/api/graphql" });

  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
};

startServer().catch((err) => console.error(err));
