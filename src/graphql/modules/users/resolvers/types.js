// src/graphql/modules/users/resolvers/types.js
const UserModel = require("../../../../../models/User");

function toIdString(value) {
  if (!value) return null;

  if (typeof value === "string" || typeof value === "number") return String(value);

  // Si por alguna razón llega Buffer
  if (Buffer.isBuffer(value)) return value.toString("hex");

  // Si es ObjectId suelto
  if (typeof value === "object" && typeof value.toHexString === "function") {
    return value.toHexString();
  }

  // Si es documento mongoose
  if (value._id && value._id !== value) return toIdString(value._id);

  // Objetos proyectados por agregaciones suelen venir como { id: "..." }.
  if (value.id && value.id !== value) return toIdString(value.id);

  if (typeof value === "object" && typeof value.toString === "function") {
    const asString = value.toString();
    return asString === "[object Object]" ? null : asString;
  }

  return String(value);
}

module.exports = {
  User: {
    id: (parent) => toIdString(parent),

    students: async (parent) => {
      const students = parent.students || [];
      if (!students.length) return [];

      // ya populado
      if (students[0] && typeof students[0] === "object" && students[0]._id) {
        return students;
      }

      // no populado: ids -> docs
      return UserModel.find({ _id: { $in: students } }).select(
        "-password -resetPasswordToken -resetPasswordExpires",
      );
    },
  },
};
