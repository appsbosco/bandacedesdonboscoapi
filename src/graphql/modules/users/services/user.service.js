const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

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

function getResetBaseUrl() {
  // Recomendado: configurarlo en env para no hardcodear el dominio
  // e.g. RESET_PASSWORD_BASE_URL="https://bandacedesdonbosco.com/autenticacion/recuperar"
  return process.env.RESET_PASSWORD_BASE_URL
    ? process.env.RESET_PASSWORD_BASE_URL.replace(/\/$/, "")
    : "https://bandacedesdonbosco.com/autenticacion/recuperar";
}

function getMailer() {
  // Recomendado: mover user también a env si cambia
  const user = process.env.EMAIL_USER || "banda@cedesdonbosco.ed.cr";
  const pass = process.env.APP_PASSWORD;

  if (!pass) throw new Error("APP_PASSWORD is not configured");

  return nodemailer.createTransport({
    service: "Gmail",
    auth: {
      type: "PLAIN",
      user,
      pass,
    },
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
    await User.findOneAndDelete({ _id: id });
    return "Usuario eliminado correctamente";
  } catch (error) {
    console.error("user.service.deleteUser:", error);
    throw new Error("Error eliminando usuario");
  }
}

async function requestReset(email) {
  if (!email) throw new Error("Email es requerido");

  const { entity } = await findAuthEntityByEmail(email);
  if (!entity) {
    throw new Error(
      "No se encontró ningún usuario o padre con ese correo electrónico",
    );
  }

  const token = crypto.randomBytes(20).toString("hex");
  const tokenExpiry = new Date(Date.now() + 20 * 60 * 1000); // 20 min

  entity.resetPasswordToken = token;
  entity.resetPasswordExpires = tokenExpiry;

  await entity.save();

  const resetURL = `${getResetBaseUrl()}/${token}`;

  const transporter = getMailer();
  const from = process.env.EMAIL_USER || "banda@cedesdonbosco.ed.cr";

  await transporter.sendMail({
    from,
    to: email,
    subject: "Recuperar contraseña",
    text: `Dale click al siguiente link para recuperar tu contraseña: ${resetURL}`,
  });

  return true;
}

async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new Error("Token y nueva contraseña son requeridos.");
  }

  const query = {
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  };

  let doc = await User.findOne(query);
  if (!doc) doc = await Parent.findOne(query);

  if (!doc) throw new Error("El token es inválido o ha expirado.");

  doc.password = await hashPassword(newPassword);
  doc.resetPasswordToken = undefined;
  doc.resetPasswordExpires = undefined;

  await doc.save();
  return true;
}

async function updateNotificationToken(userId, token) {
  if (!userId || !token) throw new Error("userId y token son requeridos");

  const user = await User.findById(userId);
  if (!user) throw new Error("El usuario no existe");

  user.notificationTokens = user.notificationTokens || [];

  if (!user.notificationTokens.includes(token)) {
    user.notificationTokens.push(token);
    await user.save();
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

async function getUsers() {
  try {
    return await User.find({})
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
