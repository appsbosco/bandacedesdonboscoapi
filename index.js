const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// ============================
// CORS: whitelist
// ============================
const ALLOWED_ORIGINS = new Set([
  "https://bandacedesdonbosco.com",
  "https://www.bandacedesdonbosco.com",
  "http://localhost:3000",
  "https://studio.apollographql.com",
]);

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sin origin (curl, server-to-server)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
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

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    corsOptions.allowedHeaders.join(", "),
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

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

// Lazy-loaded modules (para que OPTIONS responda aunque algo falle en imports)
let schema;
let resolvers;
let typeDefs;
let dbConnection;
let User;
let inferSectionFromInstrument;

async function initOnce() {
  if (ready) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // ============================
      // Lazy imports (IMPORTANT)
      // ============================
      schema = require("./src/graphql/schema");
      resolvers = require("./src/graphql/resolvers");
      typeDefs = require("./src/graphql/base/typeDefs");

      dbConnection = require("./config/database");
      User = require("./models/User");

      ({ inferSectionFromInstrument } = require("./utils/sections"));

      await dbConnection();

      app = express();

      // CORS
      app.use(cors(corsOptions));
      app.options("*", cors(corsOptions));

      app.use(express.json({ limit: "20mb" }));
      app.use(express.urlencoded({ limit: "20mb", extended: true }));

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

            let dbUser = await User.findById(userId)
              .select("_id email role name students instrument section")
              .lean();

            let entityType = "User";

            if (!dbUser) {
              const Parent = require("./models/Parents");
              const dbParent = await Parent.findById(userId)
                .select("_id email role name phone children")
                .lean();

              if (dbParent) {
                dbUser = dbParent;
                entityType = "Parent";
              }
            }

            if (!dbUser) return ctx;

            let section = null;
            if (entityType === "User") {
              section = dbUser.section || null;
              try {
                if (!section) {
                  section =
                    inferSectionFromInstrument(dbUser.instrument) || null;
                }
              } catch (e) {
                console.log("inferSectionFromInstrument failed:", e.message);
              }
            }

            const hydrated = {
              id: String(dbUser._id),
              _id: String(dbUser._id),
              userId: String(dbUser._id),
              email: dbUser.email,
              role: dbUser.role || "Parent",
              name: dbUser.name,
              section,
              entityType,
            };

            req.user = hydrated;
            ctx.user = hydrated;
            ctx.currentUser = hydrated;
            ctx.me = hydrated;

            return ctx;
          } catch (e) {
            console.error("Context error:", e.message);
            return ctx;
          }
        },
      });

      await apollo.start();
      apollo.applyMiddleware({ app, path: "/api/graphql", cors: false });

      ready = true;
    } catch (err) {
      console.error("initOnce failed:", err);
      // Importante: reset para permitir reintento en próxima request
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

// ======================================================
// Export handler para Vercel + local dev
// ======================================================
const handler = async (req, res) => {
  // Poner headers CORS SIEMPRE (incluso si algo falla)
  setCorsHeaders(req, res);

  // Responder preflight rápido aunque falle init
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    await initOnce();
    return app(req, res);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = handler;

// Local dev
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
