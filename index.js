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

// ============================
// CORS: whitelist
// ============================
const corsOptions = {
  origin: ["https://bandacedesdonbosco.com", "http://localhost:3000"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-apollo-operation-name",
    "apollo-require-preflight",
    "apollographql-client-name",
    "apollographql-client-version",
  ],
  maxAge: 86400,
};

function extractToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!auth) return null;
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}

// =====================================
// Serverless-safe: init una sola vez
// =====================================
let app;
let apollo;
let ready = false;
let initPromise = null;

async function initOnce() {
  if (ready) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await dbConnection();

    app = express();

    // CORS
    app.use(cors(corsOptions));
    app.options("*", cors(corsOptions)); // responde preflight

    apollo = new ApolloServer({
      schema,
      typeDefs,
      resolvers,
      context: async ({ req }) => {
        const token = extractToken(req);

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
        } catch (e) {
          return ctx;
        }
      },
    });

    await apollo.start();
    apollo.applyMiddleware({ app, path: "/api/graphql", cors: false });

    ready = true;
  })();

  return initPromise;
}

// ======================================================
// Export handler para Vercel + local dev
// ======================================================
const handler = async (req, res) => {
  // Responder preflight rápido aunque algo falle en init
  if (req.method === "OPTIONS") {
    return cors(corsOptions)(req, res, () => res.status(204).end());
  }

  await initOnce();
  return app(req, res);
};

module.exports = handler;

if (require.main === module) {
  const port = process.env.PORT || 4000;
  initOnce()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}/api/graphql`);
      });
    })
    .catch((err) => console.error(err));
}
