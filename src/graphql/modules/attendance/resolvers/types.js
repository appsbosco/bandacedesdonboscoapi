const Attendance = require("../../../../../models/Attendance");

module.exports = {
  RehearsalSession: {
    attendanceCount: async (parent) => {
      return await Attendance.countDocuments({ session: parent._id });
    },
    attendances: async (parent) => {
      return await Attendance.find({ session: parent._id })
        .populate("user")
        .populate("recordedBy");
    },
  },
};
