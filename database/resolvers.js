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
const AttendanceClass = require("../models/ClassAttendance");
const { ApolloError } = require("apollo-server-express");

// Hashing
const bcrypt = require("bcrypt");
const admin = require("firebase-admin");
const DocumentService = require("../services/documentService");
const { daysUntilExpiration } = require("../utils/expiration");
const { DateTimeScalar } = require("graphql-date-scalars");

// const serviceAccount = require("../config/bcdb-app-9466f-firebase-adminsdk-zgvqc-f234733af3.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

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

// HELPERS para resolvers
function requireAuth(context) {
  if (!context.user) {
    throw new ApolloError("No autenticado", "UNAUTHENTICATED");
  }
  return context.user;
}

function getUserId(user) {
  // Normalizar el ID del usuario (puede venir como _id o id)
  return user._id || user.id;
}

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
  DateTime: DateTimeScalar,
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
        const users = await User.find({})
          .select("-password -resetPasswordToken -resetPasswordExpires") // AGREGAR - no traer campos innecesarios
          .sort({ firstSurName: 1, secondSurName: 1, name: 1 })
          .lean();

        console.timeEnd("getUsers");
        return users;
      } catch (error) {
        console.error(error);
        throw new Error("Error fetching users");
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
        const parents = await Parent.find({}).sort({
          firstSurName: 1,
          secondSurName: 1,
          name: 1,
        });
        return parents;
      } catch (error) {
        console.log(error);
        throw new Error("Error fetching parents");
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

    getTicketsNumbers: async (_, { eventId }) => {
      try {
        const query = eventId ? { eventId } : {};
        const tickets = await Ticket.find(query).populate({
          path: "userId",
          select: "name firstSurName secondSurName email",
        });

        // Crear un array de objetos que contengan los números de la rifa y la información del comprador
        const allRaffleNumbers = tickets.flatMap((ticket) =>
          ticket.raffleNumbers.map((number) => ({
            number,
            buyerName:
              ticket.buyerName ||
              `${ticket.userId?.name} ${ticket.userId?.firstSurName} ${ticket.userId?.secondSurName}`,
            buyerEmail: ticket.buyerEmail || ticket.userId?.email,
            paid: ticket.paid,
          }))
        );

        return allRaffleNumbers;
      } catch (error) {
        console.log(error);
        throw new Error("Failed to fetch tickets");
      }
    },
    getEventsT: async () => await EventTicket.find(),

    usersWithoutMedicalRecord: async () => {
      const users = await User.aggregate([
        {
          $lookup: {
            from: "medicalrecords", // Nombre de la colección en MongoDB
            localField: "_id",
            foreignField: "user",
            as: "medicalRecord",
          },
        },
        {
          $match: {
            medicalRecord: { $eq: [] },
          },
        },
      ]);
      return users;
    },
    usersWithoutAvatar: async () => {
      const users = await User.find({
        $or: [{ avatar: null }, { avatar: { $exists: false } }],
      });
      return users;
    },
    usersWithoutNotificationTokens: async () => {
      const users = await User.find({
        $or: [
          { notificationTokens: { $exists: false } },
          { notificationTokens: { $size: 0 } },
        ],
      });
      return users;
    },
    usersWithStatus: async () => {
      const usersWithStatus = await User.aggregate([
        // Unir con la colección de fichas médicas
        {
          $lookup: {
            from: "medicalrecords", // Asegúrate de que este nombre coincida con tu colección
            localField: "_id",
            foreignField: "user",
            as: "medicalRecord",
          },
        },
        // Proyectar los campos necesarios y calcular los indicadores
        {
          $project: {
            user: {
              _id: "$_id",
              name: "$name",
              firstSurName: "$firstSurName",
              secondSurName: "$secondSurName",
              email: "$email",
              // ... otros campos del usuario que quieras incluir
            },
            hasMedicalRecord: {
              $gt: [{ $size: "$medicalRecord" }, 0],
            },
            hasAvatar: {
              $cond: [{ $ifNull: ["$avatar", false] }, true, false],
            },
            hasNotificationTokens: {
              $gt: [{ $size: { $ifNull: ["$notificationTokens", []] } }, 0],
            },
          },
        },
      ]);

      return usersWithStatus;
    },

    usersWithMissingData: async () => {
      const usersWithMissingData = await User.aggregate([
        // Unir con la colección de fichas médicas
        {
          $lookup: {
            from: "medicalrecords",
            localField: "_id",
            foreignField: "user",
            as: "medicalRecord",
          },
        },
        // Calcular los campos faltantes y proyectar instrument
        {
          $project: {
            name: {
              $trim: {
                input: {
                  $concat: [
                    "$name",
                    " ",
                    "$firstSurName",
                    " ",
                    "$secondSurName",
                  ],
                },
              },
            },
            instrument: 1, // Incluir instrument
            missingFieldsArray: {
              $concatArrays: [
                {
                  $cond: [
                    { $gt: [{ $size: "$medicalRecord" }, 0] },
                    [],
                    ["Ficha Médica"],
                  ],
                },
                {
                  $cond: [{ $ifNull: ["$avatar", false] }, [], ["Avatar"]],
                },
                {
                  $cond: [
                    {
                      $gt: [
                        { $size: { $ifNull: ["$notificationTokens", []] } },
                        0,
                      ],
                    },
                    [],
                    ["Tokens de Notificación"],
                  ],
                },
              ],
            },
          },
        },
        // Filtrar usuarios que les falta al menos un campo
        {
          $match: {
            missingFieldsArray: { $ne: [] },
          },
        },
        // Combinar los campos faltantes en un solo string
        {
          $addFields: {
            missingFields: {
              $reduce: {
                input: "$missingFieldsArray",
                initialValue: "",
                in: {
                  $concat: [
                    "$$value",
                    {
                      $cond: [{ $eq: ["$$value", ""] }, "", ", "],
                    },
                    "$$this",
                  ],
                },
              },
            },
          },
        },
        // Agregar el campo summary incluyendo instrument
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
        // Eliminar el campo temporal missingFieldsArray
        {
          $project: {
            missingFieldsArray: 0,
          },
        },
      ]);

      return usersWithMissingData;
    },

    // Resolver para obtener estudiantes asignados al instructor
    getInstructorStudents: async (_, {}, ctx) => {
      console.log(ctx.user);
      if (!ctx.user || ctx.user.role !== "Instructor de instrumento") {
        throw new Error("No autorizado");
      }
      const instructor = await User.findById(ctx.user.id).populate("students");
      return instructor.students;
    },

    // Resolver para obtener asistencias de los estudiantes asignados al instructor
    getInstructorStudentsAttendance: async (_, { date }, ctx) => {
      if (!ctx.user || ctx.user.role !== "Instructor de instrumento") {
        throw new Error("No autorizado");
      }

      // Convierte la fecha proporcionada a un objeto Date y normaliza la hora
      const selectedDate = new Date(date);
      selectedDate.setHours(0, 0, 0, 0);

      // Establece el rango de la fecha seleccionada para cubrir todo el día
      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);

      // Busca los registros de asistencia para la fecha seleccionada
      const attendances = await AttendanceClass.find({
        instructor: ctx.user.id,
        date: {
          $gte: selectedDate,
          $lt: nextDate,
        },
      })
        .populate("student")
        .populate("instructor");

      return attendances;
    },

    getUsersByInstrument: async (_, {}, ctx) => {
      if (!ctx.user || ctx.user.role !== "Instructor de instrumento") {
        throw new Error("No autorizado");
      }
      const students = await User.find({
        instrument: ctx.user.instrument,
        role: { $ne: "Instructor de instrumento" },
      });
      return students;
    },

    // Resolver para obtener todas las asistencias y pagos
    getAllAttendances: async (_, {}, ctx) => {
      if (!ctx.user || ctx.user.role !== "Admin") {
        throw new Error("No autorizado");
      }

      const attendances = await AttendanceClass.find({})
        .populate("student")
        .populate("instructor");

      return attendances;
    },

    //

    myDocuments: async (_, { filters, pagination }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.getMyDocuments(
        filters || {},
        pagination || {},
        userId
      );
    },

    documentById: async (_, { id }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.getDocumentById(id, userId);
    },

    documentsExpiringSummary: async (_, { referenceDate }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.getDocumentsExpiringSummary(
        referenceDate,
        userId
      );
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

      console.log("JWT_SECRET used to sign:", process.env.JWT_SECRET);

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
      if (!ctx.user || !ctx.user.id) {
        throw new Error("User not authenticated");
      }
      // Assign to user
      input.user = ctx.user.id;

      // Save in the database
      try {
        const newMedicalRecord = new MedicalRecord(input);
        const medicalRecord = await newMedicalRecord.save();

        return medicalRecord;
      } catch (error) {
        console.error("Error saving medical record:", error);
        throw new Error(`Error saving medical record: ${error.message}`);
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
    // Resolver para que un instructor se asigne a un estudiante
    assignStudentToInstructor: async (_, { studentId }, { user }) => {
      if (!user || user.role !== "Instructor de instrumento") {
        throw new Error("No autorizado");
      }

      // Obtener estudiante
      const student = await User.findById(studentId);
      if (!student) {
        throw new Error("Estudiante no encontrado");
      }

      // Verificar que el instrumento del estudiante coincida con el del instructor
      // if (student.instrument !== user.instrument) {
      //   throw new Error(
      //     "El estudiante no toca el mismo instrumento que el instructor"
      //   );
      // }

      // Verificar que el estudiante no sea un instructor
      if (student.role === "Instructor de instrumento") {
        throw new Error("No puedes asignar a otro instructor");
      }

      // Asignar estudiante al instructor
      await User.findByIdAndUpdate(user.id, {
        $addToSet: { students: studentId },
      });
      // Asignar instructor al estudiante
      await User.findByIdAndUpdate(studentId, { instructor: user.id });

      return true;
    },

    // Resolver para crear un registro de asistencia y pago
    markAttendanceAndPayment: async (_, { input }, { user }) => {
      if (!user || user.role !== "Instructor de instrumento") {
        throw new Error("No autorizado");
      }

      const {
        studentId,
        date,
        attendanceStatus,
        justification,
        paymentStatus,
      } = input;

      // Verificar que el estudiante esté asignado al instructor
      const instructor = await User.findById(user.id);
      if (!instructor.students.includes(studentId)) {
        throw new Error("El estudiante no está asignado a este instructor");
      }

      // Buscar si ya existe un registro de asistencia para el estudiante en la fecha dada
      let attendance = await AttendanceClass.findOne({
        student: studentId,
        instructor: user.id,
        date: new Date(date).setHours(0, 0, 0, 0), // Ignorar horas, minutos, segundos
      });

      if (attendance) {
        // Actualizar registro existente
        attendance.attendanceStatus = attendanceStatus;
        attendance.justification = justification;
        attendance.paymentStatus = paymentStatus;
      } else {
        // Crear nuevo registro
        attendance = new AttendanceClass({
          student: studentId,
          instructor: user.id,
          date: new Date(date).setHours(0, 0, 0, 0),
          attendanceStatus,
          justification,
          paymentStatus,
        });
      }

      await attendance.save();
      return attendance;
    },

    // #################################################
    // Exalumnos

    addExAlumno: async (_, { input }) => {
      try {
        if (input.instrument === "Percusión") {
          const count = await Exalumno.countDocuments({
            instrument: "Percusión",
          });
          if (count >= 6) {
            throw new Error(
              "El cupo para Percusión está lleno. No se permiten más inscripciones para Percusión."
            );
          }
        }

        if (input.instrument === "Mallets") {
          const count = await Exalumno.countDocuments({
            instrument: "Mallets",
          });
          if (count >= 3) {
            throw new Error(
              "El cupo para Mallets está lleno. No se permiten más inscripciones para Percusión."
            );
          }
        }
        const newExAlumno = new Exalumno(input);
        return await newExAlumno.save();
      } catch (error) {
        console.error(error);
        throw new Error(error.message || "Failed to add ex-alumno.");
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
      try {
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

        console.log(tokens);
        // console.log(tokens);

        // 3️⃣ Enviar la notificación solo si hay tokens
        if (tokens.length > 0) {
          const message = {
            notification: {
              title: "Banda CEDES Don Bosco - Nuevo Producto Disponible",
              body: "Un nuevo producto ha sido añadido y ya puedes hacer la solicitud de tu almuerzo.",
            },
            tokens: tokens,
          };

          // 🔹 Se usa `sendEachForMulticast()` en lugar de `sendMulticast()`
          const response = await admin
            .messaging()
            .sendEachForMulticast(message);
          console.log(
            `${response.successCount} mensajes fueron enviados exitosamente.`
          );

          // 4️⃣ Manejo de errores en el envío de notificaciones
          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                console.log(`Error en el token en índice ${idx}:`, resp.error);
              }
            });
          }
        }

        return newProduct;
      } catch (error) {
        console.error(
          "Error al crear el producto o enviar notificación:",
          error
        );
        throw new Error("Hubo un problema al crear el producto.");
      }
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

    updateUserState: async () => {
      try {
        const users = await User.find({}); // Encuentra todos los usuarios
        for (const user of users) {
          if (user.grade === "") {
            user.state = "Exalumno";
            await user.save(); // Guarda los cambios en la base de datos
          }
        }

        return true;
      } catch (error) {}
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
        const qrCode = await QRCode.toDataURL(qrCodeData);

        ticket.qrCode = qrCode;
        await ticket.save();

        const user = await User.findById(userId);
        if (!user) throw new Error("User not found");

        const parent = await Parent.findOne({ children: userId });

        const emailPromises = [
          resolvers.Mutation.sendEmail(null, {
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
                                  Acá están tu/s entrada/s para la/el ${
                                    event.name
                                  }. Utiliza el código QR
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

                             <tr>
                              <td>
                                <p
                                  style="
                                    font-size: 12px;
                                    line-height: 2;
                                    margin: auto;
                                    text-align: center;
                                  "
                                >
                                 Si necesita más entradas contactar a:
                                </p>
                                  <div style="
                                   width: 100%;
                                    text-align: center;
                                  " >
                                <a href="https://wa.link/mh2ots"
                                  style="
                                    font-size: 12px;
                                    text-align: center;
                                    line-height: 2;
                                    margin: auto;
                                  "
                              >Josué Chinchilla</a>
                                 </div>
                              </td>
                            </tr>
                           <!--  <h1
                              style="
                                font-size: 32px;
                                line-height: 1.3;
                                font-weight: 700;
                                text-align: center;
                                letter-spacing: -1px;
                              "
                            >
                              Sus números para la rifa:
                            </h1>-->
                            <h1
                              style="
                                font-size: 32px;
                                line-height: 1.3;
                                font-weight: 700;
                                text-align: center;
                                letter-spacing: -1px;
                              "
                            >
                            ${raffleNumbers
                              .map((number) => `<div>${number}</div>`)
                              .join("")}
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
                                        © 2025 Banda CEDES Don Bosco, Todos los derechos
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
          }),
        ];

        if (parent) {
          emailPromises.push(
            resolvers.Mutation.sendEmail(null, {
              input: {
                to: parent.email,
                subject: "Entradas asignadas a su hijo/a",
                text: "Aquí están las entradas asignadas a su hijo/a.",
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
                                  Acá están tu/s entrada/s para el evento. Utiliza el código QR
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
                                <tr>
                              <td>
                                <p
                                  style="
                                    font-size: 12px;
                                    line-height: 2;
                                    margin: auto;
                                    text-align: center;
                                  "
                                >
                                 Si necesita más entradas contactar a:
                                </p>
                                <div style="
                                   width: 100%;
                                    text-align: center;
                                  " >

                                <a href="https://wa.link/mh2ots"
                                  style="
                                    font-size: 12px;
                                    text-align: center;
                                    line-height: 2;
                                    margin: auto;
                                  "
                              >Josué Chinchilla</a>
                                </div>

                              </td>
                            </tr>
                         <!--  <h1
                              style="
                                font-size: 32px;
                                line-height: 1.3;
                                font-weight: 700;
                                text-align: center;
                                letter-spacing: -1px;
                              "
                            >
                              Sus números para la rifa:
                            </h1>-->
                            <h1
                              style="
                                font-size: 32px;
                                line-height: 1.3;
                                font-weight: 700;
                                text-align: center;
                                letter-spacing: -1px;
                              "
                            >
                            ${raffleNumbers
                              .map((number) => `<div>${number}</div>`)
                              .join("")}
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
                                        © 2025 Banda CEDES Don Bosco, Todos los derechos
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
            })
          );
        }

        await Promise.all(emailPromises);

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
        const qrCode = await QRCode.toDataURL(qrCodeData);

        ticket.qrCode = qrCodeData;
        await ticket.save();

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
                                Acá están tu/s entrada/s para el evento. Utiliza el código QR
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
                      <!--  <h1
                              style="
                                font-size: 32px;
                                line-height: 1.3;
                                font-weight: 700;
                                text-align: center;
                                letter-spacing: -1px;
                              "
                            >
                              Sus números para la rifa:
                            </h1>-->
                          <h1
                            style="
                              font-size: 32px;
                              line-height: 1.3;
                              font-weight: 700;
                              text-align: center;
                              letter-spacing: -1px;
                            "
                          >
                           ${raffleNumbers
                             .map((number) => `<div>${number}</div>`)
                             .join("")}
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
                                      © 2025 Banda CEDES Don Bosco, Todos los derechos
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

    sendCourtesyTicket: async (
      _,
      { eventId, buyerName, buyerEmail, ticketQuantity }
    ) => {
      try {
        const event = await EventTicket.findById(eventId);
        if (!event) throw new Error("Event not found");

        const ticket = new Ticket({
          eventId,
          type: "courtesy",
          ticketQuantity,
          buyerName,
          buyerEmail,
          qrCode: "", // Se asignará después
          paid: true, // Marcar como pagado
        });

        await ticket.save();

        // QR válido con el ticket._id real
        const qrCodeData = JSON.stringify({
          ticketId: ticket._id.toString(), // Incluir el ticketId
          eventId: eventId.toString(),
          type: "courtesy",
        });

        const qrCode = await QRCode.toDataURL(qrCodeData);

        // Asignar QR al ticket y guardar
        ticket.qrCode = qrCodeData;
        await ticket.save();

        await resolvers.Mutation.sendEmail(null, {
          input: {
            to: buyerEmail,
            subject: "🎟 Entrada de cortesía - 60 Aniversario BCDB",
            text: "Gracias por acompañarnos. Aquí está tu entrada.",
            html: `
            <html
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  lang="en"
>
  <head>
    <title></title>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--[if mso]>
      <xml
        ><w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word"
          ><w:DontUseAdvancedTypographyReadingMail
        /></w:WordDocument>
        <o:OfficeDocumentSettings
          ><o:PixelsPerInch>96</o:PixelsPerInch
          ><o:AllowPNG /></o:OfficeDocumentSettings
      ></xml>
    <![endif]-->
    <!--[if !mso]><!-->
    <link
      href="https://fonts.googleapis.com/css2?family=Oswald:wght@100;200;300;400;500;600;700;800;900"
      rel="stylesheet"
      type="text/css"
    />
    <!--<![endif]-->
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
      }

      a[x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: inherit !important;
      }

      #MessageViewBody a {
        color: inherit;
        text-decoration: none;
      }

      p {
        line-height: inherit;
      }

      .desktop_hide,
      .desktop_hide table {
        mso-hide: all;
        display: none;
        max-height: 0px;
        overflow: hidden;
      }

      .image_block img + div {
        display: none;
      }

      sup,
      sub {
        font-size: 75%;
        line-height: 0;
      }

      .row-2 .column-1 .block-3 .button:hover,
      .row-7 .column-1 .block-3 .button:hover,
      .row-8 .column-2 .block-1 .button:hover {
        background-color: #fff8e6 !important;
        border-bottom: 1px solid #ffc75e !important;
        border-left: 1px solid #ffc75e !important;
        border-right: 1px solid #ffc75e !important;
        border-top: 1px solid #ffc75e !important;
        color: #5a3b36 !important;
      }

      @media (max-width: 720px) {
        .desktop_hide table.icons-inner,
        .row-8 .column-2 .block-1.button_block .alignment .button,
        .social_block.desktop_hide .social-table {
          display: inline-block !important;
        }

        .icons-inner {
          text-align: center;
        }

        .icons-inner td {
          margin: 0 auto;
        }

        .image_block div.fullWidth {
          max-width: 100% !important;
        }

        .mobile_hide {
          display: none;
        }

        .row-content {
          width: 100% !important;
        }

        .stack .column {
          width: 100%;
          display: block;
        }

        .mobile_hide {
          min-height: 0;
          max-height: 0;
          max-width: 0;
          overflow: hidden;
          font-size: 0px;
        }

        .desktop_hide,
        .desktop_hide table {
          display: table !important;
          max-height: none !important;
        }

        .reverse {
          display: table;
          width: 100%;
        }

        .reverse .column.first {
          display: table-footer-group !important;
        }

        .reverse .column.last {
          display: table-header-group !important;
        }

        .row-4 td.column.first .border {
          padding: 0 15px;
        }

        .row-4 td.column.last .border {
          padding: 0;
        }

        .row-1 .column-1 .block-3.heading_block h3,
        .row-3 .column-2 .block-2.heading_block h3,
        .row-4 .column-1 .block-2.heading_block h3,
        .row-5 .column-1 .block-1.heading_block h3,
        .row-8 .column-1 .block-1.heading_block h3 {
          font-size: 25px !important;
        }

        .row-1 .column-1 .block-4.heading_block h1 {
          font-size: 75px !important;
        }

        .row-2 .column-1 .block-2.paragraph_block td.pad {
          padding: 10px !important;
        }

        .row-2 .column-1 .block-5.heading_block h2,
        .row-5 .column-1 .block-2.heading_block h2 {
          font-size: 45px !important;
        }

        .row-5 .column-1 .block-2.heading_block td.pad {
          padding: 10px 25px !important;
        }

        .row-6 .column-1 .block-1.heading_block h3,
        .row-6 .column-2 .block-1.paragraph_block td.pad > div,
        .row-6 .column-2 .block-3.paragraph_block td.pad > div,
        .row-6 .column-2 .block-5.paragraph_block td.pad > div,
        .row-6 .column-2 .block-7.paragraph_block td.pad > div {
          text-align: left !important;
        }

        .row-6 .column-2 .block-1.paragraph_block td.pad,
        .row-6 .column-2 .block-2.divider_block td.pad,
        .row-6 .column-2 .block-3.paragraph_block td.pad,
        .row-6 .column-2 .block-4.divider_block td.pad,
        .row-6 .column-2 .block-5.paragraph_block td.pad,
        .row-6 .column-2 .block-6.divider_block td.pad,
        .row-6 .column-2 .block-7.paragraph_block td.pad {
          padding: 5px 10px !important;
        }

        .row-6 .column-2 .block-2.divider_block .alignment table,
        .row-6 .column-2 .block-4.divider_block .alignment table,
        .row-6 .column-2 .block-6.divider_block .alignment table {
          display: inline-table;
        }

        .row-7 .column-1 .block-1.spacer_block {
          height: 150px !important;
        }

        .row-7 .column-1 .block-4.spacer_block {
          height: 10px !important;
        }

        .row-8 .column-1 .block-1.heading_block h3,
        .row-8 .column-2 .block-1.button_block .alignment {
          text-align: center !important;
        }

        .row-8 .column-2 .block-1.button_block span {
          line-height: 36px !important;
        }

        .row-6 .row-content {
          padding: 0 35px 25px !important;
        }

        .row-8 .row-content {
          padding: 25px 15px 15px !important;
        }

        .row-9 .row-content {
          padding: 0 0 25px !important;
        }

        .row-3 .column-2,
        .row-4 .column-1 .border {
          padding: 15px !important;
        }

        .row-6 .column-1 {
          padding: 5px !important;
        }

        .row-7 .column-1 {
          padding: 5px 25px !important;
        }

        .row-9 .column-1 {
          padding: 0 3px 0 6px !important;
        }

        .row-9 .column-2 {
          padding: 0 3px !important;
        }

        .row-9 .column-3 {
          padding: 0 6px 0 3px !important;
        }
      }
    </style>
    <!--[if mso
      ]><style>
        sup,
        sub {
          font-size: 100% !important;
        }
        sup {
          mso-text-raise: 10%;
        }
        sub {
          mso-text-raise: -10%;
        }
      </style>
    <![endif]-->
  </head>

  <body
    class="body"
    style="
      background-color: #293964;
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: none;
      text-size-adjust: none;
    "
  >
    <table
      class="nl-container"
      width="100%"
      border="0"
      cellpadding="0"
      cellspacing="0"
      role="presentation"
      style="
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
        background-color: #293964;
      "
    >
      <tbody>
        <tr>
          <td>
            <table
              class="row row-1"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        background-color: #293964;
                        background-image: url('https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511065/effect_sczdbc.png');
                        background-repeat: no-repeat;
                        color: #000000;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr>
                          <td
                            class="column column-1"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-top: 25px;
                              vertical-align: top;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad" style="width: 100%">
                                  <div class="alignment" align="center">
                                    <div style="max-width: 197px">
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/Logo_BCDB_-_Bg_White_mfxnej.png"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                        "
                                        width="197"
                                        alt="Your Logo Placeholder"
                                        title="Your Logo Placeholder"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <div
                              class="spacer_block block-2"
                              style="
                                height: 21px;
                                line-height: 21px;
                                font-size: 1px;
                              "
                            >
                              &#8202;
                            </div>
                            <table
                              class="heading_block block-3"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="
                                    padding-left: 10px;
                                    padding-right: 10px;
                                    padding-top: 10px;
                                    text-align: center;
                                    width: 100%;
                                  "
                                >
                                  <h3
                                    style="
                                      margin: 0;
                                      color: #fafafa;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 35px;
                                      font-weight: 700;
                                      letter-spacing: normal;
                                      line-height: 1.2;
                                      text-align: center;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                      mso-line-height-alt: 42px;
                                    "
                                  >
                                    <span
                                      class="tinyMce-placeholder"
                                      style="word-break: break-word"
                                      >   ¡GRACIAS POR SER PARTE DE ESTA HISTORIA!</span
                                    >
                                  </h3>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="heading_block block-4"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <h1
                                    style="
                                      margin: 0;
                                      color: #fafafa;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 100px;
                                      font-weight: 700;
                                      letter-spacing: -2px;
                                     line-height: 1.3; /* antes: 1 */
    text-align: center;
    mso-line-height-alt: 104px;
                                      text-align: center;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                     
                                    "
                                  >
                                  CELEBRAMOS <br />  60 AÑOS 
                              
                                  </h1>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              class="row row-2"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-radius: 0;
                        background-color: #fafafa;
                        color: #000000;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr>
                          <td
                            class="column column-1"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              vertical-align: top;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad" style="width: 100%">
                                  <div class="alignment" align="center">
                                    <div style="max-width: 700px; ">
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511066/DSC08255_ndwf2n.webp"
                                        style="
                                          display: block;
                                          height: auto;
                                         
                                          width: 100%;
                                        "
                                        width="700"
                                        alt="Hero Image"
                                        title="Hero Image"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="paragraph_block block-2"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                                word-break: break-word;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="
                                    padding-bottom: 10px;
                                    padding-left: 60px;
                                    padding-right: 60px;
                                    padding-top: 10px;
                                  "
                                >
                                  <div
                                    style="
                                      color: #5a3b36;
                                      direction: ltr;
                                      font-family: Helvetica Neue, Helvetica,
                                        Arial, sans-serif;
                                      font-size: 18px;
                                      font-weight: 400;
                                      letter-spacing: 0px;
                                      line-height: 1.2;
                                      text-align: center;
                                      mso-line-height-alt: 22px;
                                    "
                                  >
                                    <p style="margin: 0">
                                      Estimado/a <strong>${buyerName}</strong>, nos complace invitarte cordialmente a la velada especial del 60 aniversario de la Banda CEDES Don Bosco.
                                      <br />
                                       <br />
                           La Banda CEDES Don Bosco cumple 60 años y queremos celebrarlo junto a quienes han sido parte esencial de este legado musical. Te extendemos una cordial invitación para acompañarnos en esta histórica velada.

                                    </p>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="button_block block-3"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <div class="alignment" align="center">
                                    <a
                                    href="https://wa.link/z7nmqs"
                                      target="_blank"
                                      style="
                                        color: #5a3b36;
                                        text-decoration: none;
                                      "
                                      >><!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"  href="www.example.com"  style="height:46px;width:257px;v-text-anchor:middle;" arcsize="123%" fillcolor="#ffc75e">
<v:stroke dashstyle="Solid" weight="1px" color="#ffc75e"/>
<w:anchorlock/>
<v:textbox inset="0px,0px,0px,0px">
<center dir="false" style="color:#5a3b36;font-family:sans-serif;font-size:18px">
<!
                                      [endif]--><span
                                        class="button"
                                        style="
                                          background-color: #ffc75e;
                                          border-bottom: 1px solid #ffc75e;
                                          border-left: 1px solid #ffc75e;
                                          border-radius: 60px;
                                          border-right: 1px solid #ffc75e;
                                          border-top: 1px solid #ffc75e;
                                          color: #5a3b36;
                                          display: inline-block;
                                          font-family: Helvetica Neue, Helvetica,
                                            Arial, sans-serif;
                                          font-size: 18px;
                                          font-weight: 500;
                                          mso-border-alt: none;
                                          padding-bottom: 5px;
                                          padding-top: 5px;
                                          padding-left: 20px;
                                          padding-right: 20px;
                                          text-align: center;
                                          width: auto;
                                          word-break: keep-all;
                                          letter-spacing: normal;
                                        "
                                        ><span
                                          style="
                                            word-break: break-word;
                                            line-height: 36px;
                                          "
                                          >CONFIRMAR ASISTENCIA</span
                                        ></span
                                      >><!--[if mso]></center></v:textbox></v:roundrect><![endif]--></a</a
                                    >
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <div
                              class="spacer_block block-4"
                              style="
                                height: 45px;
                                line-height: 45px;
                                font-size: 1px;
                              "
                            >
                              &#8202;
                            </div>
                            <table
                              class="heading_block block-5"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <h2
                                    style="
                                      margin: 0;
                                      color: #293964;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 60px;
                                      font-weight: 700;
                                      letter-spacing: -2px;
                                      line-height: 1.2;
                                      text-align: center;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                      mso-line-height-alt: 72px;
                                    "
                                  >
                                    <span
                                      class="tinyMce-placeholder"
                                      style="word-break: break-word"
                                      >UNA NOCHE MEMORABLE</span
                                    >
                                  </h2>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              class="row row-3"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-radius: 0;
                        background-color: #fafafa;
                        color: #000000;
                        padding-left: 25px;
                        padding-right: 25px;
                        padding-top: 25px;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr>
                          <td
                            class="column column-1"
                            width="50%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              background-color: #fafafa;
                              vertical-align: middle;
                              border-radius: 12px;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="
                                    width: 100%;
                                    padding-right: 0px;
                                    padding-left: 0px;
                                  "
                                >
                                  <div class="alignment" align="center">
                                    <div style="max-width: 325px">
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511066/DSC07357_sut03v.png"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                          border-radius: 12px 12px 12px 12px;
                                        "
                                        width="325"
                                        alt="Event Lifestyle Image"
                                        title="Event Lifestyle Image"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td
                            class="column gap"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              vertical-align: top;
                            "
                          >
                            <table
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                                width: 10px;
                                height: 10px;
                              "
                              width="10"
                              height="10"
                            ></table>
                          </td>
                          <td
                            class="column column-2"
                            width="50%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              background-color: #e1e1e1;
                              padding-bottom: 5px;
                              padding-left: 15px;
                              padding-right: 15px;
                              padding-top: 5px;
                              vertical-align: middle;
                              border-radius: 12px;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad" style="width: 100%">
                                  <div class="alignment" align="center">
                                    <div style="max-width: 77px">
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/ICON2_dxqwae.png"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                        "
                                        width="77"
                                        alt="ticket icon"
                                        title="ticket icon"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="heading_block block-2"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <h3
                                    style="
                                      margin: 0;
                                      color: #293964;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 35px;
                                      font-weight: 700;
                                      letter-spacing: -1px;
                                      line-height: 1.2;
                                      text-align: center;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                      mso-line-height-alt: 42px;
                                    "
                                  >
                                    <span
                                      class="tinyMce-placeholder"
                                      style="word-break: break-word"
                                      >INVITACIÓN ESPECIAL</span
                                    >
                                  </h3>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="paragraph_block block-3"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                                word-break: break-word;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <div
                                    style="
                                      color: #5a3b36;
                                      direction: ltr;
                                      font-family: Helvetica Neue, Helvetica,
                                        Arial, sans-serif;
                                      font-size: 18px;
                                      font-weight: 400;
                                      letter-spacing: 0px;
                                      line-height: 1.2;
                                      text-align: center;
                                      mso-line-height-alt: 22px;
                                    "
                                  >
                                    <p style="margin: 0">
                                     Te esperamos el sábado 16 de agosto en CEDES Don Bosco, a las 4:30 p.m. Entrada gratuita con previa confirmación.
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              class="row row-4"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        background-color: #fafafa;
                        border-radius: 0;
                        color: #000000;
                        padding: 10px 25px 35px;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr class="reverse">
                          <td
                            class="column column-1 first"
                            width="50%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              background-color: #e1e1e1;
                              padding-left: 15px;
                              padding-right: 15px;
                              vertical-align: middle;
                              border-radius: 12px;
                            "
                          >
                            <div class="border">
                              <table
                                class="image_block block-1"
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                "
                              >
                                <tr>
                                  <td class="pad" style="width: 100%">
                                    <div class="alignment" align="center">
                                      <div style="max-width: 77px">
                                        <img
                                          src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/ICON1_jmklvc.png"
                                          style="
                                            display: block;
                                            height: auto;
                                            border: 0;
                                            width: 100%;
                                          "
                                          width="77"
                                          alt="video icon"
                                          title="video icon"
                                          height="auto"
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              <table
                                class="heading_block block-2"
                                width="100%"
                                border="0"
                                cellpadding="10"
                                cellspacing="0"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                "
                              >
                                <tr>
                                  <td class="pad">
                                    <h3
                                      style="
                                        margin: 0;
                                        color: #293964;
                                        direction: ltr;
                                        font-family: 'Oswald', Arial,
                                          'Helvetica Neue', Helvetica,
                                          sans-serif;
                                        font-size: 35px;
                                        font-weight: 700;
                                        letter-spacing: -1px;
                                        line-height: 1.2;
                                        text-align: center;
                                        margin-top: 0;
                                        margin-bottom: 0;
                                        mso-line-height-alt: 42px;
                                      "
                                    >
                                      <span
                                        class="tinyMce-placeholder"
                                        style="word-break: break-word"
                                        >HOMENAJE Y MÚSICA EN VIVO</span
                                      >
                                    </h3>
                                  </td>
                                </tr>
                              </table>
                              <table
                                class="paragraph_block block-3"
                                width="100%"
                                border="0"
                                cellpadding="10"
                                cellspacing="0"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  word-break: break-word;
                                "
                              >
                                <tr>
                                  <td class="pad">
                                    <div
                                      style="
                                        color: #5a3b36;
                                        direction: ltr;
                                        font-family: Helvetica Neue, Helvetica,
                                          Arial, sans-serif;
                                        font-size: 18px;
                                        font-weight: 400;
                                        letter-spacing: 0px;
                                        line-height: 1.2;
                                        text-align: center;
                                        mso-line-height-alt: 22px;
                                      "
                                    >
                                      <p style="margin: 0">
                                      Un repertorio inolvidable que une generaciones. Desde nuestras raíces hasta lo que hoy somos.
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </div>
                          </td>
                          <td
                            class="column gap"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              vertical-align: top;
                            "
                          >
                            <table
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                                width: 10px;
                                height: 10px;
                              "
                              width="10"
                              height="10"
                            ></table>
                          </td>
                          <td
                            class="column column-2 last"
                            width="50%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              background-color: #fafafa;
                              vertical-align: middle;
                              border-radius: 12px;
                            "
                          >
                            <div class="border">
                              <table
                                class="image_block block-1"
                                width="100%"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                "
                              >
                                <tr>
                                  <td
                                    class="pad"
                                    style="
                                      width: 100%;
                                      padding-right: 0px;
                                      padding-left: 0px;
                                    "
                                  >
                                    <div class="alignment" align="center">
                                      <div style="max-width: 325px">
                                        <img
                                          src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511065/DSC08050_vodv6p.png"
                                          style="
                                            display: block;
                                            height: auto;
                                            border: 0;
                                            width: 100%;
                                            border-radius: 12px;
                                          "
                                          width="325"
                                          alt="Event Lifestyle Image"
                                          title="Event Lifestyle Image"
                                          height="auto"
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              class="row row-5"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        background-color: #ffffff;
                        border-radius: 0;
                        color: #000000;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr>
                          <td
                            class="column column-1"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-top: 35px;
                              vertical-align: top;
                            "
                          >
                            <table
                              class="heading_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="
                                    padding-left: 10px;
                                    padding-right: 10px;
                                    padding-top: 10px;
                                    text-align: center;
                                    width: 100%;
                                  "
                                >
                                  <h3
                                    style="
                                      margin: 0;
                                     color: #293964;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 28px;
                                      font-weight: 700;
                                      letter-spacing: normal;
                                      line-height: 1.2;
                                      text-align: center;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                      mso-line-height-alt: 34px;
                                    "
                                  >
                                    <span
                                      class="tinyMce-placeholder"
                                      style="word-break: break-word"
                                      >Al llegar al evento</span
                                    >
                                  </h3>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="heading_block block-2"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <h2
                                    style="
                                      margin: 0;
                                     color: #293964;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 60px;
                                      font-weight: 700;
                                      letter-spacing: -2px;
                                      line-height: 1.2;
                                      text-align: center;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                      mso-line-height-alt: 72px;
                                    "
                                  >
                                    <span
                                      class="tinyMce-placeholder"
                                      style="word-break: break-word"
                                      >PRESENTA ESTE QR</span
                                    >
                                  </h2>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="image_block block-3"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="padding-bottom: 15px; width: 100%"
                                >
                                  <div class="alignment" align="center">
                                    <div style="max-width: 700px">
                                      <img
                                        alt="QR Code"
                                          src="cid:qrCode"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                        "
                                        width="700"
                                    
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
         
            <table
              class="row row-7"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                       background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
                        background-image: url('https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511066/DSC07446_a1zseh.webp');
                        border-radius: 0;
                        color: #000000;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
  
                      <tbody>
                        <tr>
                          
                          <td
                            class="column column-1"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-left: 35px;
                              padding-right: 60px;
                              padding-top: 5px;
                              vertical-align: top;
                            "
                          >
                            <div
                              class="spacer_block block-1"
                              style="
                                height: 220px;
                                line-height: 220px;
                                font-size: 1px;
                              "
                            >
                              &#8202;
                            </div>
                                               
                            <table
                              class="heading_block block-2"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="
                                    padding-bottom: 10px;
                                    padding-left: 10px;
                                    padding-right: 60px;
                                    padding-top: 10px;
                                    text-align: center;
                                    width: 100%;
                                  "
                                >
                                  <h3
                                    style="
                                      margin: 0;
                                      color: #fafafa;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 35px;
                                      font-weight: 700;
                                      letter-spacing: -1px;
                                      line-height: 1.2;
                                      text-align: left;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                      mso-line-height-alt: 42px;
                                    "
                                  >
                                  CELEBRA CON NOSOTROS 60 AÑOS <br />DE PASIÓN MUSICAL
                                  </h3>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="button_block block-3"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <div class="alignment" align="left">
                                    <a
                                      href="https://wa.link/z7nmqs"
                                      target="_blank"
                                      style="
                                        color: #5a3b36;
                                        text-decoration: none;
                                      "
                                      >><!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"  href="www.example.com"  style="height:46px;width:205px;v-text-anchor:middle;" arcsize="123%" fillcolor="#ffc75e">
<v:stroke dashstyle="Solid" weight="1px" color="#ffc75e"/>
<w:anchorlock/>
<v:textbox inset="0px,0px,0px,0px">
<center dir="false" style="color:#5a3b36;font-family:sans-serif;font-size:18px">
<!
                                      [endif]--><span
                                        class="button"
                                        style="
                                          background-color: #ffc75e;
                                          border-bottom: 1px solid #ffc75e;
                                          border-left: 1px solid #ffc75e;
                                          border-radius: 60px;
                                          border-right: 1px solid #ffc75e;
                                          border-top: 1px solid #ffc75e;
                                          color: #5a3b36;
                                          display: inline-block;
                                          font-family: Helvetica Neue, Helvetica,
                                            Arial, sans-serif;
                                          font-size: 18px;
                                          font-weight: 500;
                                          mso-border-alt: none;
                                          padding-bottom: 5px;
                                          padding-top: 5px;
                                          padding-left: 20px;
                                          padding-right: 20px;
                                          text-align: center;
                                          width: auto;
                                          word-break: keep-all;
                                          letter-spacing: normal;
                                        "
                                        ><span
                                          style="
                                            word-break: break-word;
                                            line-height: 36px;
                                          "
                                          >CONFIRMAR ASISTENCIA</span
                                        ></span
                                      >><!--[if mso]></center></v:textbox></v:roundrect><![endif]--></a</a
                                    >
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <div
                              class="spacer_block block-4"
                              style="
                                height: 50px;
                                line-height: 50px;
                                font-size: 1px;
                              "
                            >
                              &#8202;
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              class="row row-8"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        background-color: #fafafa;
                        border-radius: 0;
                        color: #000000;
                        padding: 25px 45px 15px;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr>
                          <td
                            class="column column-1"
                            width="58.333333333333336%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              vertical-align: middle;
                            "
                          >
                            <table
                              class="heading_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="text-align: center; width: 100%"
                                >
                                  <h3
                                    style="
                                      margin: 0;
                                      color: #293964;
                                      direction: ltr;
                                      font-family: 'Oswald', Arial,
                                        'Helvetica Neue', Helvetica, sans-serif;
                                      font-size: 35px;
                                      font-weight: 700;
                                      letter-spacing: -1px;
                                      line-height: 1.2;
                                      text-align: left;
                                      margin-top: 0;
                                      margin-bottom: 0;
                                      mso-line-height-alt: 42px;
                                    "
                                  >
                                    <span
                                      class="tinyMce-placeholder"
                                      style="word-break: break-word"
                                      >Síguenos</span
                                    >
                                  </h3>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td
                            class="column column-2"
                            width="41.666666666666664%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-top: 5px;
                              vertical-align: middle;
                            "
                          >
                            <table
                              class="button_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <div class="alignment" align="right">
                                    <a
                                                                               href="https://www.instagram.com/bandacedesdonbosco/#"

                                      target="_blank"
                                      style="
                                        color: #5a3b36;
                                        text-decoration: none;
                                      "
                                      >><!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"  href="www.example.com"  style="height:46px;width:168px;v-text-anchor:middle;" arcsize="123%" fillcolor="#ffc75e">
<v:stroke dashstyle="Solid" weight="1px" color="#ffc75e"/>
<w:anchorlock/>
<v:textbox inset="0px,0px,0px,0px">
<center dir="false" style="color:#5a3b36;font-family:sans-serif;font-size:18px">
<!
                                      [endif]--><span
                                        class="button"
                                        style="
                                          background-color: #ffc75e;
                                          border-bottom: 1px solid #ffc75e;
                                          border-left: 1px solid #ffc75e;
                                          border-radius: 60px;
                                          border-right: 1px solid #ffc75e;
                                          border-top: 1px solid #ffc75e;
                                          color: #5a3b36;
                                          display: inline-block;
                                          font-family: Helvetica Neue, Helvetica,
                                            Arial, sans-serif;
                                          font-size: 18px;
                                          font-weight: 500;
                                          mso-border-alt: none;
                                          padding-bottom: 5px;
                                          padding-top: 5px;
                                          padding-left: 20px;
                                          padding-right: 20px;
                                          text-align: center;
                                          width: auto;
                                          word-break: keep-all;
                                          letter-spacing: normal;
                                        "
                                        ><span
                                          style="
                                            word-break: break-word;
                                            line-height: 36px;
                                          "
                                          >Instagram</span
                                        ></span
                                      >><!--[if mso]></center></v:textbox></v:roundrect><![endif]--></a</a
                                    >
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              class="row row-9"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        background-color: #fafafa;
                        border-radius: 0;
                        color: #000000;
                        padding-bottom: 25px;
                        padding-left: 45px;
                        padding-right: 45px;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr>
                          <td
                            class="column column-1"
                            width="33.333333333333336%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-left: 5px;
                              padding-right: 5px;
                              padding-top: 5px;
                              vertical-align: top;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad" style="width: 100%">
                                  <div class="alignment" align="center">
                                    <div
                                      class="fullWidth"
                                      style="max-width: 185px"
                                    >
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511304/IMG_7453_btathe.jpg"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                        "
                                        width="185"
                                        alt="Social Image"
                                        title="Social Image"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td
                            class="column column-2"
                            width="33.333333333333336%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-left: 5px;
                              padding-right: 5px;
                              padding-top: 5px;
                              vertical-align: top;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad" style="width: 100%">
                                  <div class="alignment" align="center">
                                    <div
                                      class="fullWidth"
                                      style="max-width: 186px"
                                    >
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511297/IMG_7694_anotz9.jpg"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                        "
                                        width="186"
                                        alt="Social Image"
                                        title="Social Image"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td
                            class="column column-3"
                            width="33.333333333333336%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-left: 5px;
                              padding-right: 5px;
                              padding-top: 5px;
                              vertical-align: top;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td class="pad" style="width: 100%">
                                  <div class="alignment" align="center">
                                    <div
                                      class="fullWidth"
                                      style="max-width: 185px"
                                    >
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511296/IMG_7641_gznw32.jpg"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                        "
                                        width="185"
                                        alt="Social Image"
                                        title="Social Image"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              class="row row-10"
              align="center"
              width="100%"
              border="0"
              cellpadding="0"
              cellspacing="0"
              role="presentation"
              style="mso-table-lspace: 0pt; mso-table-rspace: 0pt"
            >
              <tbody>
                <tr>
                  <td>
                    <table
                      class="row-content stack"
                      align="center"
                      border="0"
                      cellpadding="0"
                      cellspacing="0"
                      role="presentation"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        background-color: #293964;
                        border-radius: 0;
                        color: #000000;
                        padding-bottom: 25px;
                        padding-top: 25px;
                        width: 700px;
                        margin: 0 auto;
                      "
                      width="700"
                    >
                      <tbody>
                        <tr>
                          <td
                            class="column column-1"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              font-weight: 400;
                              text-align: left;
                              padding-bottom: 5px;
                              padding-top: 5px;
                              vertical-align: top;
                            "
                          >
                            <table
                              class="image_block block-1"
                              width="100%"
                              border="0"
                              cellpadding="0"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                              "
                            >
                              <tr>
                                <td
                                  class="pad"
                                  style="
                                    width: 100%;
                                    padding-right: 0px;
                                    padding-left: 0px;
                                  "
                                >
                                  <div class="alignment" align="center">
                                    <div style="max-width: 210px">
                                      <img
                                        src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/Logo_BCDB_-_Bg_White_mfxnej.png"
                                        style="
                                          display: block;
                                          height: auto;
                                          border: 0;
                                          width: 100%;
                                        "
                                        width="210"
                                        alt="Your Logo Placeholder"
                                        title="Your Logo Placeholder"
                                        height="auto"
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="social_block block-2"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                                margin: auto;
                              "
                            >
                              <tr>
                                <td class="pad" align="center">
                                  <div class="alignment" align="center">
                                    <table
                                      class="social-table"
                                      width="144px"
                                      border="0"
                                      cellpadding="0"
                                      cellspacing="0"
                                      role="presentation"
                                        style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; margin: 0 auto"

                                    >
                                      <tr>
                                            <td style="padding: 0 10px">

                                          <a
                                            href="https://www.facebook.com/bcdbcr"
                                            target="_blank"
                                            ><img
                                              src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/facebook_n4yyp8.png"
                                              width="32"
                                              height="auto"
                                              alt="Facebook"
                                              title="facebook"
                                              style="
                                                display: block;
                                                height: auto;
                                                border: 0;
                                              "
                                          /></a>
                                        </td>
                                      
                                             <td style="padding: 0 10px">

                                          <a
                                            href="https://www.instagram.com/bandacedesdonbosco/#"
                                            target="_blank"
                                            ><img
                                              src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511065/instagram_zxhfpb.png"
                                              width="32"
                                              height="auto"
                                              alt="Instagram"
                                              title="instagram"
                                              style="
                                                display: block;
                                                height: auto;
                                                border: 0;
                                              "
                                          /></a>
                                        </td>
                                      </tr>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="paragraph_block block-3"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                                word-break: break-word;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <div
                                    style="
                                      color: #fafafa;
                                      direction: ltr;
                                      font-family: Helvetica Neue, Helvetica,
                                        Arial, sans-serif;
                                      font-size: 16px;
                                      font-weight: 400;
                                      letter-spacing: 0px;
                                      line-height: 1.2;
                                      text-align: center;
                                      mso-line-height-alt: 19px;
                                    "
                                  >
                                    <p style="margin: 0">
                                     San José, Costa Rica | © 2025 Banda CEDES Don Bosco
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            <table
                              class="paragraph_block block-4"
                              width="100%"
                              border="0"
                              cellpadding="10"
                              cellspacing="0"
                              role="presentation"
                              style="
                                mso-table-lspace: 0pt;
                                mso-table-rspace: 0pt;
                                word-break: break-word;
                              "
                            >
                              <tr>
                                <td class="pad">
                                  <div
                                    style="
                                      color: #fafafa;
                                      direction: ltr;
                                      font-family: Helvetica Neue, Helvetica,
                                        Arial, sans-serif;
                                      font-size: 14px;
                                      font-weight: 400;
                                      letter-spacing: 0px;
                                      line-height: 1.2;
                                      text-align: center;
                                      mso-line-height-alt: 17px;
                                    "
                                  >
                                    <p style="margin: 0">
                                      <a
                                        href=""
                                        target="_blank"
                                        style="
                                          text-decoration: underline;
                                          color: #fafafa;
                                        "
                                        rel="noopener"
                                        >Todos los derechos reservados</a
                                      >

                                    </p>
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
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
    <!-- End -->
  </body>
</html>
            `,

            attachments: [
              {
                filename: "entrada-cortesia.png",
                content: qrCode.split(",")[1],
                encoding: "base64",
                cid: "qrCode",
              },
            ],
          },
        });

        await EventTicket.findByIdAndUpdate(eventId, {
          $inc: { totalTickets: 1 },
        });

        return ticket;
      } catch (error) {
        console.error("Error sending courtesy ticket:", error);
        throw new Error("Error sending courtesy ticket");
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

    createDocument: async (_, { input }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.createDocument(input, userId);
    },

    addDocumentImage: async (_, { input }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.addDocumentImage(input, userId);
    },

    upsertDocumentExtractedData: async (_, { input }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.upsertDocumentExtractedData(input, userId);
    },

    setDocumentStatus: async (_, { documentId, status }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.setDocumentStatus(
        documentId,
        status,
        userId
      );
    },

    deleteDocument: async (_, { documentId }, context) => {
      const user = requireAuth(context);
      const userId = getUserId(user);

      return await DocumentService.deleteDocument(documentId, userId);
    },
  },

  Ticket: {
    userId: async (ticket) => {
      return await User.findById(ticket.userId);
    },
  },

  Document: {
    owner: async (parent, _, context) => {
      // Si ya está poblado, retornar
      if (parent.owner && typeof parent.owner === "object") {
        return parent.owner;
      }

      // Si no, buscar el User
      const User = require("../models/User");
      return await User.findById(parent.owner);
    },

    createdBy: async (parent) => {
      if (parent.createdBy && typeof parent.createdBy === "object") {
        return parent.createdBy;
      }

      const User = require("../models/User");
      return await User.findById(parent.createdBy);
    },

    updatedBy: async (parent) => {
      if (!parent.updatedBy) return null;

      if (parent.updatedBy && typeof parent.updatedBy === "object") {
        return parent.updatedBy;
      }

      const User = require("../models/User");
      return await User.findById(parent.updatedBy);
    },

    isExpired: (parent) => {
      if (!parent.extracted?.expirationDate) return null;

      return new Date(parent.extracted.expirationDate) < new Date();
    },

    daysUntilExpiration: (parent) => {
      if (!parent.extracted?.expirationDate) return null;

      return daysUntilExpiration(parent.extracted.expirationDate);
    },
  },
};

module.exports = resolvers;
