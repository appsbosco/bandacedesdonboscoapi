// src/graphql/modules/users/resolvers/types.js
const UserModel = require("../../../../../models/User");

function toIdString(value) {
  if (!value) return null;

  // Si es documento mongoose
  if (value._id) return value._id.toString();

  // Si es ObjectId suelto
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }

  // Si por alguna razón llega Buffer
  if (Buffer.isBuffer(value)) return value.toString("hex");

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
