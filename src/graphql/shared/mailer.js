const nodemailer = require("nodemailer");
const hbs = require("nodemailer-express-handlebars");
const path = require("path");

function createTransporter() {
  return nodemailer.createTransport({
    service: "Gmail",
    auth: {
      type: "PLAIN",
      user: process.env.MAIL_USER || "banda@cedesdonbosco.ed.cr",
      pass: process.env.APP_PASSWORD,
    },
  });
}

async function sendMail({ to, subject, text, html, attachments }) {
  const transporter = createTransporter();

  // opcional: solo si realmente usás handlebars
  const handlebarOptions = {
    viewEngine: {
      partialsDir: path.resolve("./views/"),
      defaultLayout: false,
    },
    viewPath: path.resolve("./views/"),
  };
  transporter.use("compile", hbs(handlebarOptions));

  await transporter.sendMail({
    from:
      process.env.MAIL_FROM ||
      process.env.MAIL_USER ||
      "banda@cedesdonbosco.ed.cr",
    to,
    subject,
    text,
    html,
    attachments,
  });

  return true;
}

module.exports = { sendMail };
