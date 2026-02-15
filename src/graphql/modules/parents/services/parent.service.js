/**
 * parents - Service
 * Lógica de negocio + DB (Mongoose)
 */
const bcrypt = require("bcryptjs");

const Parent = require("../../../../../models/Parents");
const Inventory = require("../../../../../models/Inventory");
const MedicalRecord = require("../../../../../models/MedicalRecord");
const Attendance = require("../../../../../models/Attendance");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);

  // NOTE: Activar cuando la autenticación esté fija en el contexto:
  // if (!currentUser) throw new Error("No autenticado");

  return currentUser;
}

function getUserIdFromCtx(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return (u && (u.id || u._id || u.userId)) || null;
}

async function createParent(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de padre requeridos");
  const { email, password } = input;

  if (!email) throw new Error("Email requerido");
  if (!password) throw new Error("Password requerido");

  const userExist = await Parent.findOne({ email });
  if (userExist) {
    throw new Error("This user is already registered");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const parent = await Parent.create({ ...input, password: hashedPassword });
  return parent;
}

async function getParent(ctx) {
  const currentUser = requireAuth(ctx);
  const parentId = getUserIdFromCtx(ctx);

  if (!currentUser || !parentId) throw new Error("No autorizado");

  // Populate children
  const parent = await Parent.findById(parentId).populate("children");
  if (!parent) throw new Error("Parent not found");

  // Fetch related data per child in paralelo (mejor performance que for-await en serie)
  const children = parent.children || [];

  const enrichedChildren = await Promise.all(
    children.map(async (child) => {
      const childId = child && (child._id || child.id);
      if (!childId) return child;

      const [attendance, medicalRecord, inventory] = await Promise.all([
        Attendance.find({ user: childId }),
        MedicalRecord.find({ user: childId }),
        Inventory.find({ user: childId }),
      ]);

      // Mantener la forma original: adjuntar props al child
      // (Si child es subdocument Mongoose, set directo funciona para response GraphQL)
      child.attendance = attendance;
      child.medicalRecord = medicalRecord;
      child.inventory = inventory;

      return child;
    }),
  );

  // Reasignar por consistencia
  parent.children = enrichedChildren;

  return parent;
}

async function getParents(ctx) {
  requireAuth(ctx);

  const parents = await Parent.find({}).sort({
    firstSurName: 1,
    secondSurName: 1,
    name: 1,
  });

  return parents;
}

module.exports = {
  requireAuth,
  createParent,
  getParent,
  getParents,
};
