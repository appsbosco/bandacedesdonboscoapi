// Desc: Models for the GraphQL API
const User = require("../models/User");
const Event = require("../models/Events");
const Inventory = require("../models/Inventory");
const MedicalRecord = require("../models/MedicalRecord");
const Attendance = require("../models/Attendance");
const Exalumno = require("../models/Exalumnos");
const ColorGuardCampRegistration = require("../models/ColorGuardCamp");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Hashing
const bcrypt = require("bcrypt");

//Import Environment Variables

require("dotenv").config({ path: ".env" });

// Token
const jwt = require("jsonwebtoken");
const PaymentEvent = require("../models/PaymentEvent");
const Payment = require("../models/Payment");
const Parent = require("../models/Parents");

const createToken = (user, secret, expiresIn) => {
  const {
    id,
    name,
    firstSurName,
    secondSurName,
    email,
    birthday,
    carnet,
    state,
    grade,
    phone,
    role,
    instrument,
  } = user;
  return jwt.sign(
    {
      id,
      email,
      name,
      firstSurName,
      secondSurName,
      birthday,
      carnet,
      state,
      grade,
      phone,
      role,
      instrument,
    },
    secret,
    {
      expiresIn,
    }
  );
};

const resolvers = {
  // #################################################
  User: {
    id: (parent) => parent._id.toString(), // Convert the MongoDB ObjectId to a string
  },

  Query: {
    getUser: async (_, {}, ctx) => {
      // Retrieve the user from the database
      try {
        const user = await User.findById(ctx.user.id);
        return user;
      } catch (error) {
        console.log(error);
      }
    },

    getUsers: async () => {
      try {
        const users = await User.find({});
        return users;
      } catch (error) {
        console.log(error);
      }
    },

    getParent: async (_, {}, ctx) => {
      try {
        // Retrieve the parent from the database and populate the 'children' field
        const parent = await Parent.findById(ctx.user.id).populate("children");

        if (!parent) {
          throw new Error("Parent not found");
        }

        // Fetch all related data for each child
        for (let child of parent.children) {
          child.attendance = await Attendance.find({ user: child._id });
          child.medicalRecord = await MedicalRecord.find({ user: child._id });
          child.inventory = await Inventory.find({ user: child._id });
        }

        return parent;
      } catch (error) {
        console.log(error);
        throw new Error("Error fetching parent and children information");
      }
    },

    getParents: async () => {
      try {
        const parents = await Parent.find({});
        return parents;
      } catch (error) {
        console.log(error);
      }
    },

    // Attendance

    getAttendance: async (_, { id }) => {
      const attendance = await Attendance.findById(id).populate("user");
      if (!attendance) {
        throw new Error("Attendance record does not exist");
      }
      return attendance;
    },

    getAttendanceByUser: async (_, { userId }) => {
      try {
        const attendanceRecords = await Attendance.find({
          user: userId,
        }).populate("user");
        return attendanceRecords;
      } catch (error) {
        console.log(error);
      }
    },

    getAllAttendance: async () => {
      try {
        const attendanceRecords = await Attendance.find({}).populate("user");
        return attendanceRecords.map((record) => ({
          ...record._doc,
          user: record.user,
        }));
      } catch (error) {
        console.log(error);
      }
    },

    // Medical Record
    getMedicalRecord: async (_, { id }) => {
      //Check if the medical record exists
      const medicalRecord = await MedicalRecord.findById(id);
      if (!medicalRecord) {
        throw new Error("Ficha médica no existe");
      }
      return medicalRecord;
    },

    getMedicalRecords: async () => {
      try {
        const medicalRecords = await MedicalRecord.find({}).populate("user");
        return medicalRecords;
      } catch (error) {
        console.log(error);
      }
    },

    getMedicalRecordByUser: async (_, {}, ctx) => {
      try {
        const medicalRecord = await MedicalRecord.find({
          user: ctx.user.id.toString(),
        });
        return medicalRecord;
      } catch (error) {
        console.log(error);
      }
    },

    // Inventory
    getInventory: async (_, { id }) => {
      // Check if the inventory exists
      const inventory = await Inventory.findById(id);
      if (!inventory) {
        throw new Error("Este instrumento o inventario no existe");
      }
      return inventory;
    },

    getInventories: async () => {
      try {
        const inventories = await Inventory.find({}).populate("user");
        return inventories;
      } catch (error) {
        console.log(error);
      }
    },

    getInventoryByUser: async (_, {}, ctx) => {
      try {
        const inventory = await Inventory.find({
          user: ctx.user.id.toString(),
        });
        return inventory;
      } catch (error) {
        console.log(error);
      }
    },

    // Events

    getEvent: async (_, { id }) => {
      // Check if the event exists
      const event = await Event.findById(id);
      if (!event) {
        throw new Error("Este evento no existe");
      }
      return event;
    },

    getEvents: async () => {
      try {
        const events = await Event.find({});
        return events;
      } catch (error) {
        console.log(error);
      }
    },

    // #################################################
    // Payment Register
    getPaymentEvents: async () => {
      try {
        const events = await PaymentEvent.find({});
        return events;
      } catch (error) {
        console.log(error);
      }
    },

    getPaymentsByEvent: async (_, { paymentEvent }) => {
      try {
        const payments = await Payment.find({ paymentEvent })
          .populate({
            path: "user",
            select: "name firstSurName secondSurName instrument role",
          })
          .populate({
            path: "paymentEvent",
            select: "name description date",
          });
        return payments;
      } catch (error) {
        console.log(error);
        throw new Error("Failed to fetch payments");
      }
    },

    // #################################################
    // Exalumnos
    getExAlumnos: async () => {
      return await Exalumno.find();
    },

    // #################################################
    // Color Guard Camp
    getColorGuardCampRegistrations: async () => {
      return await ColorGuardCampRegistration.find();
    },
  },

  // #################################################

  // Mutations

  Mutation: {
    // #################################################
    // Email
    sendEmail: async (_, { input }) => {
      try {
        // Create a Nodemailer transporter with your Gmail credentials
        const transporter = nodemailer.createTransport({
          service: "Gmail",
          auth: {
            type: "PLAIN",
            user: "banda@cedesdonbosco.ed.cr",
            pass: process.env.APP_PASSWORD,
          },
        });

        // Configure the email message
        const mailOptions = {
          from: "banda@cedesdonbosco.ed.cr",
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
        };

        // Send the email
        await transporter.sendMail(mailOptions);

        return true; // Email sent successfully
      } catch (error) {
        console.error("Error al enviar el correo:", error);
        return false; // Failed to send email
      }
    },
    // Users

    // Create a new user
    newUser: async (_, { input }, ctx) => {
      const { email, password } = input;
      // Check if the user is already registered
      const userExist = await User.findOne({ email });
      if (userExist) {
        throw new Error("Este usuario ya se encuentra registrado");
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Save in the database
      try {
        const user = new User({ ...input, password: hashedPassword });
        user.save();
        return user;
      } catch (error) {
        console.log(error);
      }
    },

    newParent: async (_, { input }) => {
      const { email, password } = input;

      // Check if the user is already registered
      const userExist = await Parent.findOne({ email });
      if (userExist) {
        throw new Error("This user is already registered");
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Save in the database
      try {
        const parent = new Parent({ ...input, password: hashedPassword });
        await parent.save();
        return parent;
      } catch (error) {
        console.log(error);
        throw new Error("An error occurred while creating the parent");
      }
    },

    uploadProfilePic: async (_, { id, avatar }) => {
      const updatedUser = await User.findByIdAndUpdate(
        id,
        { avatar },
        { new: true }
      );

      return updatedUser;
    },

    // Auth user
    // Auth user
    authUser: async (_, { input }, ctx) => {
      const { email, password } = input;

      // Check if the email exists in the User collection
      const user = await User.findOne({ email });

      // Check if the email exists in the Parent collection if not found in the User collection
      const parent = await Parent.findOne({ email });

      if (!user && !parent) {
        throw new Error("El usuario no existe");
      }

      let isValidPassword = false;
      let authenticatedUser;

      // If the email was found in the User collection, verify the password
      if (user) {
        isValidPassword = await bcrypt.compare(password, user.password);
        authenticatedUser = user;
      }

      // If the email was found in the Parent collection, verify the password
      if (parent) {
        isValidPassword = await bcrypt.compare(password, parent.password);
        authenticatedUser = parent;
      }

      if (!isValidPassword) {
        throw new Error("La contraseña es incorrecta");
      }

      // Return a token or session to authenticate the user
      return {
        token: createToken(authenticatedUser, process.env.JWT_SECRET, "24h"),
      };
    },

    // Update user
    updateUser: async (_, { id, input }, ctx) => {
      const { email, password } = input;
      const user = await User.findById(id);

      if (!user) {
        throw new Error("El usuario no existe");
      }

      if (email !== user.email) {
        const emailExist = await User.findOne({ email });

        if (emailExist) {
          throw new Error("Este correo ya se encuentra registrado");
        }
      }

      if (password) {
        const salt = await bcrypt.genSalt(10);
        input.password = await bcrypt.hash(password, salt);
      }

      const updatedUser = await User.findByIdAndUpdate(id, input, {
        new: true,
      });

      return updatedUser;
    },

    // Delete user
    deleteUser: async (_, { id }, ctx) => {
      // Check if the medical record exists
      let user = await User.findById(id);

      if (!user) {
        throw new Error("El usuario no existe");
      }

      // Delete inventory
      try {
        await User.findOneAndDelete({ _id: id });
        return "Usuario eliminado correctamente";
      } catch (error) {
        console.log(error);
      }
    },

    // Mutation for requesting a password reset
    requestReset: async (_, { email }, ctx) => {
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error("No user found with that email");
      }

      // Generate a token with some library (e.g., crypto)
      const token = crypto.randomBytes(20).toString("hex");
      const now = new Date();
      const tokenExpiry = new Date(now.getTime() + 20 * 60 * 1000); // Token valid for 20 minutes

      user.resetPasswordToken = token;
      user.resetPasswordExpires = tokenExpiry;
      await user.save();

      // Send email with the token
      // (Using your existing `sendEmail` mutation)
      const resetURL = `https://bandacedesdonbosco.com/autenticacion/recuperar?token=${token}`;

      const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          type: "PLAIN",
          user: "banda@cedesdonbosco.ed.cr",
          pass: process.env.APP_PASSWORD,
        },
      });

      // Here, you'll send an email with the link to the reset page
      // You can adjust the mailOptions accordingly
      const mailOptions = {
        from: "banda@cedesdonbosco.ed.cr",
        to: email,
        subject: "Recuperar contraseña",
        text: `Dale click al siguienete lik para recuperar tu contraseña: ${resetURL}`,
      };

      // You can use your existing email sending function
      await transporter.sendMail(mailOptions);

      return true;
    },

    // Mutation for resetting the password
    resetPassword: async (_, { token, newPassword }, ctx) => {
      if (!token || !newPassword) {
        throw new Error("Token and new password are required.");
      }

      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        throw new Error("Token is invalid or has expired.");
      }

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return true;
    },
    // #################################################

    // Attendance

    // Attendance
    newAttendance: async (_, { input }, ctx) => {
      try {
        const user = await User.findById(input.user); // Find the user by ID
        if (!user) {
          throw new Error("User not found");
        }

        const newAttendance = new Attendance({
          user: user._id,
          date: input.date,
          attended: input.attended,
        });

        const attendance = await newAttendance.save();
        return attendance;
      } catch (error) {
        console.error(error);
        throw new Error("Failed to create attendance");
      }
    },

    updateAttendance: async (_, { id, input }) => {
      let attendance = await Attendance.findById(id);

      if (!attendance) {
        throw new Error("Registro de asistencia no existe");
      }

      const updatedAttendance = await Attendance.findByIdAndUpdate(id, input, {
        new: true,
      });

      return updatedAttendance;
    },

    deleteAttendance: async (_, { id }) => {
      let attendance = await Attendance.findById(id);

      if (!attendance) {
        throw new Error("Registro de asistencia no existe");
      }

      try {
        await Attendance.findOneAndDelete({ _id: id });
        return "Registro de asistencia eliminado correctamente";
      } catch (error) {
        console.log(error);
      }
    },

    // #################################################

    // Medical Record
    newMedicalRecord: async (_, { input }, ctx) => {
      // Assign to  user
      input.user = ctx.user.id;

      // Save in the database
      try {
        const newMedicalRecord = new MedicalRecord(input);
        const medicalRecord = await newMedicalRecord.save();

        return medicalRecord;
      } catch (error) {
        console.log(error);
      }
    },
    updateMedicalRecord: async (_, { id, input }) => {
      try {
        // Check if the medical record exists
        let medicalRecord = await MedicalRecord.findById(id);

        if (!medicalRecord) {
          throw new Error("Ficha médica no existe");
        }

        const updatedMedicalRecord = await MedicalRecord.findOneAndUpdate(
          { _id: id },
          input,
          {
            new: true,
          }
        );
        return updatedMedicalRecord;
      } catch (error) {
        console.error(error);
        throw new Error("Error updating medical record");
      }
    },
    updateEvent: async (_, { id, input }) => {
      // Check if the event exists
      let event = await Event.findById(id);

      if (!event) {
        throw new Error("Este evento no existe");
      }
      // Save in the database
      try {
        const updatedEvent = await Event.findOneAndUpdate({ _id: id }, input, {
          new: true,
        });
        return updatedEvent;
      } catch (error) {
        console.log(error);
      }
    },

    deleteMedicalRecord: async (_, { id }) => {
      // Check if the medical record exists
      let medicalRecord = await MedicalRecord.findById(id);

      if (!medicalRecord) {
        throw new Error("Ficha médica no existe");
      }

      // Delete inventory
      try {
        await MedicalRecord.findOneAndDelete({ _id: id });
        return "Ficha médica eliminada correctamente";
      } catch (error) {
        console.log(error);
      }
    },

    // #################################################

    // Inventory

    newInventory: async (_, { input }, ctx) => {
      // Assign to  user
      input.user = ctx.user.id;

      // Save in the database
      try {
        const newInventory = new Inventory(input);
        const inventory = await newInventory.save();
        return inventory;
      } catch (error) {
        console.log(error);
      }
    },

    updateInventory: async (_, { id, input }) => {
      // Check if the inventory exists
      let inventory = await Inventory.findById(id);

      if (!inventory) {
        throw new Error("Este instrumento o inventario no existe");
      }
      // Save in the database
      try {
        const updatedInventory = await Inventory.findOneAndUpdate(
          { _id: id },
          input,
          {
            new: true,
          }
        );
        return updatedInventory;
      } catch (error) {
        console.log(error);
      }
    },

    deleteInventory: async (_, { id }) => {
      // Check if the inventory exists
      let inventory = await Inventory.findById(id);

      if (!inventory) {
        throw new Error("Este instrumento o inventario no existe");
      }

      // Delete inventory
      try {
        await Inventory.findOneAndDelete({ _id: id });
        return "Instrumento o inventario eliminado correctamente";
      } catch (error) {
        console.log(error);
      }
    },

    // #################################################

    // Events

    newEvent: async (_, { input }, ctx) => {
      // Save in the database
      try {
        const newEvent = new Event(input);
        const event = await newEvent.save();
        return event;
      } catch (error) {
        console.log(error);
      }
    },

    updateEvent: async (_, { id, input }) => {
      // Check if the event exists
      let event = await Event.findById(id);

      if (!event) {
        throw new Error("Este evento no existe");
      }
      // Save in the database
      try {
        const updatedEvent = await Event.findOneAndUpdate({ _id: id }, input, {
          new: true,
        });
        return updatedEvent;
      } catch (error) {
        console.log(error);
      }
    },

    deleteEvent: async (_, { id }) => {
      // Check if the event exists
      let event = await Event.findById(id);

      if (!event) {
        throw new Error("Este evento no existe");
      }

      // Delete from the database
      try {
        await Event.findOneAndDelete({ _id: id });
        return "Evento eliminado correctamente";
      } catch (error) {
        console.log(error);
      }
    },

    // #################################################

    // #################################################
    // Payment Register

    createPaymentEvent: async (_, { input }) => {
      try {
        const event = new PaymentEvent({
          name: input.name,
          date: input.date,
          description: input.description,
        });
        await event.save();
        return event;
      } catch (error) {
        console.log(error);
      }
    },

    createPayment: async (_, { input }) => {
      try {
        const user = await User.findById(input.user);
        if (!user) {
          throw new Error("User not found");
        }

        const paymentEvent = await PaymentEvent.findById(input.paymentEvent);
        if (!paymentEvent) {
          throw new Error("Payment event not found");
        }

        const newPayment = new Payment({
          user: user._id,
          paymentEvent: paymentEvent._id,
          amount: input.amount,
          description: input.description,
          date: new Date(input.date),
        });

        const payment = await newPayment.save();

        return payment;
      } catch (error) {
        console.log(error);
        throw new Error("Failed to create payment");
      }
    },
    updatePayment: async (_, { paymentId, input }) => {
      try {
        const { amount } = input;

        const payment = await Payment.findByIdAndUpdate(
          paymentId,
          { $set: { amount } },
          { new: true }
        );

        if (!payment) {
          throw new Error("Payment not found");
        }

        return payment;
      } catch (error) {
        console.log(error);
        throw new Error("Failed to update payment");
      }
    },

    deletePayment: async (_, { paymentId }) => {
      try {
        const deletedPayment = await Payment.findByIdAndDelete(paymentId);
        if (!deletedPayment) {
          throw new Error("Payment not found");
        }

        return deletedPayment;
      } catch (error) {
        console.log(error);
        throw new Error("Failed to delete payment");
      }
    },

    // #################################################
    // Exalumnos

    addExAlumno: async (_, { input }) => {
      try {
        const newExAlumno = new Exalumno(input);
        return await newExAlumno.save();
      } catch (error) {
        console.error(error);
        throw new Error("Failed to add ex-alumno.");
      }
    },

    // #################################################
    // Color Guard Camp

    createColorGuardCampRegistration: async (_, { input }) => {
      try {
        const newRegistration = new ColorGuardCampRegistration(input);
        return await newRegistration.save();
      } catch (error) {
        console.error(error);
        throw new Error("Failed to add registration.");
      }
    },
  },
};

module.exports = resolvers;
