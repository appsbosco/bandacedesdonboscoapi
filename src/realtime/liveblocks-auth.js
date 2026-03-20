const { Liveblocks } = require("@liveblocks/node");
require("dotenv").config({ path: "./config/.env" });

const liveblocks = new Liveblocks({
  secret: process.env.LIVEBLOCKS_SECRET_KEY,
});

const ADMIN_ROLES = new Set(["Admin", "Director", "Subdirector"]);
const FORMATION_EDITOR_ROLES = new Set([
  "Admin",
  "Director",
  "Subdirector",
  "Principal de sección",
]);

async function liveblocksAuthHandler(req, res) {
  const user = req.user; // hidratado por authMiddleware

  if (!user) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const { room } = req.body;

  if (!room || typeof room !== "string" || !room.startsWith("formation-")) {
    return res.status(400).json({ error: "Room inválida" });
  }

  // Cualquier usuario autenticado puede entrar a ver (READ).
  // Solo formation editors pueden escribir.
  const canWrite = FORMATION_EDITOR_ROLES.has(user.role);

  // CORRECCIÓN: prepareSession recibe userId como primer arg,
  // y { userInfo } como segundo arg separado — no dentro del primero.
  const session = liveblocks.prepareSession(user.id, {
    userInfo: {
      userId: user.id,
      displayName: user.name || "Usuario",
      role: user.role,
      section: user.section || null,
      color: generateUserColor(user.id),
    },
  });

  if (canWrite) {
    session.allow(room, session.FULL_ACCESS);
  } else {
    session.allow(room, session.READ_ACCESS);
  }

  const { body, status } = await session.authorize();

  // session.authorize() devuelve { body: string, status: number }
  // body es el token serializado — usar res.end(), no res.json()
  return res.status(status).end(body);
}

function generateUserColor(userId) {
  const colors = [
    "#7C3AED",
    "#2563EB",
    "#059669",
    "#D97706",
    "#DC2626",
    "#DB2777",
    "#0891B2",
    "#65A30D",
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

module.exports = { liveblocksAuthHandler };
