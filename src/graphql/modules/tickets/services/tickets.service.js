// tickets/services/tickets.service.js
const { Ticket } = require("../../../../../models/Tickets");
const { EventTicket } = require("../../../../../models/EventTicket");
const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const QRCode = require("qrcode");

// Templates (opcional; fallback si no existen o si su export no calza)
let assignedTicketTemplate = null;
let purchasedTicketTemplate = null;
let courtesyTicketTemplate = null;

try {
  assignedTicketTemplate = require("../emailTemplates/assignedTicket");
} catch (e) {
  assignedTicketTemplate = null;
}
try {
  purchasedTicketTemplate = require("../emailTemplates/purchasedTicket");
} catch (e) {
  purchasedTicketTemplate = null;
}
try {
  courtesyTicketTemplate = require("../emailTemplates/courtesyTicket");
} catch (e) {
  courtesyTicketTemplate = null;
}

function getCurrentUserFromCtx(ctx) {
  return ctx?.user || ctx?.me || ctx?.currentUser || null;
}

// Helper “soft” para auth: preparado para activarlo
function requireAuth(ctx) {
  const me = getCurrentUserFromCtx(ctx);

  // TODO: activá esto cuando tengas auth fijo en ctx
  // if (!me) throw new Error("Unauthorized");

  return me;
}

function assertPositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return n;
}

function safeNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n))
    throw new Error(`${fieldName} must be a valid number`);
  return n;
}

function buildQrPayload({ ticketId, userId, eventId, type }) {
  return JSON.stringify({
    ticketId: ticketId ? ticketId.toString() : null,
    userId: userId ? userId.toString() : null,
    eventId: eventId ? eventId.toString() : null,
    type: type || null,
  });
}

async function buildQrDataUrl(qrPayload) {
  return QRCode.toDataURL(qrPayload);
}

function normalizeTemplateResult(templateModule, data) {
  if (!templateModule) return null;

  // function(data) => string|object
  if (typeof templateModule === "function") return templateModule(data);

  // { build(data) }
  if (templateModule && typeof templateModule.build === "function") {
    return templateModule.build(data);
  }

  // { default(data) }
  if (templateModule && typeof templateModule.default === "function") {
    return templateModule.default(data);
  }

  // string u object directo
  return templateModule;
}

function buildEmailFromTemplateOrFallback(
  { template, fallbackSubject, fallbackText, fallbackHtml },
  data,
) {
  const result = normalizeTemplateResult(template, data);

  if (typeof result === "string") {
    return { subject: fallbackSubject, text: fallbackText, html: result };
  }

  if (result && typeof result === "object") {
    return {
      subject: result.subject || fallbackSubject,
      text: result.text || fallbackText,
      html: result.html || fallbackHtml,
      // passthrough opcional
      context: result.context,
      attachments: result.attachments,
    };
  }

  return { subject: fallbackSubject, text: fallbackText, html: fallbackHtml };
}

function getEmailSender(ctx) {
  // Intentos típicos (sin inventar estructura; solo fallback)
  return (
    ctx?.sendEmail ||
    ctx?.services?.email?.sendEmail ||
    ctx?.dataSources?.email?.sendEmail ||
    ctx?.resolvers?.Mutation?.sendEmail ||
    null
  );
}

async function sendEmail(ctx, emailInput) {
  const sender = getEmailSender(ctx);
  if (!sender) {
    // No lo hacemos fatal para no “romper” si todavía no lo cableaste.
    // Si querés hacerlo hard-fail, cambiá por throw new Error(...)
    return {
      ok: false,
      skipped: true,
      reason: "Email service not available in ctx",
    };
  }

  // Resolver-style vs service-style
  if (sender.length >= 2) {
    // (_, { input }, ctx)
    return sender(null, { input: emailInput }, ctx);
  }

  // service style: (input)
  return sender(emailInput);
}

async function ensureEventCapacity(event, additionalTickets) {
  if (!event) throw new Error("Event not found");

  const limit = event.ticketLimit;
  const current = event.totalTickets;

  // Solo valida si existen y son numéricos
  if (
    Number.isFinite(Number(limit)) &&
    Number(limit) > 0 &&
    Number.isFinite(Number(current))
  ) {
    if (Number(current) + Number(additionalTickets) > Number(limit)) {
      throw new Error("Ticket limit exceeded for this event");
    }
  }
}

async function generateRaffleNumbers(eventId, quantity) {
  const qty = assertPositiveInt(quantity, "ticketQuantity");

  // Carga números existentes para evitar duplicados (scope: eventId)
  const existingTickets = await Ticket.find(
    { eventId, raffleNumbers: { $exists: true, $ne: [] } },
    { raffleNumbers: 1 },
  ).lean();

  const used = new Set();
  for (const t of existingTickets) {
    if (Array.isArray(t.raffleNumbers)) {
      for (const num of t.raffleNumbers) used.add(String(num));
    }
  }

  const result = [];
  let attempts = 0;
  const maxAttempts = 20000;

  while (result.length < qty) {
    attempts += 1;
    if (attempts > maxAttempts)
      throw new Error("Unable to generate unique raffle numbers");

    // 6 dígitos
    const num = String(Math.floor(100000 + Math.random() * 900000));
    if (used.has(num)) continue;

    used.add(num);
    result.push(num);
  }

  return result;
}

async function incrementEventTotalTickets(eventId, incBy) {
  const n = assertPositiveInt(incBy, "ticketQuantity");
  await EventTicket.findByIdAndUpdate(
    eventId,
    { $inc: { totalTickets: n } },
    { runValidators: true },
  );
}

module.exports = {
  requireAuth,

  // ===========
  // QUERIES
  // ===========
  async getTickets({ eventId } = {}, ctx) {
    try {
      // requireAuth(ctx); // activalo si aplica

      const query = eventId ? { eventId } : {};
      const tickets = await Ticket.find(query).populate({
        path: "userId",
        select: "name firstSurName secondSurName email",
      });

      return tickets;
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch tickets");
    }
  },

  async getTicketsNumbers({ eventId } = {}, ctx) {
    try {
      // requireAuth(ctx); // activalo si aplica

      const query = eventId ? { eventId } : {};
      const tickets = await Ticket.find(query).populate({
        path: "userId",
        select: "name firstSurName secondSurName email",
      });

      const allRaffleNumbers = tickets.flatMap((ticket) =>
        (ticket.raffleNumbers || []).map((number) => ({
          number,
          buyerName:
            ticket.buyerName ||
            `${ticket.userId?.name || ""} ${ticket.userId?.firstSurName || ""} ${ticket.userId?.secondSurName || ""}`.trim(),
          buyerEmail: ticket.buyerEmail || ticket.userId?.email,
          paid: ticket.paid,
        })),
      );

      return allRaffleNumbers;
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch tickets");
    }
  },

  async getEventsT(_, ctx) {
    try {
      // requireAuth(ctx); // activalo si aplica
      return EventTicket.find();
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch events");
    }
  },

  // ===========
  // MUTATIONS
  // ===========
  async createEvent(
    { name, date, description, ticketLimit, raffleEnabled, price },
    ctx,
  ) {
    try {
      // requireAuth(ctx); // activalo si aplica (admin)

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
    } catch (err) {
      throw new Error(err?.message || "Failed to create event");
    }
  },

  async assignTickets({ input }, ctx) {
    try {
      // requireAuth(ctx); // activalo si aplica (admin/staff)

      if (!input) throw new Error("Input is required");

      const { userId, eventId, type, ticketQuantity } = input;

      const qty = assertPositiveInt(ticketQuantity, "ticketQuantity");
      if (!userId) throw new Error("userId is required");
      if (!eventId) throw new Error("eventId is required");
      if (!type) throw new Error("type is required");

      const event = await EventTicket.findById(eventId);
      if (!event) throw new Error("Event not found");

      await ensureEventCapacity(event, qty);

      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      const raffleNumbers = event.raffleEnabled
        ? await generateRaffleNumbers(eventId, qty)
        : [];

      // 1) Crear ticket (sin qr), obtener _id real
      const ticket = new Ticket({
        userId,
        eventId,
        type,
        ticketQuantity: qty,
        qrCode: "",
        raffleNumbers,
      });

      await ticket.save();

      // 2) Generar QR con ticketId real
      const qrPayload = buildQrPayload({
        ticketId: ticket._id,
        userId,
        eventId,
        type,
      });
      const qrCodeDataUrl = await buildQrDataUrl(qrPayload);

      ticket.qrCode = qrCodeDataUrl;
      await ticket.save();

      const parent = await Parent.findOne({ children: userId });

      const baseEmailData = {
        ticket,
        event,
        user,
        raffleNumbers,
        ticketQuantity: qty,
        qrCode: qrCodeDataUrl,
        qrPayload,
        date: new Date().toLocaleDateString(),
      };

      // Usuario
      const userEmailBuilt = buildEmailFromTemplateOrFallback(
        {
          template: assignedTicketTemplate,
          fallbackSubject: "Entradas asignadas",
          fallbackText: "Aquí están tus entradas.",
          fallbackHtml: `<p>Entradas asignadas. Ticket: ${ticket._id.toString()}</p>`,
        },
        baseEmailData,
      );

      const userEmailInput = {
        to: user.email,
        subject: userEmailBuilt.subject,
        text: userEmailBuilt.text,
        html: userEmailBuilt.html,
        context: userEmailBuilt.context || {
          ticketNumber: ticket._id.toString(),
          eventDescription: event.description,
          ticketQuantity: qty,
          raffleNumbers: raffleNumbers.join(", "),
          recipientName: user.name,
          recipientAddress: user.address,
          orderNumber: ticket._id.toString(),
          orderDate: baseEmailData.date,
          QR_CODE_URL: qrCodeDataUrl,
        },
        attachments: userEmailBuilt.attachments || [
          {
            filename: "ticket.png",
            content: qrCodeDataUrl.split(",")[1],
            encoding: "base64",
            cid: "qrCode",
          },
        ],
      };

      const emailPromises = [sendEmail(ctx, userEmailInput)];

      // Parent (si existe)
      if (parent?.email) {
        const parentEmailBuilt = buildEmailFromTemplateOrFallback(
          {
            template: assignedTicketTemplate,
            fallbackSubject: "Entradas asignadas a su hijo/a",
            fallbackText: "Aquí están las entradas asignadas a su hijo/a.",
            fallbackHtml: `<p>Entradas asignadas a su hijo/a. Ticket: ${ticket._id.toString()}</p>`,
          },
          baseEmailData,
        );

        emailPromises.push(
          sendEmail(ctx, {
            to: parent.email,
            subject: parentEmailBuilt.subject,
            text: parentEmailBuilt.text,
            html: parentEmailBuilt.html,
            context: parentEmailBuilt.context || userEmailInput.context,
            attachments:
              parentEmailBuilt.attachments || userEmailInput.attachments,
          }),
        );
      }

      await Promise.all(emailPromises);

      await incrementEventTotalTickets(eventId, qty);

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Error assigning tickets");
    }
  },

  async purchaseTicket(
    { eventId, buyerName, buyerEmail, ticketQuantity },
    ctx,
  ) {
    try {
      const qty = assertPositiveInt(ticketQuantity, "ticketQuantity");
      if (!eventId) throw new Error("eventId is required");
      if (!buyerName) throw new Error("buyerName is required");
      if (!buyerEmail) throw new Error("buyerEmail is required");

      const event = await EventTicket.findById(eventId);
      if (!event) throw new Error("Event not found");

      await ensureEventCapacity(event, qty);

      const raffleNumbers = event.raffleEnabled
        ? await generateRaffleNumbers(eventId, qty)
        : [];

      const ticket = new Ticket({
        eventId,
        type: "purchased",
        ticketQuantity: qty,
        buyerName,
        buyerEmail,
        qrCode: "",
        raffleNumbers,
      });

      await ticket.save();

      const qrPayload = buildQrPayload({
        ticketId: ticket._id,
        eventId,
        type: "purchased",
      });
      const qrCodeDataUrl = await buildQrDataUrl(qrPayload);

      // FIX: guardar el DataURL (no el payload)
      ticket.qrCode = qrCodeDataUrl;
      await ticket.save();

      const baseEmailData = {
        ticket,
        event,
        buyerName,
        buyerEmail,
        raffleNumbers,
        ticketQuantity: qty,
        qrCode: qrCodeDataUrl,
        qrPayload,
        date: new Date().toLocaleDateString(),
      };

      const built = buildEmailFromTemplateOrFallback(
        {
          template: purchasedTicketTemplate,
          fallbackSubject: "Entradas asignadas",
          fallbackText: "Aquí están tus entradas.",
          fallbackHtml: `<p>Compra registrada. Ticket: ${ticket._id.toString()}</p>`,
        },
        baseEmailData,
      );

      await sendEmail(ctx, {
        to: buyerEmail,
        subject: built.subject,
        text: built.text,
        html: built.html,
        context: built.context || {
          ticketNumber: ticket._id.toString(),
          eventDescription: event.description,
          ticketQuantity: qty,
          raffleNumbers: raffleNumbers.join(", "),
          recipientName: buyerName,
          recipientAddress: buyerEmail,
          orderNumber: ticket._id.toString(),
          orderDate: baseEmailData.date,
          QR_CODE_URL: qrCodeDataUrl,
        },
        attachments: built.attachments || [
          {
            filename: "ticket.png",
            content: qrCodeDataUrl.split(",")[1],
            encoding: "base64",
            cid: "qrCode",
          },
        ],
      });

      await incrementEventTotalTickets(eventId, qty);

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Error purchasing ticket");
    }
  },

  async sendCourtesyTicket(
    { eventId, buyerName, buyerEmail, ticketQuantity },
    ctx,
  ) {
    try {
      const qty = assertPositiveInt(ticketQuantity, "ticketQuantity");
      if (!eventId) throw new Error("eventId is required");
      if (!buyerName) throw new Error("buyerName is required");
      if (!buyerEmail) throw new Error("buyerEmail is required");

      const event = await EventTicket.findById(eventId);
      if (!event) throw new Error("Event not found");

      await ensureEventCapacity(event, qty);

      const ticket = new Ticket({
        eventId,
        type: "courtesy",
        ticketQuantity: qty,
        buyerName,
        buyerEmail,
        qrCode: "",
        paid: true,
      });

      await ticket.save();

      const qrPayload = buildQrPayload({
        ticketId: ticket._id,
        eventId,
        type: "courtesy",
      });
      const qrCodeDataUrl = await buildQrDataUrl(qrPayload);

      // FIX: guardar el DataURL (no el payload)
      ticket.qrCode = qrCodeDataUrl;
      await ticket.save();

      const baseEmailData = {
        ticket,
        event,
        buyerName,
        buyerEmail,
        ticketQuantity: qty,
        qrCode: qrCodeDataUrl,
        qrPayload,
        date: new Date().toLocaleDateString(),
      };

      const built = buildEmailFromTemplateOrFallback(
        {
          template: courtesyTicketTemplate,
          fallbackSubject: "Entrada de cortesía",
          fallbackText: "Gracias por acompañarnos. Aquí está tu entrada.",
          fallbackHtml: `<p>Cortesía. Ticket: ${ticket._id.toString()}</p>`,
        },
        baseEmailData,
      );

      await sendEmail(ctx, {
        to: buyerEmail,
        subject: built.subject,
        text: built.text,
        html: built.html,
        attachments: built.attachments || [
          {
            filename: "entrada-cortesia.png",
            content: qrCodeDataUrl.split(",")[1],
            encoding: "base64",
            cid: "qrCode",
          },
        ],
      });

      // FIX: inc por qty (antes era 1)
      await incrementEventTotalTickets(eventId, qty);

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Error sending courtesy ticket");
    }
  },

  async updatePaymentStatus({ ticketId, amountPaid }, ctx) {
    try {
      // requireAuth(ctx); // activalo si aplica (admin/staff)

      if (!ticketId) throw new Error("ticketId is required");
      const inc = safeNumber(amountPaid, "amountPaid");
      if (inc <= 0) throw new Error("amountPaid must be greater than 0");

      // Atomic $inc + validación
      const ticket = await Ticket.findByIdAndUpdate(
        ticketId,
        { $inc: { amountPaid: inc } },
        { new: true, runValidators: true },
      );

      if (!ticket) throw new Error("Ticket not found");

      const event = await EventTicket.findById(ticket.eventId);
      if (!event) throw new Error("Event not found");

      const price = safeNumber(event.price, "event.price");
      const totalDue = Number(ticket.ticketQuantity) * price;

      const shouldBePaid = Number(ticket.amountPaid) >= totalDue;
      if (ticket.paid !== shouldBePaid) {
        ticket.paid = shouldBePaid;
        await ticket.save();
      }

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Failed to update payment status");
    }
  },
};
