const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const {
  ApolloServerPluginLandingPageLocalDefault,
} = require("apollo-server-core");
const { sendMail } = require("./src/graphql/shared/mailer");
const { liveblocksAuthHandler } = require("./src/realtime/liveblocks-auth");
const {
  persistFormationSlotsHandler,
} = require("./src/realtime/formations-persist");
const {
  liveblocksWebhookHandler,
} = require("./src/realtime/liveblocks-webhook");
const { Liveblocks } = require("@liveblocks/node");
const liveblocksAdmin = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY,
});

// ============================
// CORS: whitelist
// ============================
const ALLOWED_ORIGINS = new Set([
  "https://bandacedesdonbosco.com",
  "https://www.bandacedesdonbosco.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4000",

  // Tu red local para probar desde el celular
  "http://192.168.1.202:3000",
  "http://192.168.1.202:5173",

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
    res.setHeader(
      "Vary",
      "Origin, Access-Control-Request-Method, Access-Control-Request-Headers",
    );
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    corsOptions.allowedHeaders.join(", "),
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
}
function extractToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!auth) return null;
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth;
}

function isAllowedPdfSource(urlString) {
  try {
    const parsed = new URL(urlString);
    return (
      parsed.protocol === "https:" && parsed.hostname === "res.cloudinary.com"
    );
  } catch (error) {
    return false;
  }
}

function buildCloudinaryPdfCandidates({ url, publicId }) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const candidates = [];

  if (url && isAllowedPdfSource(url)) {
    candidates.push(url);
    if (!url.endsWith(".pdf")) {
      candidates.push(`${url}.pdf`);
    }
  }

  if (cloudName && publicId) {
    const normalizedPublicId = publicId.endsWith(".pdf")
      ? publicId
      : `${publicId}.pdf`;
    candidates.push(
      `https://res.cloudinary.com/${cloudName}/raw/upload/${normalizedPublicId}`,
    );
  }

  return [...new Set(candidates)];
}

// =====================================
// Serverless-safe: init una sola vez
// =====================================
let app;
let apollo;
let ready = false;
let initPromise = null;

// Lazy-loaded modules
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
      schema = require("./src/graphql/schema");
      resolvers = require("./src/graphql/resolvers");
      typeDefs = require("./src/graphql/base/typeDefs");

      dbConnection = require("./config/database");
      User = require("./models/User");

      ({ inferSectionFromInstrument } = require("./utils/sections"));

      await dbConnection();

      app = express();

      // Middleware para hidratar req.user en rutas REST (mismo patrón que Apollo context)
      const authMiddleware = async (req, res, next) => {
        const token = extractToken(req); // extractToken ya está definida arriba
        if (!token) return next();

        try {
          const payload = jwt.verify(token, process.env.JWT_SECRET);
          const userId = payload.id || payload._id || payload.sub;

          if (userId) {
            const dbUser = await User.findById(userId)
              .select("_id email role name section instrument")
              .lean();

            if (dbUser) {
              req.user = {
                id: String(dbUser._id),
                _id: String(dbUser._id),
                email: dbUser.email,
                role: dbUser.role || "Usuario",
                name: dbUser.name,
                section: dbUser.section || null,
              };
            }
          }
        } catch (e) {
          // Token inválido o expirado — continúa sin req.user
          // El handler correspondiente devolverá 401
        }

        next();
      };

      app.use(cors(corsOptions));
      app.options("*", cors(corsOptions));

      app.use(express.json({ limit: "20mb" }));
      app.use(express.urlencoded({ limit: "20mb", extended: true }));

      app.get("/api/pdf-preview", async (req, res) => {
        const fileUrl = req.query.url;
        const publicId = req.query.publicId;

        if (
          (!fileUrl || typeof fileUrl !== "string") &&
          (!publicId || typeof publicId !== "string")
        ) {
          return res.status(400).json({ error: "url o publicId requerido" });
        }

        try {
          const candidates = buildCloudinaryPdfCandidates({
            url: typeof fileUrl === "string" ? fileUrl : null,
            publicId: typeof publicId === "string" ? publicId : null,
          });

          if (!candidates.length) {
            return res.status(400).json({ error: "url no permitida" });
          }

          for (const candidate of candidates) {
            const upstream = await fetch(candidate);

            if (!upstream.ok) {
              continue;
            }

            const contentType =
              upstream.headers.get("content-type") || "application/pdf";
            const arrayBuffer = await upstream.arrayBuffer();

            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", "inline");
            res.setHeader("Cache-Control", "private, max-age=300");

            return res.status(200).send(Buffer.from(arrayBuffer));
          }

          return res.status(502).json({ error: "No se pudo obtener el PDF" });
        } catch (error) {
          console.error("PDF preview proxy error:", error);
          return res.status(502).json({ error: "No se pudo cargar el PDF" });
        }
      });

      // ── Rutas realtime ─────────────────────────────────────────────────────────

      // POST /api/liveblocks-auth
      // El cliente React llama esto para obtener el token de la room
      app.post("/api/liveblocks-auth", authMiddleware, liveblocksAuthHandler);

      // POST /api/formations/:id/persist
      // El cliente llama esto con debounce para guardar slots a Mongo
      app.post(
        "/api/formations/:id/persist",
        authMiddleware,
        persistFormationSlotsHandler,
      );

      app.delete(
        "/api/liveblocks-room/:formationId",
        authMiddleware,
        async (req, res) => {
          if (req.user?.role !== "Admin")
            return res.status(403).json({ error: "No autorizado" });
          try {
            await liveblocksAdmin.deleteRoom(
              `formation-${req.params.formationId}`,
            );
            return res.json({
              ok: true,
              deleted: `formation-${req.params.formationId}`,
            });
          } catch (e) {
            // Si la room no existe, igual está ok
            return res.json({ ok: true, note: e.message });
          }
        },
      );

      // POST /api/liveblocks-webhook
      // Liveblocks llama esto cuando el storage de una room cambia (safety net)
      // No lleva authMiddleware porque el "auth" es la firma del webhook
      app.post("/api/liveblocks-webhook", liveblocksWebhookHandler);

      apollo = new ApolloServer({
        schema,
        typeDefs,
        resolvers,
        context: async ({ req }) => {
          const token = extractToken(req);

          const sendEmail = async (input) => sendMail(input);
          const ctx = {
            req,
            user: null,
            currentUser: null,
            me: null,
            sendEmail,
            services: {
              email: {
                sendEmail,
              },
            },
          };
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
        plugins: [
          ApolloServerPluginLandingPageLocalDefault({
            embed: true,
          }),
        ],
      });

      await apollo.start();
      apollo.applyMiddleware({ app, path: "/api/graphql", cors: false });

      ready = true;
    } catch (err) {
      console.error("initOnce failed:", err);
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
  setCorsHeaders(req, res);

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
      app.listen(port, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${port}/api/graphql`);
        console.log(
          `Server running on http://192.168.1.202:${port}/api/graphql`,
        );
      });
    })
    .catch((err) => console.error(err));
}
