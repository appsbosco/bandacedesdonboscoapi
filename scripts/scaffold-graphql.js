/* scripts/scaffold-graphql.js
 * Crea estructura src/graphql/... sin sobreescribir nada existente.
 * Uso:
 *   node scripts/scaffold-graphql.js
 *   node scripts/scaffold-graphql.js --dry-run
 */

const fs = require("fs");
const path = require("path");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run") || args.has("--dry");

const ROOT = process.cwd();

function ensurePosix(p) {
  return p.split(path.sep).join("/");
}

function dirOf(filePath) {
  return path.dirname(filePath);
}

async function mkdirp(dirPath) {
  if (DRY_RUN) return;
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function writeFileIfMissing(filePath, content) {
  const abs = path.join(ROOT, filePath);
  const dir = dirOf(abs);

  if (!fs.existsSync(dir)) {
    console.log(`DIR  + ${ensurePosix(path.relative(ROOT, dir))}`);
    await mkdirp(dir);
  }

  if (fs.existsSync(abs)) {
    console.log(`SKIP = ${ensurePosix(filePath)} (ya existe)`);
    return { created: false };
  }

  console.log(`FILE + ${ensurePosix(filePath)}`);
  if (!DRY_RUN) {
    // 'wx' => falla si existe (doble seguridad)
    await fs.promises.writeFile(abs, content, { flag: "wx" });
  }
  return { created: true };
}

function banner(title) {
  return `/**
 * ${title}
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */\n\n`;
}

function moduleIndexTemplate(moduleName) {
  return (
    banner(`Módulo GraphQL: ${moduleName}`) +
    `const queries = require("./resolvers/queries");\n` +
    `const mutations = require("./resolvers/mutations");\n` +
    `let types = {};\n` +
    `try { types = require("./resolvers/types"); } catch (e) { types = {}; }\n\n` +
    `// Exporta un objeto de resolvers listo para mergear\n` +
    `module.exports = {\n` +
    `  Query: queries,\n` +
    `  Mutation: mutations,\n` +
    `  ...typeDefs,\n` +
    `};\n`
  );
}

function queriesTemplate(moduleName) {
  return (
    banner(`${moduleName} - Queries`) +
    `module.exports = {\n` +
    `  // TODO: agrega queries aquí\n` +
    `  // ejemplo: get${pascal(moduleName)}: async (_, args, ctx) => {}\n` +
    `};\n`
  );
}

function mutationsTemplate(moduleName) {
  return (
    banner(`${moduleName} - Mutations`) +
    `module.exports = {\n` +
    `  // TODO: agrega mutations aquí\n` +
    `  // ejemplo: create${pascal(moduleName)}: async (_, input, ctx) => {}\n` +
    `};\n`
  );
}

function typesTemplate(moduleName) {
  return (
    banner(`${moduleName} - Types`) +
    `module.exports = {\n` +
    `  // TODO: resolvers por tipo\n` +
    `  // ejemplo:\n` +
    `  // ${pascal(moduleName)}: { field: (parent) => parent.field }\n` +
    `};\n`
  );
}

function serviceTemplate(moduleName, fileName) {
  return (
    banner(`${moduleName} - Service`) +
    `module.exports = {\n` +
    `  // TODO: lógica de negocio para ${moduleName}\n` +
    `  // ${fileName}:\n` +
    `};\n`
  );
}

function emailTemplate(name) {
  return (
    banner(`tickets/emailTemplates/${name}`) +
    `module.exports = function build${pascal(name.replace(".js", ""))}(data = {}) {\n` +
    `  // TODO: retornar HTML (string) o estructura para tu mailer\n` +
    `  return \`<div style="font-family:system-ui">Template ${name} - TODO</div>\`;\n` +
    `};\n`
  );
}

function pascal(str) {
  return String(str)
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// Deep merge básico para objetos de resolvers
function resolversIndexTemplate() {
  return (
    banner("src/graphql/resolvers/index.js (merge final)") +
    `function isObject(v) {\n` +
    `  return v && typeof v === "object" && !Array.isArray(v);\n` +
    `}\n\n` +
    `function mergeInto(target, source) {\n` +
    `  if (!isObject(source)) return target;\n` +
    `  for (const key of Object.keys(source)) {\n` +
    `    const sv = source[key];\n` +
    `    const tv = target[key];\n` +
    `    if (isObject(tv) && isObject(sv)) {\n` +
    `      mergeInto(tv, sv);\n` +
    `    } else {\n` +
    `      target[key] = sv;\n` +
    `    }\n` +
    `  }\n` +
    `  return target;\n` +
    `}\n\n` +
    `function deepMerge(...objs) {\n` +
    `  return objs.reduce((acc, obj) => mergeInto(acc, obj || {}), {});\n` +
    `}\n\n` +
    `// Scalars\n` +
    `const { DateTimeScalar } = require("./scalars");\n\n` +
    `// Módulos\n` +
    `const users = require("../modules/users");\n` +
    `const parents = require("../modules/parents");\n` +
    `const attendance = require("../modules/attendance");\n` +
    `const classAttendance = require("../modules/classAttendance");\n` +
    `const medicalRecords = require("../modules/medicalRecords");\n` +
    `const inventory = require("../modules/inventory");\n` +
    `const events = require("../modules/events");\n` +
    `const payments = require("../modules/payments");\n` +
    `const presentations = require("../modules/presentations");\n` +
    `const exalumnos = require("../modules/exalumnos");\n` +
    `const camps = require("../modules/camps");\n` +
    `const travelForms = require("../modules/travelForms");\n` +
    `const store = require("../modules/store");\n` +
    `const tickets = require("../modules/tickets");\n` +
    `const documents = require("../modules/documents");\n\n` +
    `const modules = [\n` +
    `  users,\n` +
    `  parents,\n` +
    `  attendance,\n` +
    `  classAttendance,\n` +
    `  medicalRecords,\n` +
    `  inventory,\n` +
    `  events,\n` +
    `  payments,\n` +
    `  presentations,\n` +
    `  exalumnos,\n` +
    `  camps,\n` +
    `  travelForms,\n` +
    `  store,\n` +
    `  tickets,\n` +
    `  documents,\n` +
    `];\n\n` +
    `const moduleResolvers = modules.map((m) => m);\n\n` +
    `module.exports = deepMerge(\n` +
    `  {\n` +
    `    DateTime: DateTimeScalar,\n` +
    `  },\n` +
    `  ...moduleResolvers\n` +
    `);\n`
  );
}

function scalarsTemplate() {
  return (
    banner("src/graphql/resolvers/scalars.js") +
    `const { GraphQLScalarType, Kind } = require("graphql");\n\n` +
    `// DateTime scalar básico: ISO string <-> Date\n` +
    `const DateTimeScalar = new GraphQLScalarType({\n` +
    `  name: "DateTime",\n` +
    `  description: "DateTime custom scalar (ISO-8601)",\n` +
    `  serialize(value) {\n` +
    `    // value enviado al cliente\n` +
    `    if (value instanceof Date) return value.toISOString();\n` +
    `    if (typeof value === "string") return value;\n` +
    `    return new Date(value).toISOString();\n` +
    `  },\n` +
    `  parseValue(value) {\n` +
    `    // value recibido del cliente\n` +
    `    return new Date(value);\n` +
    `  },\n` +
    `  parseLiteral(ast) {\n` +
    `    if (ast.kind === Kind.STRING) return new Date(ast.value);\n` +
    `    return null;\n` +
    `  },\n` +
    `});\n\n` +
    `module.exports = { DateTimeScalar };\n`
  );
}

function sharedAuthTemplate() {
  return (
    banner("src/graphql/shared/auth.js") +
    `const { error } = require("./errors");\n\n` +
    `function getUserId(ctx) {\n` +
    `  return ctx?.user?._id || ctx?.user?.id || null;\n` +
    `}\n\n` +
    `function requireAuth(ctx) {\n` +
    `  if (!getUserId(ctx)) throw error("UNAUTHENTICATED", "Debes iniciar sesión.");\n` +
    `}\n\n` +
    `function requireRole(ctx, roles = []) {\n` +
    `  requireAuth(ctx);\n` +
    `  const role = ctx?.user?.role;\n` +
    `  if (roles.length && !roles.includes(role)) {\n` +
    `    throw error("FORBIDDEN", "No tienes permisos para esta acción.");\n` +
    `  }\n` +
    `}\n\n` +
    `module.exports = { requireAuth, requireRole, getUserId };\n`
  );
}

function sharedTokenTemplate() {
  return (
    banner("src/graphql/shared/token.js") +
    `function createToken(payload, secret, options = {}) {\n` +
    `  // Lazy require: no rompe si no lo usás todavía\n` +
    `  const jwt = require("jsonwebtoken");\n` +
    `  return jwt.sign(payload, secret, options);\n` +
    `}\n\n` +
    `module.exports = { createToken };\n`
  );
}

function sharedMailerTemplate() {
  return (
    banner("src/graphql/shared/mailer.js") +
    `let transporter;\n\n` +
    `function getTransporter() {\n` +
    `  if (transporter) return transporter;\n` +
    `  // Lazy require\n` +
    `  const nodemailer = require("nodemailer");\n` +
    `  // TODO: configurar con tus env vars\n` +
    `  transporter = nodemailer.createTransport({\n` +
    `    host: process.env.SMTP_HOST,\n` +
    `    port: Number(process.env.SMTP_PORT || 587),\n` +
    `    secure: false,\n` +
    `    auth: process.env.SMTP_USER\n` +
    `      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }\n` +
    `      : undefined,\n` +
    `  });\n` +
    `  return transporter;\n` +
    `}\n\n` +
    `async function sendEmail({ from, to, subject, html, text, attachments } = {}) {\n` +
    `  const t = getTransporter();\n` +
    `  return t.sendMail({ from, to, subject, html, text, attachments });\n` +
    `}\n\n` +
    `module.exports = { getTransporter, sendEmail };\n`
  );
}

function sharedRaffleTemplate() {
  return (
    banner("src/graphql/shared/raffle.js") +
    `function generateRaffleNumbers({ count = 1, min = 1, max = 9999 } = {}) {\n` +
    `  const set = new Set();\n` +
    `  while (set.size < count) {\n` +
    `    const n = Math.floor(Math.random() * (max - min + 1)) + min;\n` +
    `    set.add(n);\n` +
    `  }\n` +
    `  return Array.from(set);\n` +
    `}\n\n` +
    `module.exports = { generateRaffleNumbers };\n`
  );
}

function sharedDatesTemplate() {
  return (
    banner("src/graphql/shared/dates.js") +
    `function startOfDay(date) {\n` +
    `  const d = new Date(date);\n` +
    `  d.setHours(0, 0, 0, 0);\n` +
    `  return d;\n` +
    `}\n\n` +
    `function endOfDay(date) {\n` +
    `  const d = new Date(date);\n` +
    `  d.setHours(23, 59, 59, 999);\n` +
    `  return d;\n` +
    `}\n\n` +
    `module.exports = { startOfDay, endOfDay };\n`
  );
}

function sharedErrorsTemplate() {
  return (
    banner("src/graphql/shared/errors.js") +
    `const { GraphQLError } = require("graphql");\n\n` +
    `function error(code, message, extraExtensions = {}) {\n` +
    `  return new GraphQLError(message, {\n` +
    `    extensions: {\n` +
    `      code,\n` +
    `      ...extraExtensions,\n` +
    `    },\n` +
    `  });\n` +
    `}\n\n` +
    `module.exports = { error };\n`
  );
}

async function main() {
  const files = new Map();

  // Core resolvers
  files.set("src/graphql/resolvers/index.js", resolversIndexTemplate());
  files.set("src/graphql/resolvers/scalars.js", scalarsTemplate());

  // Shared
  files.set("src/graphql/shared/auth.js", sharedAuthTemplate());
  files.set("src/graphql/shared/token.js", sharedTokenTemplate());
  files.set("src/graphql/shared/mailer.js", sharedMailerTemplate());
  files.set("src/graphql/shared/raffle.js", sharedRaffleTemplate());
  files.set("src/graphql/shared/dates.js", sharedDatesTemplate());
  files.set("src/graphql/shared/errors.js", sharedErrorsTemplate());

  // Modules (con types donde aplica)
  const modules = [
    { name: "users", hasTypes: true, service: "user.service.js" },
    { name: "parents", hasTypes: true, service: "parent.service.js" },
    { name: "attendance", hasTypes: true, service: "attendance.service.js" },
    {
      name: "classAttendance",
      hasTypes: true,
      service: "classAttendance.service.js",
    },
    {
      name: "medicalRecords",
      hasTypes: true,
      service: "medicalRecord.service.js",
    },
    { name: "inventory", hasTypes: true, service: "inventory.service.js" },
    { name: "events", hasTypes: true, service: "event.service.js" },
    { name: "payments", hasTypes: true, service: "payment.service.js" },
    {
      name: "presentations",
      hasTypes: true,
      service: "presentations.service.js",
    },
    { name: "exalumnos", hasTypes: false, service: "exalumno.service.js" },
    { name: "camps", hasTypes: false, service: "camp.service.js" },
    { name: "travelForms", hasTypes: false, service: "travelForms.service.js" },
    { name: "store", hasTypes: true, service: "store.service.js" },
    { name: "tickets", hasTypes: true, service: "tickets.service.js" },
    { name: "documents", hasTypes: false, service: "document.service.js" },
  ];

  for (const m of modules) {
    const base = `src/graphql/modules/${m.name}`;

    files.set(`${base}/index.js`, moduleIndexTemplate(m.name));
    files.set(`${base}/resolvers/queries.js`, queriesTemplate(m.name));
    files.set(`${base}/resolvers/mutations.js`, mutationsTemplate(m.name));

    if (m.hasTypes) {
      files.set(`${base}/resolvers/types.js`, typesTemplate(m.name));
    }

    files.set(
      `${base}/services/${m.service}`,
      serviceTemplate(m.name, m.service),
    );
  }

  // Tickets emailTemplates (opcionales)
  files.set(
    "src/graphql/modules/tickets/emailTemplates/assignedTicket.js",
    emailTemplate("assignedTicket.js"),
  );
  files.set(
    "src/graphql/modules/tickets/emailTemplates/purchasedTicket.js",
    emailTemplate("purchasedTicket.js"),
  );
  files.set(
    "src/graphql/modules/tickets/emailTemplates/courtesyTicket.js",
    emailTemplate("courtesyTicket.js"),
  );

  let createdCount = 0;
  for (const [filePath, content] of files.entries()) {
    const { created } = await writeFileIfMissing(filePath, content);
    if (created) createdCount += 1;
  }

  console.log(
    `\n✅ Listo. Archivos creados: ${createdCount}. (dry-run: ${DRY_RUN})`,
  );
}

main().catch((err) => {
  console.error("\n❌ Error ejecutando scaffold:", err);
  process.exit(1);
});
