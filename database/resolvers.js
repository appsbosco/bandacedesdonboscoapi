// Desc: Models for the GraphQL API
const User = require("../models/User");
const Event = require("../models/Events");
const Inventory = require("../models/Inventory");
const MedicalRecord = require("../models/MedicalRecord");
const Attendance = require("../models/Attendance");
const Exalumno = require("../models/Exalumnos");
const Hotel = require("../models/Hotel");
const PerformanceAttendance = require("../models/PerformanceAttendance");
const Product = require("../models/Product");
const Order = require("../models/Order");
const ColorGuardCampRegistration = require("../models/ColorGuardCamp");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const QRCode = require("qrcode");
const hbs = require("nodemailer-express-handlebars");
const path = require("path");

// Hashing
const bcrypt = require("bcrypt");
const admin = require("firebase-admin");

const serviceAccount = require("../config/bcdb-app-9466f-firebase-adminsdk-zgvqc-d6e7d65d9d.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//Import Environment Variables

require("dotenv").config({ path: ".env" });

// Token
const jwt = require("jsonwebtoken");
const PaymentEvent = require("../models/PaymentEvent");
const Payment = require("../models/Payment");
const Parent = require("../models/Parents");
const Guatemala = require("../models/Guatemala");
const Apoyo = require("../models/Apoyo");
const { Ticket } = require("../models/Tickets");
const { EventTicket } = require("../models/EventTicket");

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
const generateRaffleNumbers = async (eventId, ticketQuantity) => {
  const event = await EventTicket.findById(eventId);
  const assignedNumbers = await Ticket.find({ eventId }).distinct(
    "raffleNumbers"
  );
  const allNumbers = Array.from({ length: event.ticketLimit }, (_, i) =>
    (i + 1).toString().padStart(3, "0")
  );
  const availableNumbers = allNumbers.filter(
    (num) => !assignedNumbers.includes(num)
  );

  if (availableNumbers.length < ticketQuantity) {
    throw new Error(
      "No hay suficientes números de rifa disponibles para este evento."
    );
  }

  const raffleNumbers = [];
  for (let i = 0; i < ticketQuantity; i++) {
    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    raffleNumbers.push(availableNumbers.splice(randomIndex, 1)[0]);
  }

  return raffleNumbers;
};

const resolvers = {
  // #################################################
  User: {
    id: (parent) => parent._id.toString(), // Convert the MongoDB ObjectId to a string
  },

  Ticket: {
    userId: (ticket) => {
      // Si el campo userId ya está populado, simplemente devuélvelo
      return ticket.userId;
    },
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
    // Presentations
    getPerformanceAttendanceByEvent: async (_, { event }) => {
      return await PerformanceAttendance.find({ event })
        .populate("user")
        .populate("hotel")
        .populate("event");
    },
    getHotel: async (_, { id }) => {
      return await Hotel.findById(id);
    },
    getHotels: async () => {
      return await Hotel.find();
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

    getGuatemala: async () => {
      return await Guatemala.find().populate("children");
    },
    getApoyo: async () => {
      return await Apoyo.find().populate("children");
    },

    products: async () => {
      return await Product.find({});
    },
    orders: async () => {
      return await Order.find({})
        .populate({
          path: "userId",
          model: "User",
        })
        .populate({
          path: "products.productId",
          model: "Product",
        });
    },

    orderByUserId: async (_, { userId }) => {
      let query = {};

      // Si se proporciona un userId, filtrar por ese userId
      if (userId) {
        query.userId = userId;
      }

      return await Order.find(query)
        .populate({
          path: "userId",
          model: "User",
        })
        .populate({
          path: "products.productId",
          model: "Product",
        });
    },

    orderById: async (_, { id }) => {
      return await Order.findById(id).populate("userId").populate("products");
    },

    // #################################################
    //TICKETS
    // getTickets: async () => {
    //   try {
    //     const tickets = await Ticket.find({}).populate("userId").exec();
    //     return tickets.map((ticket) => {
    //       const user = ticket.userId ? ticket.userId : null;
    //       return {
    //         ...ticket.toObject(),
    //         userId: user ? user._id : null,
    //         userName: user ? user.name : null,
    //         userSurname: user ? user.firstSurName : null,
    //       };
    //     });
    //   } catch (error) {
    //     console.error("Error fetching tickets:", error);
    //     throw error;
    //   }
    // },

    getTickets: async (_, { eventId }) => {
      try {
        const query = eventId ? { eventId } : {};
        const tickets = await Ticket.find(query).populate({
          path: "userId",
          select: "name firstSurName secondSurName email",
        });
        return tickets;
      } catch (error) {
        console.log(error);
        throw new Error("Failed to fetch tickets");
      }
    },

    getEventsT: async () => await EventTicket.find(),
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
          attachments: input.attachments,
        };

        const handlebarOptions = {
          viewEngine: {
            partialsDir: path.resolve("./views/"),
            defaultLayout: false,
          },
          viewPath: path.resolve("./views/"),
        };

        console.log(handlebarOptions);
        transporter.use("compile", hbs(handlebarOptions));

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
    requestReset: async (_, { email }) => {
      let user = await User.findOne({ email });
      let parent = await Parent.findOne({ email });

      if (!user && !parent) {
        throw new Error(
          "No se encontró ningún usuario o padre con ese correo electrónico"
        );
      }

      // Determinar el modelo y documento correspondiente
      let doc;
      if (user) {
        doc = user;
      } else {
        doc = parent;
      }

      // Generate a token with some library (e.g., crypto)
      const token = crypto.randomBytes(20).toString("hex");
      const now = new Date();
      const tokenExpiry = new Date(now.getTime() + 20 * 60 * 1000); // Token valid for 20 minutes

      doc.resetPasswordToken = token;
      doc.resetPasswordExpires = tokenExpiry;

      console.log("Document before saving:", doc);

      await doc.save();

      // Verificar si el token se guardó correctamente
      const updatedDoc = await (user
        ? User.findOne({ email })
        : Parent.findOne({ email }));
      console.log("Document after saving:", updatedDoc);

      // Send email with the token
      const resetURL = `https://bandacedesdonbosco.com/autenticacion/recuperar/${token}`;

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
        text: `Dale click al siguiente link para recuperar tu contraseña: ${resetURL}`,
      };

      // You can use your existing email sending function
      await transporter.sendMail(mailOptions);

      return true;
    },

    // Mutation for resetting the password
    resetPassword: async (_, { token, newPassword }) => {
      if (!token || !newPassword) {
        throw new Error("Token y nueva contraseña son requeridos.");
      }

      // Buscar el token en la colección de usuarios y padres
      let user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });

      let parent = await Parent.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user && !parent) {
        throw new Error("El token es inválido o ha expirado.");
      }

      // Determinar el modelo y documento correspondiente
      let doc;
      if (user) {
        doc = user;
      } else {
        doc = parent;
      }

      // Generar el hash de la nueva contraseña
      const salt = await bcrypt.genSalt(10);
      doc.password = await bcrypt.hash(newPassword, salt);
      doc.resetPasswordToken = undefined;
      doc.resetPasswordExpires = undefined;

      console.log("Document before saving new password:", doc);

      await doc.save();

      console.log("Document after saving new password:", doc);

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
    // Presentations
    newPerformanceAttendance: async (_, { input }) => {
      const attendance = new PerformanceAttendance(input);
      return await attendance.save();
    },
    updatePerformanceAttendance: async (_, { id, input }) => {
      return await PerformanceAttendance.findByIdAndUpdate(id, input, {
        new: true,
      });
    },
    deletePerformanceAttendance: async (_, { id }) => {
      await PerformanceAttendance.findByIdAndDelete(id);
      return "Performance Attendance deleted successfully!";
    },
    newHotel: async (_, { input }) => {
      const hotel = new Hotel(input);
      return await hotel.save();
    },
    updateHotel: async (_, { id, input }) => {
      return await Hotel.findByIdAndUpdate(id, input, { new: true });
    },
    deleteHotel: async (_, { id }) => {
      await Hotel.findByIdAndDelete(id);
      return "Hotel deleted successfully!";
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
    // Exalumnos

    addGuatemala: async (_, { input }) => {
      try {
        const newGuatemala = new Guatemala(input);
        return await newGuatemala.save();
      } catch (error) {
        console.error(error);
        throw new Error("Failed to add guatemala.");
      }
    },

    addApoyo: async (_, { input }) => {
      try {
        const newApoyo = new Apoyo(input);
        return await newApoyo.save();
      } catch (error) {
        console.error(error);
        throw new Error("Failed to add apoyo.");
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

    // #################################################
    // Almuerzos
    createProduct: async (
      _,
      {
        name,
        description,
        category,
        price,
        availableForDays,
        photo,
        closingDate,
      }
    ) => {
      const newProduct = new Product({
        name,
        description,
        category,
        price,
        availableForDays,
        photo,
        closingDate: new Date(closingDate),
      });

      // 1. Guardar el nuevo producto en la base de datos
      await newProduct.save();

      // 2. Obtener todos los tokens de notificaciones de los usuarios que deseen recibir notificaciones
      const users = await User.find({
        notificationTokens: { $exists: true, $ne: [] }, // Asegúrate de que existen tokens y el arreglo no está vacío
      });

      // Utiliza flatMap para aplanar todos los tokens en un solo arreglo
      const tokens = users.flatMap((user) => user.notificationTokens);

      // console.log(tokens);

      // 3. Enviar la notificación a todos los tokens, si es que existen
      if (tokens.length > 0) {
        const message = {
          notification: {
            title: "Banda CEDES Don Bosco - Nuevo Producto Disponible",
            body: "Un nuevo producto ha sido añadido y ya puedes hacer la solicitud de tus almuerzos.",
            // sound: "default",
          },
          webpush: {
            headers: {
              Urgency: "high",
            },
            notification: {
              icon: "../config/Icons-01.jpg",
              badge: "../config/Icons-01.jpg",
            },
          },
          tokens: tokens,
        };

        admin
          .messaging()
          .sendMulticast(message)
          .then((response) => {
            console.log(
              `${response.successCount} mensajes fueron enviados exitosamente.`
            );
          })
          .catch((error) => {
            console.log("Error al enviar la notificación:", error);
          });
      }

      return newProduct;
    },

    updateProduct: async (
      _,
      { id, name, description, category, price, availableForDays, closingDate }
    ) => {
      return await Product.findByIdAndUpdate(
        id,
        {
          $set: {
            name,
            description,
            category,
            price,
            availableForDays,
            closingDate: new Date(closingDate),
          },
        },
        { new: true }
      );
    },
    deleteProduct: async (_, { id }) => {
      return await Product.findByIdAndRemove(id);
    },
    createOrder: async (_, { userId, products }) => {
      const newOrder = new Order({
        userId,
        products,
        orderDate: new Date(),
      });
      return await newOrder.save();
    },

    completeOrder: async (_, { orderId }) => {
      return await Order.findByIdAndUpdate(
        orderId,
        { isCompleted: true },
        { new: true }
      );
    },

    upgradeUserGrades: async () => {
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
        const users = await User.find({}); // Encuentra todos los usuarios

        for (const user of users) {
          const nextGrade = gradesMapping[user.grade]; // Determina el siguiente grado

          if (nextGrade !== undefined) {
            // Verifica si el grado actual está en el mapeo
            user.grade = nextGrade; // Actualiza al siguiente grado
            await user.save(); // Guarda los cambios en la base de datos
          }
        }

        return true; // Retorna true
      } catch (error) {
        console.error("Error upgrading user grades:", error);
        return false; // Retorna false en caso de error
      }
    },

    //Notifcation tokens
    updateNotificationToken: async (_, { userId, token }) => {
      try {
        const user = await User.findById(userId);
        try {
          if (!user.notificationTokens.includes(token)) {
            user.notificationTokens.push(token);
            await user.save();
            console.log(
              "Token de notificación guardado correctamente para el usuario:",
              userId
            );
          } else {
            console.log(
              "El token ya existe para este usuario, no se necesita actualizar:",
              userId
            );
          }
        } catch (error) {
          console.error(
            "Error al guardar el token de notificación para el usuario:",
            userId,
            error
          );
        }

        return user;
      } catch (error) {
        throw new Error("Error updating notification token");
      }
    },

    //Tickets

    createEvent: async (
      _,
      { name, date, description, ticketLimit, raffleEnabled, price }
    ) => {
      const event = new EventTicket({
        name,
        date,
        description,
        ticketLimit,
        raffleEnabled,
        price,
      });
      await event.save();
      return event;
    },

    assignTickets: async (_, { input }) => {
      const { userId, eventId, type, ticketQuantity } = input;
      try {
        const event = await EventTicket.findById(eventId);
        if (!event) throw new Error("Event not found");

        let raffleNumbers = [];
        if (event.raffleEnabled) {
          raffleNumbers = await generateRaffleNumbers(eventId, ticketQuantity);
        }

        const ticket = new Ticket({
          userId,
          eventId,
          type,
          ticketQuantity,
          qrCode: "", // Inicialmente vacío
          raffleNumbers, // Asignar números de rifa si aplica
        });
        await ticket.save();
        console.log("Saved ticket:", ticket);

        const qrCodeData = JSON.stringify({
          ticketId: ticket._id.toString(), // Incluir el ticketId
          userId: userId ? userId.toString() : null,
          eventId: eventId.toString(),
          type,
        });
        console.log("Generated QR code data:", qrCodeData);
        const qrCode = await QRCode.toDataURL(qrCodeData);
        console.log("Generated QR code:", qrCode);

        ticket.qrCode = qrCode;
        await ticket.save();
        console.log("Updated ticket with QR code:", ticket);

        const user = await User.findById(userId);

        if (user) {
          await resolvers.Mutation.sendEmail(null, {
            input: {
              to: user.email,
              subject: "Entradas asignadas",
              text: "Aquí están tus entradas.",
              html: `<html dir="ltr" lang="en">
              <head>
                <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
                <meta name="x-apple-disable-message-reformatting" />
              </head>
              <body style="background-color: #ffffff">
                <table
                  align="center"
                  width="100%"
                  border="0"
                  cellpadding="0"
                  cellspacing="0"
                  role="presentation"
                  style="
                    max-width: 100%;
                    margin: 10px auto;
                    width: 600px;
                    border: 1px solid #e5e5e5;
                  "
                >
                  <tbody>
                    <tr style="width: 100%">
                      <td>
                        <table
                          align="center"
                          width="100%"
                          border="0"
                          cellpadding="0"
                          cellspacing="0"
                          role="presentation"
                          style="padding: 22px 40px"
                        >
                          <tbody>
                            <tr>
                              <td>
                                <table
                                  align="center"
                                  width="100%"
                                  border="0"
                                  cellpadding="0"
                                  cellspacing="0"
                                  role="presentation"
                                >
                                  <tbody style="width: 100%">
                                    <tr style="width: 100%">
                                      <td data-id="__react-email-column">
                                        <p
                                          style="
                                            font-size: 14px;
                                            line-height: 2;
                                            margin: 0;
                                            font-weight: bold;
                                            text-align: center;
                                          "
                                        >
                                          Número de Entrada
                                        </p>
                                        <p
                                          style="
                                            font-size: 14px;
                                            line-height: 1.4;
                                            margin: 12px 0 0 0;
                                            font-weight: 500;
                                            color: #6f6f6f;
                                            text-align: center;
                                          "
                                        >
                                          ${ticket._id.toString()}
                                        </p>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <hr
                          style="
                            width: 100%;
                            border: none;
                            border-top: 1px solid #eaeaea;
                            border-color: #e5e5e5;
                            margin: 0;
                          "
                        />
                        <table
                          align="center"
                          width="100%"
                          border="0"
                          cellpadding="0"
                          cellspacing="0"
                          role="presentation"
                          style="padding: 40px 74px; text-align: center"
                        >
                          <tbody>
                            <tr>
                              <td>
                                <img
                                  alt="Banda CEDES Don Bosco"
                                  height="120px"
                                  src="https://res.cloudinary.com/dnv9akklf/image/upload/q_auto,f_auto/v1686511395/LOGO_BCDB_qvjabt.png"
                                  style="
                                    display: block;
                                    outline: none;
                                    border: none;
                                    text-decoration: none;
                                    margin: auto;
                                  "
                                  width="200px"
                                />
                                <h1
                                  style="
                                    font-size: 32px;
                                    line-height: 1.3;
                                    font-weight: 700;
                                    text-align: center;
                                    letter-spacing: -1px;
                                  "
                                >
                                  ¡ ${event.description}!
                                </h1>
                                <p
                                  style="
                                    font-size: 14px;
                                    line-height: 2;
                                    margin: 0;
                                    color: #747474;
                                    font-weight: 500;
                                  "
                                >
                                  Acá están tus entrada para el evento. Utiliza el código QR
                                  al presentarlo en la entrada del evento.
                                </p>
                                <p
                                  style="
                                    font-size: 14px;
                                    line-height: 2;
                                    margin: 0;
                                    color: #747474;
                                    font-weight: 500;
                                    margin-top: 24px;
                                  "
                                >
                                  Antes de ingresar a la actividad, las entradas deben estar
                                  canceladas al SINPE de la BCDB. (6445-3952) .
                                </p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <hr
                          style="
                            width: 100%;
                            border: none;
                            border-top: 1px solid #eaeaea;
                            border-color: #e5e5e5;
                            margin: 0;
                          "
                        />
                        <table
                          align="center"
                          width="100%"
                          border="0"
                          cellpadding="0"
                          cellspacing="0"
                          role="presentation"
                          style="
                            padding-left: 40px;
                            padding-right: 40px;
                            padding-top: 22px;
                            padding-bottom: 22px;
                          "
                        >
                          <tbody>
                            <tr>
                              <td>
                                <p
                                  style="
                                    font-size: 15px;
                                    line-height: 2;
                                    margin: auto;
                                    font-weight: bold;
                                    text-align: center;
                                  "
                                >
                                  Entradas asignadas a:
                                </p>
                                <p
                                  style="
                                    font-size: 15px;
                                    text-align: center;
                                    line-height: 2;
                                    margin: auto;
                                    font-weight: bold;
                                  "
                                >
                                  ${
                                    user.name +
                                    " " +
                                    user.firstSurName +
                                    " " +
                                    user.secondSurName
                                  }
                                </p>
                              </td>
                            </tr>
                            <h1
                              style="
                                font-size: 32px;
                                line-height: 1.3;
                                font-weight: 700;
                                text-align: center;
                                letter-spacing: -1px;
                              "
                            >
                              Sus números para la rifa:
                            </h1>
                            <h1
                              style="
                                font-size: 32px;
                                line-height: 1.3;
                                font-weight: 700;
                                text-align: center;
                                letter-spacing: -1px;
                              "
                            >
                              ${raffleNumbers.join(", ")}
                            </h1>
                          </tbody>
                        </table>
                        <hr
                          style="
                            width: 100%;
                            border: none;
                            border-top: 1px solid #eaeaea;
                            border-color: #e5e5e5;
                            margin: 0;
                          "
                        />
                        <table
                          align="center"
                          width="100%"
                          border="0"
                          cellpadding="0"
                          cellspacing="0"
                          role="presentation"
                          style="
                            padding-left: 40px;
                            padding-right: 40px;
                            padding-top: 40px;
                            padding-bottom: 40px;
                          "
                        >
                          <tbody>
                            <tr>
                              <td>
                                <table
                                  align="center"
                                  width="100%"
                                  border="0"
                                  cellpadding="0"
                                  cellspacing="0"
                                  role="presentation"
                                >
                                  <tbody style="width: 100%">
                                    <tr style="width: 100%">
                                      <td data-id="__react-email-column">
                                        <img
                                          alt="QR Code"
                                          src="cid:qrCode"
                                          style="
                                            display: block;
                                            outline: none;
                                            border: none;
                                            text-decoration: none;
                                            float: left;
                                          "
                                          width="260px"
                                        />
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <hr
                          style="
                            width: 100%;
                            border: none;
                            border-top: 1px solid #eaeaea;
                            border-color: #e5e5e5;
                            margin: 0;
                          "
                        />
                        <table
                          align="center"
                          width="100%"
                          border="0"
                          cellpadding="0"
                          cellspacing="0"
                          role="presentation"
                          style="
                            padding-left: 40px;
                            padding-right: 40px;
                            padding-top: 22px;
                            padding-bottom: 22px;
                          "
                        >
                          <tbody>
                            <tr>
                              <td>
                                <p
                                  style="
                                    font-size: 15px;
                                    line-height: 2;
                                    margin: auto;
                                    font-weight: bold;
                                    text-align: center;
                                  "
                                >
                                  Fecha de reserva
                                </p>
                                <p
                                  style="
                                    font-size: 15px;
                                    text-align: center;
                                    line-height: 2;
                                    margin: auto;
                                    font-weight: bold;
                                  "
                                >
                                  ${new Date().toLocaleDateString()}
                                </p>
                              </td>
                            </tr>
                          </tbody>
                        </table>
            
                        <hr
                          style="
                            width: 100%;
                            border: none;
                            border-top: 1px solid #eaeaea;
                            border-color: #e5e5e5;
                            margin: 0;
                          "
                        />
            
                        <hr
                          style="
                            width: 100%;
                            border: none;
                            border-top: 1px solid #eaeaea;
                            border-color: #e5e5e5;
                            margin: 0;
                          "
                        />
                        <table
                          align="center"
                          width="100%"
                          border="0"
                          cellpadding="0"
                          cellspacing="0"
                          role="presentation"
                          style="padding-top: 22px; padding-bottom: 22px"
                        >
                          <tbody>
                            <tr>
                              <td>
                                <table
                                  align="center"
                                  width="100%"
                                  border="0"
                                  cellpadding="0"
                                  cellspacing="0"
                                  role="presentation"
                                >
                                  <tbody style="width: 100%">
                                    <tr style="width: 100%">
                                      <p
                                        style="
                                          font-size: 32px;
                                          line-height: 1.3;
                                          margin: 16px 0;
                                          font-weight: 700;
                                          text-align: center;
                                          letter-spacing: -1px;
                                        "
                                      >
                                        www.bandacedesdonbosco.com
                                      </p>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <hr
                          style="
                            width: 100%;
                            border: none;
                            border-top: 1px solid #eaeaea;
                            border-color: #e5e5e5;
                            margin: 0;
                            margin-top: 12px;
                          "
                        />
                        <table
                          align="center"
                          width="100%"
                          border="0"
                          cellpadding="0"
                          cellspacing="0"
                          role="presentation"
                          style="padding-top: 22px; padding-bottom: 22px"
                        >
                          <tbody>
                            <tr>
                              <td>
                                <table
                                  align="center"
                                  width="100%"
                                  border="0"
                                  cellpadding="0"
                                  cellspacing="0"
                                  role="presentation"
                                >
                                  <tbody style="width: 100%">
                                    <tr style="width: 100%">
                                      <p
                                        style="
                                          font-size: 13px;
                                          line-height: 24px;
                                          margin: 0;
                                          color: #afafaf;
                                          text-align: center;
                                          padding-top: 30px;
                                          padding-bottom: 30px;
                                        "
                                      >
                                        Por favor contáctanos si tienes alguna pregunta. (Si
                                        respondes a este correo, no podremos ver el
                                        mensaje.)
                                      </p>
                                    </tr>
                                  </tbody>
                                </table>
                                <table
                                  align="center"
                                  width="100%"
                                  border="0"
                                  cellpadding="0"
                                  cellspacing="0"
                                  role="presentation"
                                >
                                  <tbody style="width: 100%">
                                    <tr style="width: 100%">
                                      <p
                                        style="
                                          font-size: 13px;
                                          line-height: 24px;
                                          margin: 0;
                                          color: #afafaf;
                                          text-align: center;
                                        "
                                      >
                                        © 2024 Banda CEDES Don Bosco, Todos los derechos
                                        reservados.
                                      </p>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </body>
            </html>
             `,
              context: {
                ticketNumber: ticket._id.toString(),
                eventDescription: event.description,
                ticketQuantity,
                raffleNumbers: raffleNumbers.join(", "),
                recipientName: user.name,
                recipientAddress: user.address,
                orderNumber: ticket._id.toString(),
                orderDate: new Date().toLocaleDateString(),
                QR_CODE_URL: qrCode,
              },
              attachments: [
                {
                  filename: "ticket.png",
                  content: qrCode.split(",")[1],
                  encoding: "base64",
                  cid: "qrCode",
                },
              ],
            },
          });
        }

        await EventTicket.findByIdAndUpdate(eventId, {
          $inc: { totalTickets: ticketQuantity },
        });

        return ticket;
      } catch (error) {
        console.error("Error assigning tickets:", error);
        throw new Error("Error assigning tickets");
      }
    },

    purchaseTicket: async (
      _,
      { eventId, buyerName, buyerEmail, ticketQuantity }
    ) => {
      try {
        const event = await EventTicket.findById(eventId);
        if (!event) throw new Error("Event not found");

        let raffleNumbers = [];
        if (event.raffleEnabled) {
          raffleNumbers = await generateRaffleNumbers(eventId, ticketQuantity);
        }

        const ticket = new Ticket({
          eventId,
          type: "purchased",
          ticketQuantity,
          buyerName,
          buyerEmail,
          qrCode: "", // Inicialmente vacío
          raffleNumbers, // Asignar números de rifa si aplica
        });
        await ticket.save();
        console.log("Saved ticket:", ticket);

        const qrCodeData = JSON.stringify({
          ticketId: ticket._id.toString(), // Incluir el ticketId
          eventId: eventId.toString(),
          type: "purchased",
        });
        console.log("Generated QR code data:", qrCodeData);
        const qrCode = await QRCode.toDataURL(qrCodeData);
        console.log("Generated QR code:", qrCode);

        ticket.qrCode = qrCodeData;
        await ticket.save();
        console.log("Updated ticket with QR code:", ticket);

        await resolvers.Mutation.sendEmail(null, {
          input: {
            to: buyerEmail,
            subject: "Entradas asignadas",
            text: "Aquí están tus entradas.",
            html: `<html dir="ltr" lang="en">
            <head>
              <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
              <meta name="x-apple-disable-message-reformatting" />
            </head>
            <body style="background-color: #ffffff">
              <table
                align="center"
                width="100%"
                border="0"
                cellpadding="0"
                cellspacing="0"
                role="presentation"
                style="
                  max-width: 100%;
                  margin: 10px auto;
                  width: 600px;
                  border: 1px solid #e5e5e5;
                "
              >
                <tbody>
                  <tr style="width: 100%">
                    <td>
                      <table
                        align="center"
                        width="100%"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                        style="padding: 22px 40px"
                      >
                        <tbody>
                          <tr>
                            <td>
                              <table
                                align="center"
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                role="presentation"
                              >
                                <tbody style="width: 100%">
                                  <tr style="width: 100%">
                                    <td data-id="__react-email-column">
                                      <p
                                        style="
                                          font-size: 14px;
                                          line-height: 2;
                                          margin: 0;
                                          font-weight: bold;
                                          text-align: center;
                                        "
                                      >
                                        Número de Entrada
                                      </p>
                                      <p
                                        style="
                                          font-size: 14px;
                                          line-height: 1.4;
                                          margin: 12px 0 0 0;
                                          font-weight: 500;
                                          color: #6f6f6f;
                                          text-align: center;
                                        "
                                      >
                                        ${ticket._id.toString()}
                                      </p>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <hr
                        style="
                          width: 100%;
                          border: none;
                          border-top: 1px solid #eaeaea;
                          border-color: #e5e5e5;
                          margin: 0;
                        "
                      />
                      <table
                        align="center"
                        width="100%"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                        style="padding: 40px 74px; text-align: center"
                      >
                        <tbody>
                          <tr>
                            <td>
                              <img
                                alt="Banda CEDES Don Bosco"
                                height="120px"
                                src="https://res.cloudinary.com/dnv9akklf/image/upload/q_auto,f_auto/v1686511395/LOGO_BCDB_qvjabt.png"
                                style="
                                  display: block;
                                  outline: none;
                                  border: none;
                                  text-decoration: none;
                                  margin: auto;
                                "
                                width="200px"
                              />
                              <h1
                                style="
                                  font-size: 32px;
                                  line-height: 1.3;
                                  font-weight: 700;
                                  text-align: center;
                                  letter-spacing: -1px;
                                "
                              >
                                ¡ ${event.description}!
                              </h1>
                              <p
                                style="
                                  font-size: 14px;
                                  line-height: 2;
                                  margin: 0;
                                  color: #747474;
                                  font-weight: 500;
                                "
                              >
                                Acá están tus entrada para el evento. Utiliza el código QR
                                al presentarlo en la entrada del evento.
                              </p>
                              <p
                                style="
                                  font-size: 14px;
                                  line-height: 2;
                                  margin: 0;
                                  color: #747474;
                                  font-weight: 500;
                                  margin-top: 24px;
                                "
                              >
                                Antes de ingresar a la actividad, las entradas deben estar
                                canceladas al SINPE de la BCDB. (6445-3952) .
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <hr
                        style="
                          width: 100%;
                          border: none;
                          border-top: 1px solid #eaeaea;
                          border-color: #e5e5e5;
                          margin: 0;
                        "
                      />
                      <table
                        align="center"
                        width="100%"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                        style="
                          padding-left: 40px;
                          padding-right: 40px;
                          padding-top: 22px;
                          padding-bottom: 22px;
                        "
                      >
                        <tbody>
                          <tr>
                            <td>
                              <p
                                style="
                                  font-size: 15px;
                                  line-height: 2;
                                  margin: auto;
                                  font-weight: bold;
                                  text-align: center;
                                "
                              >
                                Entradas asignadas a:
                              </p>
                              <p
                                style="
                                  font-size: 15px;
                                  text-align: center;
                                  line-height: 2;
                                  margin: auto;
                                  font-weight: bold;
                                "
                              >
                                ${buyerName}
                              </p>
                            </td>
                          </tr>
                          <h1
                            style="
                              font-size: 32px;
                              line-height: 1.3;
                              font-weight: 700;
                              text-align: center;
                              letter-spacing: -1px;
                            "
                          >
                            Sus números para la rifa:
                          </h1>
                          <h1
                            style="
                              font-size: 32px;
                              line-height: 1.3;
                              font-weight: 700;
                              text-align: center;
                              letter-spacing: -1px;
                            "
                          >
                            ${raffleNumbers.join(", ")}
                          </h1>
                        </tbody>
                      </table>
                      <hr
                        style="
                          width: 100%;
                          border: none;
                          border-top: 1px solid #eaeaea;
                          border-color: #e5e5e5;
                          margin: 0;
                        "
                      />
                      <table
                        align="center"
                        width="100%"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                        style="
                          padding-left: 40px;
                          padding-right: 40px;
                          padding-top: 40px;
                          padding-bottom: 40px;
                        "
                      >
                        <tbody>
                          <tr>
                            <td>
                              <table
                                align="center"
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                role="presentation"
                              >
                                <tbody style="width: 100%">
                                  <tr style="width: 100%">
                                    <td data-id="__react-email-column">
                                      <img
                                        alt="QR Code"
                                        src="cid:qrCode"
                                        style="
                                          display: block;
                                          outline: none;
                                          border: none;
                                          text-decoration: none;
                                          float: left;
                                        "
                                        width="260px"
                                      />
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <hr
                        style="
                          width: 100%;
                          border: none;
                          border-top: 1px solid #eaeaea;
                          border-color: #e5e5e5;
                          margin: 0;
                        "
                      />
                      <table
                        align="center"
                        width="100%"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                        style="
                          padding-left: 40px;
                          padding-right: 40px;
                          padding-top: 22px;
                          padding-bottom: 22px;
                        "
                      >
                        <tbody>
                          <tr>
                            <td>
                              <p
                                style="
                                  font-size: 15px;
                                  line-height: 2;
                                  margin: auto;
                                  font-weight: bold;
                                  text-align: center;
                                "
                              >
                                Fecha de reserva
                              </p>
                              <p
                                style="
                                  font-size: 15px;
                                  text-align: center;
                                  line-height: 2;
                                  margin: auto;
                                  font-weight: bold;
                                "
                              >
                                ${new Date().toLocaleDateString()}
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
          
                      <hr
                        style="
                          width: 100%;
                          border: none;
                          border-top: 1px solid #eaeaea;
                          border-color: #e5e5e5;
                          margin: 0;
                        "
                      />
          
                      <hr
                        style="
                          width: 100%;
                          border: none;
                          border-top: 1px solid #eaeaea;
                          border-color: #e5e5e5;
                          margin: 0;
                        "
                      />
                      <table
                        align="center"
                        width="100%"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                        style="padding-top: 22px; padding-bottom: 22px"
                      >
                        <tbody>
                          <tr>
                            <td>
                              <table
                                align="center"
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                role="presentation"
                              >
                                <tbody style="width: 100%">
                                  <tr style="width: 100%">
                                    <p
                                      style="
                                        font-size: 32px;
                                        line-height: 1.3;
                                        margin: 16px 0;
                                        font-weight: 700;
                                        text-align: center;
                                        letter-spacing: -1px;
                                      "
                                    >
                                      www.bandacedesdonbosco.com
                                    </p>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <hr
                        style="
                          width: 100%;
                          border: none;
                          border-top: 1px solid #eaeaea;
                          border-color: #e5e5e5;
                          margin: 0;
                          margin-top: 12px;
                        "
                      />
                      <table
                        align="center"
                        width="100%"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        role="presentation"
                        style="padding-top: 22px; padding-bottom: 22px"
                      >
                        <tbody>
                          <tr>
                            <td>
                              <table
                                align="center"
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                role="presentation"
                              >
                                <tbody style="width: 100%">
                                  <tr style="width: 100%">
                                    <p
                                      style="
                                        font-size: 13px;
                                        line-height: 24px;
                                        margin: 0;
                                        color: #afafaf;
                                        text-align: center;
                                        padding-top: 30px;
                                        padding-bottom: 30px;
                                      "
                                    >
                                      Por favor contáctanos si tienes alguna pregunta. (Si
                                      respondes a este correo, no podremos ver el
                                      mensaje.)
                                    </p>
                                  </tr>
                                </tbody>
                              </table>
                              <table
                                align="center"
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                role="presentation"
                              >
                                <tbody style="width: 100%">
                                  <tr style="width: 100%">
                                    <p
                                      style="
                                        font-size: 13px;
                                        line-height: 24px;
                                        margin: 0;
                                        color: #afafaf;
                                        text-align: center;
                                      "
                                    >
                                      © 2024 Banda CEDES Don Bosco, Todos los derechos
                                      reservados.
                                    </p>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </body>
          </html>
           `,
            context: {
              ticketNumber: ticket._id.toString(),
              eventDescription: event.description,
              ticketQuantity,
              raffleNumbers: raffleNumbers.join(", "),
              recipientName: buyerName,
              recipientAddress: buyerEmail,
              orderNumber: ticket._id.toString(),
              orderDate: new Date().toLocaleDateString(),
              QR_CODE_URL: qrCode,
            },
            attachments: [
              {
                filename: "ticket.png",
                content: qrCode.split(",")[1],
                encoding: "base64",
                cid: "qrCode",
              },
            ],
          },
        });

        await EventTicket.findByIdAndUpdate(eventId, {
          $inc: { totalTickets: ticketQuantity },
        });

        return ticket;
      } catch (error) {
        console.error("Error purchasing ticket:", error);
        throw new Error("Error purchasing ticket");
      }
    },

    updatePaymentStatus: async (_, { ticketId, amountPaid }) => {
      const ticket = await Ticket.findById(ticketId);
      ticket.amountPaid += amountPaid;
      const event = await EventTicket.findById(ticket.eventId);
      ticket.paid = ticket.amountPaid >= ticket.ticketQuantity * event.price;
      await ticket.save();
      return ticket;
    },

    validateTicket: async (_, { qrCode }) => {
      try {
        console.log("Received QR code for validation:", qrCode);
        const decodedData = JSON.parse(qrCode);
        console.log("Decoded data:", decodedData);

        const { ticketId } = decodedData;
        if (!ticketId) throw new Error("Invalid QR code: ticketId is missing");
        console.log("Ticket ID:", ticketId);

        const ticket = await Ticket.findById(ticketId).populate("userId");
        console.log("Found ticket:", ticket);

        if (!ticket) throw new Error("Invalid ticket");

        if (!ticket.paid) {
          throw new Error("Ticket not paid");
        }

        if (ticket.scans >= ticket.ticketQuantity) {
          throw new Error("Ticket has already been fully scanned");
        }

        ticket.scans += 1;

        // Check if the ticket has been fully scanned
        if (ticket.scans >= ticket.ticketQuantity) {
          ticket.scanned = true;
        }

        await ticket.save();

        console.log("Ticket validated successfully:", ticket);
        return {
          ...ticket.toObject(),
          userName: ticket.userId
            ? `${ticket.userId.name} ${ticket.userId.firstSurName} ${ticket.userId.secondSurName}`
            : ticket.buyerName,
          scanMessage: `${ticket.scans}/${ticket.ticketQuantity}`,
        };
      } catch (error) {
        console.error("Error validating ticket:", error);
        throw new Error(error.message);
      }
    },
  },

  Ticket: {
    userId: async (ticket) => {
      return await User.findById(ticket.userId);
    },
  },
};

module.exports = resolvers;
