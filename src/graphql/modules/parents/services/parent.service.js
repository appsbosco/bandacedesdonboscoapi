/**
 * parents - Service 

 */
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const Parent = require("../../../../../models/Parents");
const User = require("../../../../../models/User");
const Inventory = require("../../../../../models/Inventory");
const MedicalRecord = require("../../../../../models/MedicalRecord");
const Attendance = require("../../../../../models/Attendance");

function requireAuth(ctx) {
  const currentUser = ctx && (ctx.user || ctx.me || ctx.currentUser);
  if (!currentUser) throw new Error("No autenticado");
  return currentUser;
}

function getUserIdFromCtx(ctx) {
  const u = ctx && (ctx.user || ctx.me || ctx.currentUser);
  return (u && (u.id || u._id || u.userId)) || null;
}

async function createParent(input, ctx) {
  requireAuth(ctx);

  if (!input) throw new Error("Datos de padre requeridos");
  const { email, password, children } = input;

  if (!email) throw new Error("Email requerido");
  if (!password) throw new Error("Password requerido");

  const userExist = await Parent.findOne({ email });
  if (userExist) {
    throw new Error("This user is already registered");
  }

  if (children && children.length > 0) {
    await validateChildren(children);
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const parent = await Parent.create({
    ...input,
    password: hashedPassword,
    role: input.role || "Parent",
  });

  return parent;
}

async function getParent(ctx) {
  const currentUser = requireAuth(ctx);
  const parentId = getUserIdFromCtx(ctx);

  if (!currentUser || !parentId) throw new Error("No autorizado");

  const parent = await Parent.findById(parentId).populate("children");
  if (!parent) throw new Error("Parent not found");

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

      child.attendance = attendance;
      child.medicalRecord = medicalRecord;
      child.inventory = inventory;

      return child;
    }),
  );

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

// ============================================================================
// Gestión de children
// ============================================================================

async function validateChildren(childIds) {
  if (!Array.isArray(childIds) || childIds.length === 0) {
    throw new Error("childIds debe ser un array no vacío");
  }

  const validIds = childIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length !== childIds.length) {
    throw new Error("Uno o más childIds tienen formato inválido");
  }

  const users = await User.find({ _id: { $in: validIds } }).select("_id state");

  if (users.length !== validIds.length) {
    throw new Error("Uno o más hijos no existen en la base de datos");
  }

  const nonStudents = users.filter(
    (u) => u.state !== "Estudiante Activo" && u.state !== "Exalumno",
  );
  if (nonStudents.length > 0) {
    throw new Error(
      `Los siguientes usuarios no son estudiantes: ${nonStudents.map((u) => u._id).join(", ")}`,
    );
  }

  return true;
}

async function addChildToParent(childId, ctx) {
  requireAuth(ctx);
  const parentId = getUserIdFromCtx(ctx);

  if (!parentId) throw new Error("No autorizado");
  if (!childId) throw new Error("childId requerido");

  await validateChildren([childId]);

  const parent = await Parent.findById(parentId);
  if (!parent) throw new Error("Parent no encontrado");

  const childObjectId = new mongoose.Types.ObjectId(childId);
  const alreadyLinked = parent.children.some((c) => c.equals(childObjectId));

  if (alreadyLinked) {
    throw new Error("Este hijo ya está vinculado a este parent");
  }

  parent.children.push(childObjectId);
  await parent.save();

  return await Parent.findById(parentId).populate("children");
}

async function removeChildFromParent(childId, ctx) {
  requireAuth(ctx);
  const parentId = getUserIdFromCtx(ctx);

  if (!parentId) throw new Error("No autorizado");
  if (!childId) throw new Error("childId requerido");

  const parent = await Parent.findById(parentId);
  if (!parent) throw new Error("Parent no encontrado");

  const childObjectId = new mongoose.Types.ObjectId(childId);
  const initialLength = parent.children.length;

  parent.children = parent.children.filter((c) => !c.equals(childObjectId));

  if (parent.children.length === initialLength) {
    throw new Error("Este hijo no está vinculado a este parent");
  }

  await parent.save();

  return await Parent.findById(parentId).populate("children");
}

module.exports = {
  requireAuth,
  createParent,
  getParent,
  getParents,
  addChildToParent,
  removeChildFromParent,
};
