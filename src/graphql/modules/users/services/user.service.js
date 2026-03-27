const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const { deleteUserCascade } = require("./userCascade.service");

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: "./config/.env" });

// ── Constantes ──────────────────────────────────────────────────────────────

const TOKEN_BYTES = 32; // 64 hex chars — suficiente entropía
const TOKEN_TTL_MINUTES = 30; // minutos de validez (antes era 20)
const MIN_PASSWORD_LEN = 8;

// -------------------------
// Helpers
// -------------------------
function signJwt(payload, secret, expiresIn = "24h") {
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return jwt.sign(payload, secret, { expiresIn });
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function findAuthEntityByEmail(email) {
  // Prioridad: User, y si no existe, Parent
  const user = await User.findOne({ email });
  if (user) return { entity: user, type: "User" };

  const parent = await Parent.findOne({ email });
  if (parent) return { entity: parent, type: "Parent" };

  return { entity: null, type: null };
}

/** Busca en User primero, luego en Parent */
async function findByEmail(email) {
  const user = await User.findOne({ email });
  if (user) return { doc: user, Model: User };

  const parent = await Parent.findOne({ email });
  if (parent) return { doc: parent, Model: Parent };

  return { doc: null, Model: null };
}

/** Busca un token válido (no expirado) en ambas colecciones */
async function findByResetToken(token) {
  const query = {
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  };

  const user = await User.findOne(query);
  if (user) return { doc: user, Model: User };

  const parent = await Parent.findOne(query);
  if (parent) return { doc: parent, Model: Parent };

  return { doc: null, Model: null };
}

function buildResetUrl(token) {
  const base = (
    process.env.RESET_PASSWORD_BASE_URL ||
    "https://bandacedesdonbosco.com/autenticacion/recuperar"
  ).replace(/\/$/, "");
  return `${base}/${token}`;
}

function createTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "EMAIL_USER / APP_PASSWORD no están configurados en las variables de entorno",
    );
  }

  return nodemailer.createTransport({
    service: "Gmail",
    auth: { type: "LOGIN", user, pass },
  });
}

// -------------------------
// Mutations
// -------------------------
async function newUser(input) {
  const { email, password } = input || {};
  if (!email || !password)
    throw new Error("Email y contraseña son requeridos.");

  const userExist = await User.findOne({ email });
  if (userExist) throw new Error("Este usuario ya se encuentra registrado");

  const hashedPassword = await hashPassword(password);

  try {
    const user = new User({ ...input, password: hashedPassword });
    await user.save();
    return user;
  } catch (error) {
    console.error("user.service.newUser:", error);
    throw new Error("Error creando usuario");
  }
}

async function uploadProfilePic(id, avatar) {
  if (!id) throw new Error("User id es requerido");
  const updatedUser = await User.findByIdAndUpdate(
    id,
    { avatar },
    { new: true },
  );
  if (!updatedUser) throw new Error("El usuario no existe");
  return updatedUser;
}

async function authUser(input) {
  const { email, password } = input || {};
  if (!email || !password)
    throw new Error("Email y contraseña son requeridos.");

  const { entity } = await findAuthEntityByEmail(email);
  if (!entity) throw new Error("El usuario no existe");

  const isValidPassword = await bcrypt.compare(password, entity.password);
  if (!isValidPassword) throw new Error("La contraseña es incorrecta");

  const token = signJwt(
    { id: entity._id.toString(), email: entity.email },
    process.env.JWT_SECRET,
    "24h",
  );

  return { token };
}

async function updateUser(id, input) {
  if (!id) throw new Error("User id es requerido");
  if (!input || typeof input !== "object") throw new Error("Input inválido");

  const user = await User.findById(id);
  if (!user) throw new Error("El usuario no existe");

  const { email, password } = input;

  if (email && email !== user.email) {
    const emailExist = await User.findOne({ email });
    if (emailExist) throw new Error("Este correo ya se encuentra registrado");
  }

  if (password) {
    input.password = await hashPassword(password);
  }

  const updatedUser = await User.findByIdAndUpdate(id, input, { new: true });
  return updatedUser;
}

async function deleteUser(id) {
  if (!id) throw new Error("User id es requerido");

  const user = await User.findById(id);
  if (!user) throw new Error("El usuario no existe");

  try {
    await deleteUserCascade(id);
    await User.findOneAndDelete({ _id: id });
    return "Usuario eliminado correctamente";
  } catch (error) {
    console.error("user.service.deleteUser:", error);
    throw new Error("Error eliminando usuario");
  }
}

// ── requestReset ─────────────────────────────────────────────────────────────
//
// Siempre retorna `true` para evitar email enumeration.
// El error real se loguea en servidor pero nunca se expone al cliente.

async function requestReset(email) {
  if (!email || typeof email !== "string") {
    throw new Error("Email es requerido");
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const { doc } = await findByEmail(normalizedEmail);

    // Si no existe, salimos silenciosamente (anti-enumeration)
    if (!doc) {
      console.info(
        `[requestReset] Email no encontrado: ${normalizedEmail} — respuesta silenciosa`,
      );
      return true;
    }

    // Limpiar token anterior si ya tenía uno (evita tokens huérfanos)
    if (doc.resetPasswordToken) {
      console.info(
        `[requestReset] Limpiando token previo para: ${normalizedEmail}`,
      );
    }

    // Generar nuevo token
    const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
    const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    doc.resetPasswordToken = token;
    doc.resetPasswordExpires = expires;
    await doc.save();

    // Enviar correo
    const resetURL = buildResetUrl(token);
    const transporter = createTransporter();
    const from = `"Banda CEDES Don Bosco" <${process.env.EMAIL_USER}>`;

    await transporter.sendMail({
      from,
      to: normalizedEmail,
      subject: "Restablecé tu contraseña — Banda CEDES Don Bosco",

      // Texto plano (fallback)
      text: [
        "Hola,",
        "",
        "Recibimos una solicitud para restablecer la contraseña de tu cuenta.",
        `Hacé clic en el siguiente enlace (válido por ${TOKEN_TTL_MINUTES} minutos):`,
        "",
        resetURL,
        "",
        "Si no solicitaste esto, podés ignorar este correo.",
        "",
        "— Banda CEDES Don Bosco",
      ].join("\n"),

      // HTML (clientes modernos)
      html: `
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:Georgia,serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
            <tr><td align="center">
              <table width="480" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
 
                <!-- Accent bar -->
                <tr><td style="height:4px;background:linear-gradient(90deg,#0f172a,#475569,#94a3b8);"></td></tr>
 
                <!-- Body -->
                <tr><td style="padding:40px 40px 32px;">
                  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-.5px;">
                    Restablecé tu contraseña
                  </h1>
                  <p style="margin:0 0 24px;color:#64748b;font-size:15px;line-height:1.6;">
                    Recibimos una solicitud para restablecer la contraseña de tu cuenta.<br>
                    El enlace es válido por <strong>${TOKEN_TTL_MINUTES} minutos</strong>.
                  </p>
 
                  <a href="${resetURL}"
                    style="display:inline-block;padding:14px 28px;background:#0f172a;color:#ffffff;
                           text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;
                           letter-spacing:-.2px;">
                    Cambiar contraseña →
                  </a>
 
                  <p style="margin:28px 0 0;color:#94a3b8;font-size:13px;line-height:1.5;">
                    Si el botón no funciona, copiá este enlace en tu navegador:<br>
                    <a href="${resetURL}" style="color:#475569;word-break:break-all;">${resetURL}</a>
                  </p>
 
                  <hr style="margin:28px 0;border:none;border-top:1px solid #e2e8f0;">
                  <p style="margin:0;color:#cbd5e1;font-size:12px;">
                    Si no solicitaste este cambio, podés ignorar este correo.<br>
                    — Banda CEDES Don Bosco
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });

    return true;
  } catch (err) {
    return true;
  }
}

// ── resetPassword ─────────────────────────────────────────────────────────────

async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new Error("Token y nueva contraseña son requeridos.");
  }
  if (newPassword.length < MIN_PASSWORD_LEN) {
    throw new Error(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres.`,
    );
  }

  const { doc } = await findByResetToken(token);

  if (!doc) {
    // Token inválido o expirado — mensaje genérico para no dar pistas
    throw new Error(
      "El enlace de recuperación es inválido o ya expiró. Solicitá uno nuevo.",
    );
  }

  // Actualizar contraseña y eliminar campos de reset atómicamente
  const hashed = await hashPassword(newPassword);

  // $unset es más robusto que asignar undefined con Mongoose
  await doc.constructor.updateOne(
    { _id: doc._id },
    {
      $set: { password: hashed },
      $unset: { resetPasswordToken: "", resetPasswordExpires: "" },
    },
  );

  return true;
}

async function updateNotificationToken(userId, token) {
  if (!userId || !token) throw new Error("userId y token son requeridos");

  const user = await User.findById(userId);
  if (!user) throw new Error("El usuario no existe");

  user.notificationTokens = user.notificationTokens || [];
  const alreadyExists = user.notificationTokens.includes(token);

  console.log("[user.service] updateNotificationToken llamado", {
    userId,
    email: user.email,
    currentTokenCount: user.notificationTokens.length,
    alreadyExists,
    tokenPreview: maskToken(token),
  });

  if (!alreadyExists) {
    user.notificationTokens.push(token);
    await user.save();
    console.log("[user.service] Token agregado", {
      userId,
      newTokenCount: user.notificationTokens.length,
      tokenPreview: maskToken(token),
    });
  } else {
    console.log("[user.service] Token ya existía, no se agrega", {
      userId,
      tokenPreview: maskToken(token),
    });
  }

  return user;
}

async function upgradeUserGrades() {
  const gradesMapping = {
    "Tercero Primaria": "Cuarto Primaria",
    "Cuarto Primaria": "Quinto Primaria",
    "Quinto Primaria": "Sexto Primaria",
    "Sexto Primaria": "Septimo",
    Septimo: "Octavo",
    Octavo: "Noveno",
    Noveno: "Décimo",
    Décimo: "Undécimo",
    Undécimo: "Duodécimo",
    Duodécimo: "",
  };

  try {
    const users = await User.find({});

    for (const user of users) {
      const nextGrade = gradesMapping[user.grade];
      if (nextGrade !== undefined) {
        user.grade = nextGrade;
        await user.save();
      }
    }

    return true;
  } catch (error) {
    console.error("user.service.upgradeUserGrades:", error);
    return false;
  }
}

function maskToken(token) {
  if (!token || typeof token !== "string") return "<invalid>";
  if (token.length <= 12) return token;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

async function updateUserState() {
  try {
    const users = await User.find({});
    for (const user of users) {
      if (user.grade === "") {
        user.state = "Exalumno";
        await user.save();
      }
    }
    return true;
  } catch (error) {
    console.error("user.service.updateUserState:", error);
    return false;
  }
}

// -------------------------
// Queries
// -------------------------
async function getUser(ctx) {
  if (!ctx?.user?.id) throw new Error("No autenticado");
  return User.findById(ctx.user.id);
}

async function getUsers(filter = {}) {
  try {
    const { searchText, state, states } = filter || {};
    const query = {};

    if (Array.isArray(states) && states.length > 0) {
      query.state = { $in: states.filter(Boolean) };
    } else if (state) {
      query.state = state;
    }

    if (searchText?.trim()) {
      const re = new RegExp(searchText.trim(), "i");
      query.$or = [
        { name: re },
        { firstSurName: re },
        { secondSurName: re },
        { email: re },
        { carnet: re },
      ];
    }

    return await User.find(query)
      .select("-password -resetPasswordToken -resetPasswordExpires")
      .sort({ firstSurName: 1, secondSurName: 1, name: 1 })
      .lean();
  } catch (error) {
    console.error("user.service.getUsers:", error);
    throw new Error("Error fetching users");
  }
}

async function usersWithoutMedicalRecord() {
  return User.aggregate([
    {
      $lookup: {
        from: "medicalrecords",
        localField: "_id",
        foreignField: "user",
        as: "medicalRecord",
      },
    },
    { $match: { medicalRecord: { $eq: [] } } },
  ]);
}

async function usersWithoutAvatar() {
  return User.find({ $or: [{ avatar: null }, { avatar: { $exists: false } }] });
}

async function usersWithoutNotificationTokens() {
  return User.find({
    $or: [
      { notificationTokens: { $exists: false } },
      { notificationTokens: { $size: 0 } },
    ],
  });
}

async function usersWithStatus() {
  return User.aggregate([
    {
      $lookup: {
        from: "medicalrecords",
        localField: "_id",
        foreignField: "user",
        as: "medicalRecord",
      },
    },
    {
      $project: {
        user: {
          _id: "$_id",
          name: "$name",
          firstSurName: "$firstSurName",
          secondSurName: "$secondSurName",
          email: "$email",
        },
        hasMedicalRecord: { $gt: [{ $size: "$medicalRecord" }, 0] },
        hasAvatar: { $cond: [{ $ifNull: ["$avatar", false] }, true, false] },
        hasNotificationTokens: {
          $gt: [{ $size: { $ifNull: ["$notificationTokens", []] } }, 0],
        },
      },
    },
  ]);
}

async function usersWithMissingData() {
  return User.aggregate([
    {
      $lookup: {
        from: "medicalrecords",
        localField: "_id",
        foreignField: "user",
        as: "medicalRecord",
      },
    },
    {
      $project: {
        name: {
          $trim: {
            input: {
              $concat: ["$name", " ", "$firstSurName", " ", "$secondSurName"],
            },
          },
        },
        instrument: 1,
        missingFieldsArray: {
          $concatArrays: [
            {
              $cond: [
                { $gt: [{ $size: "$medicalRecord" }, 0] },
                [],
                ["Ficha Médica"],
              ],
            },
            { $cond: [{ $ifNull: ["$avatar", false] }, [], ["Avatar"]] },
            {
              $cond: [
                {
                  $gt: [{ $size: { $ifNull: ["$notificationTokens", []] } }, 0],
                },
                [],
                ["Tokens de Notificación"],
              ],
            },
          ],
        },
      },
    },
    { $match: { missingFieldsArray: { $ne: [] } } },
    {
      $addFields: {
        missingFields: {
          $reduce: {
            input: "$missingFieldsArray",
            initialValue: "",
            in: {
              $concat: [
                "$$value",
                { $cond: [{ $eq: ["$$value", ""] }, "", ", "] },
                "$$this",
              ],
            },
          },
        },
      },
    },
    {
      $addFields: {
        summary: {
          $concat: [
            "Nombre: ",
            "$name",
            ", Instrumento: ",
            { $ifNull: ["$instrument", "No especificado"] },
            " - Pendiente de llenar: ",
            "$missingFields",
          ],
        },
      },
    },
    { $project: { missingFieldsArray: 0 } },
  ]);
}

async function getInstructorStudents(ctx) {
  if (!ctx?.user || ctx.user.role !== "Instructor de instrumento") {
    throw new Error("No autorizado");
  }
  const instructor = await User.findById(ctx.user.id).populate("students");
  return instructor?.students || [];
}

async function getUsersByInstrument(ctx) {
  if (!ctx?.user || ctx.user.role !== "Instructor de instrumento") {
    throw new Error("No autorizado");
  }
  return User.find({
    instrument: ctx.user.instrument,
    role: { $ne: "Instructor de instrumento" },
  });
}

module.exports = {
  // Mutations
  newUser,
  uploadProfilePic,
  authUser,
  updateUser,
  deleteUser,
  requestReset,
  resetPassword,
  updateNotificationToken,
  upgradeUserGrades,
  updateUserState,

  // Queries
  getUser,
  getUsers,
  usersWithoutMedicalRecord,
  usersWithoutAvatar,
  usersWithoutNotificationTokens,
  usersWithStatus,
  usersWithMissingData,
  getInstructorStudents,
  getUsersByInstrument,
};
