"use strict";

// =============================================================================
// tickets/services/tickets.service.js
// =============================================================================

const { Ticket } = require("../../../../../models/Tickets");
const { EventTicket } = require("../../../../../models/EventTicket");
const User = require("../../../../../models/User");
const Parent = require("../../../../../models/Parents");
const { sendMail } = require("../../../shared/mailer");
const QRCode = require("qrcode");
const XLSX = require("xlsx");

// ---------------------------------------------------------------------------
// Email templates — carga defensiva con fallback a null
// ---------------------------------------------------------------------------
function tryRequire(path) {
  try {
    return require(path);
  } catch {
    return null;
  }
}

const assignedTicketTemplate = tryRequire("../emailTemplates/assignedTicket");
const purchasedTicketTemplate = tryRequire("../emailTemplates/purchasedTicket");
const courtesyTicketTemplate = tryRequire("../emailTemplates/courtesyTicket");
const importedSpecialEventTicketTemplate = tryRequire(
  "../emailTemplates/importedSpecialEventTicket",
);

// =============================================================================
// HELPERS — AUTH
// =============================================================================

function getCurrentUserFromCtx(ctx) {
  return ctx?.user || ctx?.me || ctx?.currentUser || null;
}

/**
 * Hard-fail auth guard.
 * Activalo quitando el comentario cuando ctx.user esté garantizado.
 */
function requireAuth(ctx) {
  const me = getCurrentUserFromCtx(ctx);
  // if (!me) throw new Error("Unauthorized");
  return me;
}

const TICKET_ADMIN_ROLES = new Set([
  "Admin",
  "Director",
  "Dirección Logística",
  "Tickets Admin",
]);
const TICKET_ACCESS_ROLES = new Set([...TICKET_ADMIN_ROLES, "Taquilla"]);

function requireTicketAccess(ctx) {
  const me = requireAuth(ctx);
  if (!me || !TICKET_ACCESS_ROLES.has(me.role)) {
    throw new Error("No autorizado para operar tickets");
  }
  return me;
}

function requireTicketAdmin(ctx) {
  const me = requireAuth(ctx);
  if (!me || !TICKET_ADMIN_ROLES.has(me.role)) {
    throw new Error("No autorizado para administrar tickets");
  }
  return me;
}

// =============================================================================
// HELPERS — VALIDACIÓN NUMÉRICA
// =============================================================================

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

// =============================================================================
// HELPERS — QR
// =============================================================================

/**
 * Construye el payload JSON que va dentro del QR.
 * Solo incluye ticketId — es suficiente para validar y evita exponer datos extra.
 * eventId se agrega para validación cross-evento en el escáner.
 */
function buildQrPayload({ ticketId, eventId }) {
  return JSON.stringify({
    ticketId: ticketId ? ticketId.toString() : null,
    eventId: eventId ? eventId.toString() : null,
    v: 1, // versión del schema de payload
  });
}

async function buildQrDataUrl(qrPayload) {
  return QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "H", // mayor resiliencia ante daño físico
    margin: 2,
  });
}

// =============================================================================
// HELPERS — EMAIL
// =============================================================================

function normalizeTemplateResult(templateModule, data) {
  if (!templateModule) return null;
  if (typeof templateModule === "function") return templateModule(data);
  if (typeof templateModule.build === "function")
    return templateModule.build(data);
  if (typeof templateModule.default === "function")
    return templateModule.default(data);
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
      context: result.context,
      attachments: result.attachments,
    };
  }

  return { subject: fallbackSubject, text: fallbackText, html: fallbackHtml };
}

function buildPurchasedEmailContent(data) {
  const eventName = data?.event?.name || "tu evento";
  const eventDescription = data?.event?.description || eventName;
  const quantity = Number(
    data?.ticket?.ticketQuantity || data?.ticketQuantity || 1,
  );
  const recipientName =
    data?.user?.name ||
    data?.buyerName ||
    data?.ticket?.buyerName ||
    "Asistente";
  const raffleNumbers = Array.isArray(data?.raffleNumbers)
    ? data.raffleNumbers
    : Array.isArray(data?.ticket?.raffleNumbers)
      ? data.ticket.raffleNumbers
      : [];
  const qrCodeDataUrl = data?.qrCodeDataUrl || data?.qrCode || data?.ticket?.qrCode;
  const specialEventBuilt = normalizeTemplateResult(
    importedSpecialEventTicketTemplate,
    data,
  );

  if (specialEventBuilt && typeof specialEventBuilt === "object") {
    return {
      subject: specialEventBuilt.subject || `Tus entradas para ${eventName}`,
      text:
        specialEventBuilt.text ||
        `Tus ${quantity} entrada(s) para ${eventName} ya están listas.`,
      html:
        specialEventBuilt.html ||
        `<p>Tus ${quantity} entrada(s) para ${eventName} ya están listas para ingresar.</p>`,
      context: specialEventBuilt.context,
      attachments: specialEventBuilt.attachments,
    };
  }

  return buildEmailFromTemplateOrFallback(
    {
      template: purchasedTicketTemplate,
      fallbackSubject: `Tus entradas para ${eventName}`,
      fallbackText:
        `Hola ${recipientName}, tus ${quantity} entrada(s) para ${eventName} ya están listas.` +
        (raffleNumbers.length ? ` Números de rifa: ${raffleNumbers.join(", ")}.` : ""),
      fallbackHtml: `
        <html dir="ltr" lang="es">
          <head>
            <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
          </head>
          <body style="background:#f7f7f7;margin:0;padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
            <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
              <div style="padding:28px 28px 20px;border-bottom:1px solid #f1f5f9;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;font-weight:700;">
                  Banda CEDES Don Bosco
                </p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;color:#111827;">
                  Tus entradas para ${eventName}
                </h1>
                <p style="margin:12px 0 0;font-size:14px;line-height:1.7;color:#475569;">
                  ${eventDescription}
                </p>
              </div>
              <div style="padding:24px 28px 28px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#334155;">
                  Hola <strong>${recipientName}</strong>, tus <strong>${quantity}</strong> entrada(s) ya están listas para ingresar.
                </p>
                ${
                  raffleNumbers.length
                    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">
                        Números de rifa: <strong>${raffleNumbers.join(", ")}</strong>
                      </p>`
                    : ""
                }
                ${
                  qrCodeDataUrl
                    ? `<div style="text-align:center;padding:12px 0 8px;">
                        <img
                          alt="Código QR"
                          src="cid:qrCode"
                          width="220"
                          style="display:block;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;background:#fff;"
                        />
                        <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">
                          Presenta este QR en la entrada del evento.
                        </p>
                      </div>`
                    : ""
                }
              </div>
            </div>
          </body>
        </html>
      `,
    },
    data,
  );
}

function getEmailSender(ctx) {
  return (
    ctx?.sendEmail ||
    ctx?.services?.email?.sendEmail ||
    ctx?.dataSources?.email?.sendEmail ||
    ctx?.resolvers?.Mutation?.sendEmail ||
    sendMail
  );
}

async function sendEmail(ctx, emailInput) {
  const sender = getEmailSender(ctx);

  if (!sender) {
    console.warn(
      "[tickets.service] Email service not available in ctx — email skipped",
    );
    return {
      ok: false,
      skipped: true,
      reason: "Email service not available in ctx",
    };
  }

  // Soporta resolver-style (_, { input }, ctx) y service-style (input)
  return sender.length >= 2
    ? sender(null, { input: emailInput }, ctx)
    : sender(emailInput);
}

/**
 * Construye el attachment de QR estándar.
 */
function buildQrAttachment(qrCodeDataUrl, filename = "ticket.png") {
  if (!qrCodeDataUrl) return [];
  return [
    {
      filename,
      content: String(qrCodeDataUrl).split(",")[1],
      encoding: "base64",
      cid: "qrCode",
    },
  ];
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function decodeBase64File(fileBase64) {
  const payload = String(fileBase64 || "").includes(",")
    ? String(fileBase64).split(",").pop()
    : String(fileBase64 || "");
  return Buffer.from(payload, "base64");
}

const IMPORT_HEADER_MAP = {
  numero: "ticketNumber",
  numero_de_entrada: "ticketNumber",
  numero_entrada: "ticketNumber",
  numero_ticket: "ticketNumber",
  n_entrada: "ticketNumber",
  n_ticket: "ticketNumber",
  entrada: "ticketNumber",
  ticket: "ticketNumber",
  ticket_number: "ticketNumber",
  nombre: "buyerName",
  nombre_completo: "buyerName",
  comprador: "buyerName",
  cliente: "buyerName",
  buyer_name: "buyerName",
  correo: "buyerEmail",
  correo_electronico: "buyerEmail",
  email: "buyerEmail",
  buyer_email: "buyerEmail",
  estado: "paymentStatus",
  estado_de_pago: "paymentStatus",
  pago: "paymentStatus",
  pagado: "paymentStatus",
  payment_status: "paymentStatus",
};

const PAID_VALUES = new Set([
  "paid",
  "pagada",
  "pagado",
  "pago",
  "cancelada_pagada",
  "si",
  "sí",
  "true",
  "1",
]);

const ASSIGNED_VALUES = new Set([
  "assigned",
  "asignada",
  "asignado",
  "pendiente",
  "pending",
  "reservada",
  "reservado",
  "false",
  "0",
  "no",
]);

function normalizePaymentStatus(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (PAID_VALUES.has(raw)) return "paid";
  if (ASSIGNED_VALUES.has(raw)) return "assigned";
  return null;
}

function buildImportKey({ buyerName, buyerEmail }) {
  const email = normalizeText(buyerEmail);
  const name = normalizeText(buyerName);
  return email ? `email:${email}` : `name:${name}`;
}

async function generateNextImportedTicketNumbers(eventId, quantity) {
  const qty = assertPositiveInt(quantity, "ticketQuantity");
  const importedTickets = await Ticket.find(
    { eventId, source: "excel_import" },
    { externalTicketNumbers: 1 },
  ).lean();

  let maxNumber = 0;
  importedTickets.forEach((ticket) => {
    (ticket.externalTicketNumbers || []).forEach((value) => {
      const numeric = parseInt(String(value).replace(/\D/g, ""), 10);
      if (Number.isFinite(numeric) && numeric > maxNumber) {
        maxNumber = numeric;
      }
    });
  });

  return Array.from({ length: qty }, (_, index) =>
    String(maxNumber + index + 1),
  );
}

function parseImportedTicketRows(fileBase64, sheetName) {
  const workbook = XLSX.read(decodeBase64File(fileBase64), { type: "buffer" });
  const selectedSheetName =
    sheetName && workbook.Sheets[sheetName]
      ? sheetName
      : workbook.SheetNames[0];

  if (!selectedSheetName) {
    throw new Error("El archivo Excel no contiene hojas");
  }

  const sheet = workbook.Sheets[selectedSheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: "",
  });

  if (!matrix.length) {
    throw new Error("El archivo Excel no contiene filas");
  }

  const [headerRow, ...dataRows] = matrix;
  const mappedHeaders = headerRow.map(
    (header) => IMPORT_HEADER_MAP[normalizeHeader(header)] || null,
  );

  const rows = [];
  for (let index = 0; index < dataRows.length; index += 1) {
    const row = dataRows[index];
    const out = { __rowIndex: index + 2 };

    mappedHeaders.forEach((mappedKey, cellIndex) => {
      if (!mappedKey) return;
      out[mappedKey] = String(row[cellIndex] || "").trim();
    });

    if (
      Object.values(out).every(
        (value) => value === "" || value === out.__rowIndex,
      )
    )
      continue;
    rows.push(out);
  }

  return { sheetName: selectedSheetName, rows };
}

function buildImportedTicketEmail(ticket, event, qrCodeDataUrl) {
  const recipientName = ticket.buyerName || "Asistente";
  const emailData = {
    ticket,
    event,
    buyerName: recipientName,
    buyerEmail: ticket.buyerEmail,
    ticketQuantity: ticket.ticketQuantity,
    raffleNumbers: ticket.raffleNumbers || [],
    qrCode: qrCodeDataUrl,
    qrCodeDataUrl,
    date: new Date().toLocaleDateString("es-CR"),
  };

  const built = buildPurchasedEmailContent(emailData);

  return {
    to: ticket.buyerEmail,
    subject: built.subject,
    text: built.text,
    html: built.html,
    context: built.context || {
      ticketNumber: ticket._id.toString(),
      eventDescription: event.description,
      ticketQuantity: ticket.ticketQuantity,
      raffleNumbers: (ticket.raffleNumbers || []).join(", "),
      recipientName,
      orderNumber: ticket._id.toString(),
      orderDate: emailData.date,
      QR_CODE_URL: qrCodeDataUrl,
    },
    attachments: built.attachments || buildQrAttachment(qrCodeDataUrl),
  };
}

async function maybeSendImportedPaidTicketEmail({
  ticket,
  event,
  wasPaid,
  previousQuantity,
  ctx,
}) {
  const quantityChangedAfterEmail =
    Number(ticket?.paymentEmailSentForQuantity || 0) !==
    Number(ticket?.ticketQuantity || 0);
  const shouldSend =
    ticket?.source === "excel_import" &&
    ticket?.paid &&
    (!wasPaid ||
      Number(previousQuantity || 0) !== Number(ticket?.ticketQuantity || 0) ||
      quantityChangedAfterEmail) &&
    ticket?.buyerEmail;

  if (!shouldSend) return false;

  await sendEmail(ctx, buildImportedTicketEmail(ticket, event, ticket.qrCode));
  ticket.paymentEmailSentAt = new Date();
  ticket.paymentEmailSentForQuantity = ticket.ticketQuantity;
  await ticket.save();
  return true;
}

async function resendImportedTicketEmailById(ticketId, ctx) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new Error("Ticket not found");
  if (ticket.source !== "excel_import") {
    throw new Error("Solo aplica a tickets importados");
  }
  if (!ticket.buyerEmail) {
    throw new Error("El ticket no tiene correo destino");
  }

  const event = await EventTicket.findById(ticket.eventId);
  if (!event) throw new Error("Event not found");

  await sendEmail(ctx, buildImportedTicketEmail(ticket, event, ticket.qrCode));
  ticket.paymentEmailSentAt = new Date();
  ticket.paymentEmailSentForQuantity = ticket.ticketQuantity;
  await ticket.save();

  return true;
}

// =============================================================================
// HELPERS — CAPACIDAD Y NÚMEROS DE RIFA
// =============================================================================

async function ensureEventCapacity(event, additionalTickets) {
  if (!event) throw new Error("Event not found");

  const limit = Number(event.ticketLimit);
  const current = Number(event.totalTickets);

  if (Number.isFinite(limit) && limit > 0 && Number.isFinite(current)) {
    if (current + Number(additionalTickets) > limit) {
      throw new Error(
        `Ticket limit exceeded for this event (${current}/${limit}, requesting ${additionalTickets})`,
      );
    }
  }
}

async function generateRaffleNumbers(eventId, quantity) {
  const qty = assertPositiveInt(quantity, "ticketQuantity");

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
  const maxAttempts = 20_000;

  while (result.length < qty) {
    if (++attempts > maxAttempts) {
      throw new Error(
        "Unable to generate unique raffle numbers — pool exhausted",
      );
    }
    const num = String(Math.floor(100_000 + Math.random() * 900_000));
    if (used.has(num)) continue;
    used.add(num);
    result.push(num);
  }

  return result;
}

async function adjustEventTotalTickets(eventId, delta) {
  const n = Number(delta);
  if (!Number.isInteger(n) || n === 0) return;
  const event = await EventTicket.findById(eventId);
  if (!event) throw new Error("Event not found");

  const current = Number(event.totalTickets || 0);
  event.totalTickets = Math.max(0, current + n);
  await event.save();
}

async function incrementEventTotalTickets(eventId, incBy) {
  const n = assertPositiveInt(incBy, "ticketQuantity");
  await adjustEventTotalTickets(eventId, n);
}

// =============================================================================
// HELPERS — ESTADO DEL TICKET
// =============================================================================

/**
 * Recalcula el status derivado a partir de los campos de pago y escaneo.
 * No persiste — el llamador decide cuándo guardar.
 *
 * Reglas:
 *   cancelled         → irreversible, no se toca
 *   !paid && !courtesy → pending_payment
 *   scans === 0        → paid
 *   scans < qty        → partially_used
 *   scans >= qty       → fully_used
 */
function recalculateStatus(ticket) {
  if (ticket.status === "cancelled") return ticket.status;

  const isPaid = ticket.paid || ticket.type === "courtesy";
  if (!isPaid) return "pending_payment";

  const scans = ticket.scans || 0;
  const qty = ticket.ticketQuantity || 1;

  if (scans === 0) return "paid";
  if (scans < qty) return "partially_used";
  return "fully_used";
}

function getTicketTotals(ticket, event) {
  const price = safeNumber(event?.price || 0, "event.price");
  const totalDue = Math.max(0, Number(ticket?.ticketQuantity || 0) * price);
  const amountPaid = Math.max(0, Number(ticket?.amountPaid || 0));
  const balanceDue = Math.max(0, totalDue - amountPaid);

  return {
    totalDue,
    balanceDue,
    amountPaid,
  };
}

// =============================================================================
// HELPERS — VALIDACIÓN QR
// =============================================================================

function buildValidationResult(result, ticket, message, meta = {}) {
  return {
    result, // "ok" | "unpaid" | "duplicate" | "invalid" | "blocked"
    canEnter: result === "ok",
    message,
    ticket: ticket || null,
    totalDue: meta.totalDue ?? 0,
    balanceDue: meta.balanceDue ?? 0,
    canMarkPaid:
      Boolean(meta.canMarkPaid) &&
      result === "unpaid" &&
      Number(meta.balanceDue || 0) > 0,
  };
}

// =============================================================================
// SERVICE
// =============================================================================

module.exports = {
  requireAuth,
  requireTicketAccess,
  requireTicketAdmin,

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Devuelve tickets, opcionalmente filtrados por evento y/o status.
   */
  async getTickets({ eventId, status } = {}, ctx) {
    try {
      requireTicketAccess(ctx);
      const query = {};
      if (eventId) query.eventId = eventId;
      if (status) query.status = status;

      return await Ticket.find(query)
        .populate({
          path: "userId",
          select: "name firstSurName secondSurName email",
        })
        .sort({ createdAt: -1 });
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch tickets");
    }
  },

  async getMyTickets(_, ctx) {
    try {
      const currentUser = requireAuth(ctx);
      const userId = currentUser?.id || currentUser?._id;
      if (!userId) throw new Error("No autenticado");

      return await Ticket.find({ userId })
        .populate({
          path: "userId",
          select: "name firstSurName secondSurName email",
        })
        .sort({ createdAt: -1 });
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch my tickets");
    }
  },

  /**
   * Devuelve todos los números de rifa de un evento con su titular y estado de pago.
   */
  async getTicketsNumbers({ eventId } = {}, ctx) {
    try {
      const query = eventId ? { eventId } : {};
      const tickets = await Ticket.find(query).populate({
        path: "userId",
        select: "name firstSurName secondSurName email",
      });

      return tickets.flatMap((ticket) =>
        (ticket.raffleNumbers || []).map((number) => ({
          number,
          buyerName:
            ticket.buyerName ||
            `${ticket.userId?.name || ""} ${ticket.userId?.firstSurName || ""} ${ticket.userId?.secondSurName || ""}`.trim(),
          buyerEmail: ticket.buyerEmail || ticket.userId?.email,
          paid: ticket.paid,
        })),
      );
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch raffle numbers");
    }
  },

  /**
   * Lista todos los eventos de tickets.
   */
  async getEventsT(_, ctx) {
    try {
      return EventTicket.find().sort({ date: 1 });
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch events");
    }
  },

  /**
   * Estadísticas en tiempo real de un evento (para panel de escaneo).
   */
  async getEventStats({ eventId }, ctx) {
    try {
      requireTicketAccess(ctx);
      if (!eventId) throw new Error("eventId is required");

      const event = await EventTicket.findById(eventId);
      if (!event) throw new Error("Event not found");

      const [
        issued,
        paid,
        pending,
        used,
        partiallyUsed,
        cancelled,
        collectedAgg,
      ] = await Promise.all([
        Ticket.countDocuments({ eventId }),
        Ticket.countDocuments({
          eventId,
          paid: true,
          status: { $ne: "cancelled" },
        }),
        Ticket.countDocuments({
          eventId,
          paid: false,
          status: { $ne: "cancelled" },
        }),
        Ticket.countDocuments({ eventId, status: "fully_used" }),
        Ticket.countDocuments({ eventId, status: "partially_used" }),
        Ticket.countDocuments({ eventId, status: "cancelled" }),
        Ticket.aggregate([
          { $match: { eventId: event._id, status: { $ne: "cancelled" } } },
          { $group: { _id: null, totalCollected: { $sum: "$amountPaid" } } },
        ]),
      ]);

      // checkins = checked_in + partially_used + fully_used
      const checkedIn = await Ticket.countDocuments({
        eventId,
        status: "checked_in",
      });

      return {
        eventId: event._id,
        eventName: event.name,
        capacity: event.ticketLimit,
        totalIssued: issued,
        totalPaid: paid,
        totalCollected: Number(collectedAgg?.[0]?.totalCollected || 0),
        totalPending: pending,
        totalCheckedIn: checkedIn + partiallyUsed + used,
        totalPartially: partiallyUsed,
        totalUsed: used,
        totalCancelled: cancelled,
        remaining: Math.max(0, event.ticketLimit - event.totalTickets),
      };
    } catch (err) {
      throw new Error(err?.message || "Failed to fetch event stats");
    }
  },

  /**
   * Búsqueda de tickets por nombre, email o número de rifa.
   * Útil cuando alguien no tiene el QR a mano.
   */
  async searchTickets({ eventId, query: q }, ctx) {
    try {
      requireTicketAccess(ctx);
      if (!eventId) throw new Error("eventId is required");
      if (!q || q.trim().length < 2)
        throw new Error("Query must be at least 2 characters");

      const regex = new RegExp(q.trim(), "i");

      return await Ticket.find({
        eventId,
        $or: [
          { buyerName: regex },
          { buyerEmail: regex },
          { raffleNumbers: q.trim() },
        ],
      }).populate({
        path: "userId",
        select: "name firstSurName secondSurName email",
      });
    } catch (err) {
      throw new Error(err?.message || "Failed to search tickets");
    }
  },

  // ===========================================================================
  // MUTATIONS — EVENTOS
  // ===========================================================================

  async createEvent(
    { name, date, description, ticketLimit, raffleEnabled, price },
    ctx,
  ) {
    try {
      requireTicketAdmin(ctx);
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

  // ===========================================================================
  // MUTATIONS — EMISIÓN DE TICKETS
  // ===========================================================================

  /**
   * Asigna tickets a un único usuario registrado.
   * Notifica al usuario y, si existe, a su padre/madre/tutor.
   */
  async assignTickets({ input }, ctx) {
    try {
      requireTicketAdmin(ctx);
      if (!input) throw new Error("Input is required");

      const { userId, eventId, type, ticketQuantity } = input;

      const qty = assertPositiveInt(ticketQuantity, "ticketQuantity");
      if (!userId) throw new Error("userId is required");
      if (!eventId) throw new Error("eventId is required");
      if (!type) throw new Error("type is required");

      const [event, user] = await Promise.all([
        EventTicket.findById(eventId),
        User.findById(userId),
      ]);

      if (!event) throw new Error("Event not found");
      if (!user) throw new Error("User not found");

      await ensureEventCapacity(event, qty);

      const raffleNumbers = event.raffleEnabled
        ? await generateRaffleNumbers(eventId, qty)
        : [];

      const ticket = new Ticket({
        userId,
        buyerName: `${user.name} ${user.firstSurName}`.trim(),
        buyerEmail: user.email,
        eventId,
        type,
        ticketQuantity: qty,
        status: type === "courtesy" ? "paid" : "pending_payment",
        paid: type === "courtesy",
        qrCode: "",
        raffleNumbers,
      });

      await ticket.save();

      const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
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
        qrCodeDataUrl,
        qrPayload,
        date: new Date().toLocaleDateString("es-CR"),
      };

      const userEmailBuilt = buildEmailFromTemplateOrFallback(
        {
          template: assignedTicketTemplate,
          fallbackSubject: "Entradas asignadas",
          fallbackText: "Aquí están tus entradas.",
          fallbackHtml: `<p>Entradas asignadas. Ticket: ${ticket._id}</p>`,
        },
        { ...baseEmailData, recipient: { name: user.name, type: "user" } },
      );

      const baseContext = {
        ticketNumber: ticket._id.toString(),
        eventDescription: event.description,
        ticketQuantity: qty,
        raffleNumbers: raffleNumbers.join(", "),
        recipientName: user.name,
        orderNumber: ticket._id.toString(),
        orderDate: baseEmailData.date,
        QR_CODE_URL: qrCodeDataUrl,
      };

      const emailPromises = [
        sendEmail(ctx, {
          to: user.email,
          subject: userEmailBuilt.subject,
          text: userEmailBuilt.text,
          html: userEmailBuilt.html,
          context: userEmailBuilt.context || baseContext,
          attachments:
            userEmailBuilt.attachments || buildQrAttachment(qrCodeDataUrl),
        }),
      ];

      if (parent?.email) {
        const parentEmailBuilt = buildEmailFromTemplateOrFallback(
          {
            template: assignedTicketTemplate,
            fallbackSubject: "Entradas asignadas a su hijo/a",
            fallbackText: "Aquí están las entradas asignadas a su hijo/a.",
            fallbackHtml: `<p>Entradas asignadas a su hijo/a. Ticket: ${ticket._id}</p>`,
          },
          {
            ...baseEmailData,
            recipient: { name: parent.name, type: "parent" },
          },
        );

        emailPromises.push(
          sendEmail(ctx, {
            to: parent.email,
            subject: parentEmailBuilt.subject,
            text: parentEmailBuilt.text,
            html: parentEmailBuilt.html,
            context: parentEmailBuilt.context || baseContext,
            attachments:
              parentEmailBuilt.attachments || buildQrAttachment(qrCodeDataUrl),
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

  /**
   * Asignación masiva — acepta múltiples destinatarios en una sola operación.
   * Cada destinatario puede ser usuario registrado (userId) o externo (name + email).
   * Los fallos individuales no abortan el lote — se reportan en `failed`.
   */
  async assignTicketsBulk({ input }, ctx) {
    try {
      requireTicketAdmin(ctx);
      const { eventId, type, recipients } = input || {};

      if (!eventId) throw new Error("eventId is required");
      if (!type) throw new Error("type is required");
      if (!recipients?.length)
        throw new Error("At least one recipient is required");

      const event = await EventTicket.findById(eventId);
      if (!event) throw new Error("Event not found");

      const totalQty = recipients.reduce(
        (sum, r) => sum + assertPositiveInt(r.quantity || 1, "quantity"),
        0,
      );
      await ensureEventCapacity(event, totalQty);

      const results = await Promise.allSettled(
        recipients.map(async (recipient) => {
          const qty = assertPositiveInt(recipient.quantity || 1, "quantity");
          const isRegistered = !!recipient.userId;

          let user = null;
          if (isRegistered) {
            user = await User.findById(recipient.userId);
            if (!user) throw new Error(`User ${recipient.userId} not found`);
          }

          const name = user
            ? `${user.name} ${user.firstSurName}`.trim()
            : recipient.name;
          const email = user?.email || recipient.email;
          const skipEmail =
            Boolean(recipient.skipEmail) ||
            normalizeText(user?.state) === "exalumno";

          if (!name)
            throw new Error(
              "Recipient name is required for unregistered users",
            );
          if (!email)
            throw new Error(
              "Recipient email is required for unregistered users",
            );

          const raffleNumbers = event.raffleEnabled
            ? await generateRaffleNumbers(eventId, qty)
            : [];

          const ticket = new Ticket({
            userId: recipient.userId || null,
            buyerName: name,
            buyerEmail: email,
            eventId,
            type,
            ticketQuantity: qty,
            status: type === "courtesy" ? "paid" : "pending_payment",
            paid: type === "courtesy",
            qrCode: "",
            raffleNumbers,
          });

          await ticket.save();

          const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
          const qrCodeDataUrl = await buildQrDataUrl(qrPayload);
          ticket.qrCode = qrCodeDataUrl;
          await ticket.save();

          const templateToUse =
            type === "courtesy"
              ? courtesyTicketTemplate
              : assignedTicketTemplate;

          const built = buildEmailFromTemplateOrFallback(
            {
              template: templateToUse,
              fallbackSubject:
                type === "courtesy"
                  ? "Entrada de cortesía"
                  : "Entradas asignadas",
              fallbackText: "Aquí están tus entradas.",
              fallbackHtml: `<p>Ticket: ${ticket._id}</p>`,
            },
            {
              ticket,
              event,
              user,
              buyerName: name,
              buyerEmail: email,
              raffleNumbers,
              ticketQuantity: qty,
              qrCode: qrCodeDataUrl,
              qrCodeDataUrl,
              date: new Date().toLocaleDateString("es-CR"),
              recipient: { name, type: "user" },
            },
          );

          if (!skipEmail) {
            await sendEmail(ctx, {
              to: email,
              subject: built.subject,
              text: built.text,
              html: built.html,
              context: built.context,
              attachments: built.attachments || buildQrAttachment(qrCodeDataUrl),
            });
          }

          return ticket;
        }),
      );

      await incrementEventTotalTickets(eventId, totalQty);

      const succeeded = results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);

      const failed = results
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason?.message || "Unknown error");

      return { succeeded, failed, total: recipients.length };
    } catch (err) {
      throw new Error(err?.message || "Error in bulk ticket assignment");
    }
  },

  /**
   * Registra la compra de tickets por una persona externa (sin cuenta en el sistema).
   */
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
        status: "pending_payment",
        paid: false,
        qrCode: "",
        raffleNumbers,
      });

      await ticket.save();

      const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
      const qrCodeDataUrl = await buildQrDataUrl(qrPayload);
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
        qrCodeDataUrl,
        qrPayload,
        date: new Date().toLocaleDateString("es-CR"),
      };

      const purchasedEmailBuilt = buildPurchasedEmailContent(baseEmailData);

      await sendEmail(ctx, {
        to: buyerEmail,
        subject: purchasedEmailBuilt.subject,
        text: purchasedEmailBuilt.text,
        html: purchasedEmailBuilt.html,
        context: purchasedEmailBuilt.context || {
          ticketNumber: ticket._id.toString(),
          eventDescription: event.description,
          ticketQuantity: qty,
          raffleNumbers: raffleNumbers.join(", "),
          recipientName: buyerName,
          orderNumber: ticket._id.toString(),
          orderDate: baseEmailData.date,
          QR_CODE_URL: qrCodeDataUrl,
        },
        attachments:
          purchasedEmailBuilt.attachments || buildQrAttachment(qrCodeDataUrl),
      });

      await incrementEventTotalTickets(eventId, qty);

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Error purchasing ticket");
    }
  },

  /**
   * Emite una entrada de cortesía (paid = true desde el momento de creación).
   */
  async sendCourtesyTicket(
    { eventId, buyerName, buyerEmail, ticketQuantity },
    ctx,
  ) {
    try {
      requireTicketAdmin(ctx);
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
        status: "paid", // cortesía = siempre pagado
        paid: true,
        qrCode: "",
      });

      await ticket.save();

      const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
      const qrCodeDataUrl = await buildQrDataUrl(qrPayload);
      ticket.qrCode = qrCodeDataUrl;
      await ticket.save();

      const baseEmailData = {
        ticket,
        event,
        buyerName,
        buyerEmail,
        ticketQuantity: qty,
        qrCode: qrCodeDataUrl,
        qrCodeDataUrl,
        qrPayload,
        date: new Date().toLocaleDateString("es-CR"),
      };

      const built = buildEmailFromTemplateOrFallback(
        {
          template: courtesyTicketTemplate,
          fallbackSubject: "Entrada de cortesía",
          fallbackText: "Gracias por acompañarnos. Aquí está tu entrada.",
          fallbackHtml: `<p>Cortesía. Ticket: ${ticket._id}</p>`,
        },
        baseEmailData,
      );

      await sendEmail(ctx, {
        to: buyerEmail,
        subject: built.subject,
        text: built.text,
        html: built.html,
        context: built.context,
        attachments:
          built.attachments ||
          buildQrAttachment(qrCodeDataUrl, "entrada-cortesia.png"),
      });

      await incrementEventTotalTickets(eventId, qty);

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Error sending courtesy ticket");
    }
  },

  /**
   * Importa un Excel de tickets externos agrupando por persona/correo.
   * No toca la lógica manual existente. Cada persona queda en un único ticket
   * agregado con ticketQuantity = cantidad de filas encontradas en el Excel.
   *
   * Reglas de email:
   * - Si el grupo queda parcialmente pagado, no se envía correo.
   * - Si el grupo queda totalmente pagado, se envía un único correo con el QR.
   * - Si ya se había enviado correo pero la cantidad pagada cambió, se reenvía
   *   una sola vez para la nueva cantidad.
   */
  async importTicketsFromExcel({ input }, ctx) {
    try {
      requireTicketAdmin(ctx);
      const { eventId, fileBase64, sheetName } = input || {};
      if (!eventId) throw new Error("eventId is required");
      if (!fileBase64) throw new Error("fileBase64 is required");

      const event = await EventTicket.findById(eventId);
      if (!event) throw new Error("Event not found");

      const { rows } = parseImportedTicketRows(fileBase64, sheetName);
      if (!rows.length)
        throw new Error("El archivo no contiene filas de datos");

      const grouped = new Map();
      const failedRows = [];

      rows.forEach((row) => {
        const rowLabel = `Fila ${row.__rowIndex}`;
        const buyerName = String(row.buyerName || "").trim();
        const buyerEmail = String(row.buyerEmail || "")
          .trim()
          .toLowerCase();
        const ticketNumber = String(row.ticketNumber || "").trim();
        const normalizedStatus = normalizePaymentStatus(row.paymentStatus);

        if (!buyerName) {
          failedRows.push(`${rowLabel}: falta nombre`);
          return;
        }
        if (!buyerEmail) {
          failedRows.push(`${rowLabel}: falta correo`);
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
          failedRows.push(`${rowLabel}: correo inválido`);
          return;
        }
        if (!ticketNumber) {
          failedRows.push(`${rowLabel}: falta número de entrada`);
          return;
        }
        if (!normalizedStatus) {
          failedRows.push(
            `${rowLabel}: estado inválido "${row.paymentStatus || ""}" (use asignada/pagada)`,
          );
          return;
        }

        const importKey = buildImportKey({ buyerName, buyerEmail });
        if (!grouped.has(importKey)) {
          grouped.set(importKey, {
            importKey,
            buyerName,
            buyerEmail,
            ticketNumbers: new Set(),
            paidCount: 0,
            totalCount: 0,
          });
        }

        const entry = grouped.get(importKey);
        entry.buyerName = buyerName || entry.buyerName;
        entry.buyerEmail = buyerEmail || entry.buyerEmail;
        entry.ticketNumbers.add(ticketNumber);
        entry.totalCount += 1;
        if (normalizedStatus === "paid") entry.paidCount += 1;
      });

      const groupedEntries = [...grouped.values()];
      const currentImportedTickets = await Ticket.find({
        eventId,
        source: "excel_import",
      });
      const existingByKey = new Map(
        currentImportedTickets.map((ticket) => [ticket.importKey, ticket]),
      );
      const existingByExternalNumber = new Map();
      currentImportedTickets.forEach((ticket) => {
        (ticket.externalTicketNumbers || []).forEach((number) => {
          existingByExternalNumber.set(String(number), ticket);
        });
      });

      let createdTickets = 0;
      let updatedTickets = 0;
      let emailsSent = 0;
      let fullyPaidRecipients = 0;
      let partialRecipients = 0;
      let pendingRecipients = 0;
      let totalDelta = 0;

      for (const entry of groupedEntries) {
        const externalTicketNumbers = [...entry.ticketNumbers];
        const totalCount = externalTicketNumbers.length;
        const paidCount = Math.min(entry.paidCount, totalCount);
        const totalDue = totalCount * safeNumber(event.price, "event.price");
        const amountPaid = paidCount * safeNumber(event.price, "event.price");
        const fullyPaid = totalCount > 0 && paidCount === totalCount;

        if (paidCount === 0) pendingRecipients += 1;
        else if (fullyPaid) fullyPaidRecipients += 1;
        else partialRecipients += 1;

        let ticket = existingByKey.get(entry.importKey) || null;
        if (!ticket) {
          ticket =
            externalTicketNumbers
              .map((number) => existingByExternalNumber.get(String(number)))
              .find(Boolean) || null;
        }
        const previousQuantity = ticket?.ticketQuantity || 0;

        if (ticket?.status === "cancelled") {
          failedRows.push(
            `Ticket importado cancelado para ${entry.buyerEmail}; no se actualizó`,
          );
          continue;
        }

        if (!ticket) {
          ticket = new Ticket({
            eventId,
            type: "assigned",
            source: "excel_import",
            importKey: entry.importKey,
            buyerName: entry.buyerName,
            buyerEmail: entry.buyerEmail,
            ticketQuantity: totalCount,
            amountPaid,
            paid: fullyPaid,
            status: fullyPaid ? "paid" : "pending_payment",
            qrCode: "",
            externalTicketNumbers,
          });

          await ticket.save();

          const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
          ticket.qrCode = await buildQrDataUrl(qrPayload);
          ticket.status = recalculateStatus(ticket);
          await ticket.save();

          existingByKey.set(entry.importKey, ticket);
          createdTickets += 1;
        } else {
          ticket.buyerName = entry.buyerName;
          ticket.buyerEmail = entry.buyerEmail;
          ticket.importKey = entry.importKey;
          ticket.ticketQuantity = totalCount;
          ticket.amountPaid = Math.min(amountPaid, totalDue);
          ticket.paid = fullyPaid;
          ticket.externalTicketNumbers = externalTicketNumbers;
          if (!ticket.qrCode) {
            const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
            ticket.qrCode = await buildQrDataUrl(qrPayload);
          }
          ticket.status = recalculateStatus(ticket);
          await ticket.save();
          existingByKey.set(entry.importKey, ticket);
          updatedTickets += 1;
        }

        const sentEmail = await maybeSendImportedPaidTicketEmail({
          ticket,
          event,
          wasPaid: Boolean(ticket.paymentEmailSentAt),
          previousQuantity,
          ctx,
        });
        if (sentEmail) emailsSent += 1;

        totalDelta += totalCount - previousQuantity;
      }

      await adjustEventTotalTickets(eventId, totalDelta);

      return {
        totalRows: rows.length,
        groupedRecipients: groupedEntries.length,
        createdTickets,
        updatedTickets,
        emailsSent,
        fullyPaidRecipients,
        partialRecipients,
        pendingRecipients,
        invalidRows: failedRows.length,
        failedRows,
      };
    } catch (err) {
      throw new Error(err?.message || "Error importing tickets from Excel");
    }
  },

  async addImportedTicketRecipient({ input }, ctx) {
    try {
      requireTicketAdmin(ctx);
      const { eventId, buyerName, buyerEmail, ticketQuantity, paymentStatus } =
        input || {};

      if (!eventId) throw new Error("eventId is required");
      if (!buyerName) throw new Error("buyerName is required");
      if (!buyerEmail) throw new Error("buyerEmail is required");
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          String(buyerEmail).trim().toLowerCase(),
        )
      ) {
        throw new Error("buyerEmail is invalid");
      }

      const normalizedStatus = normalizePaymentStatus(paymentStatus);
      if (!normalizedStatus) {
        throw new Error('paymentStatus must be "asignada" or "pagada"');
      }

      const qty = assertPositiveInt(ticketQuantity, "ticketQuantity");
      const event = await EventTicket.findById(eventId);
      if (!event) throw new Error("Event not found");

      const importKey = buildImportKey({ buyerName, buyerEmail });
      const existing =
        (await Ticket.findOne({
          eventId,
          source: "excel_import",
          importKey,
        })) || null;

      const nextNumbers = await generateNextImportedTicketNumbers(eventId, qty);
      let ticket = existing;
      const previousQuantity = ticket?.ticketQuantity || 0;
      const wasPaid = Boolean(ticket?.paid);
      if (!ticket) {
        ticket = new Ticket({
          eventId,
          type: "assigned",
          source: "excel_import",
          importKey,
          buyerName: String(buyerName).trim(),
          buyerEmail: String(buyerEmail).trim().toLowerCase(),
          ticketQuantity: qty,
          amountPaid:
            normalizedStatus === "paid"
              ? qty * safeNumber(event.price, "event.price")
              : 0,
          paid: normalizedStatus === "paid",
          status: normalizedStatus === "paid" ? "paid" : "pending_payment",
          qrCode: "",
          externalTicketNumbers: nextNumbers,
        });
        await ticket.save();
        const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
        ticket.qrCode = await buildQrDataUrl(qrPayload);
        ticket.status = recalculateStatus(ticket);
        await ticket.save();
        await incrementEventTotalTickets(eventId, qty);
      } else {
        ticket.buyerName = String(buyerName).trim();
        ticket.buyerEmail = String(buyerEmail).trim().toLowerCase();
        ticket.importKey = importKey;
        ticket.ticketQuantity += qty;
        ticket.externalTicketNumbers = [
          ...(ticket.externalTicketNumbers || []),
          ...nextNumbers,
        ];
        if (normalizedStatus === "paid") {
          ticket.amountPaid += qty * safeNumber(event.price, "event.price");
        }
        const totalDue =
          ticket.ticketQuantity * safeNumber(event.price, "event.price");
        ticket.paid = Number(ticket.amountPaid) >= totalDue;
        ticket.status = recalculateStatus(ticket);
        if (!ticket.qrCode) {
          const qrPayload = buildQrPayload({ ticketId: ticket._id, eventId });
          ticket.qrCode = await buildQrDataUrl(qrPayload);
        }
        await ticket.save();
        await incrementEventTotalTickets(eventId, qty);
      }

      await maybeSendImportedPaidTicketEmail({
        ticket,
        event,
        wasPaid,
        previousQuantity,
        ctx,
      });

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Error adding imported ticket recipient");
    }
  },

  async resendImportedTicketEmail({ ticketId }, ctx) {
    try {
      requireTicketAdmin(ctx);
      return await resendImportedTicketEmailById(ticketId, ctx);
    } catch (err) {
      throw new Error(err?.message || "Error resending imported ticket email");
    }
  },

  // ===========================================================================
  // MUTATIONS — PAGO
  // ===========================================================================

  /**
   * Registra un abono parcial o total en el ticket.
   * Recalcula `paid` y `status` de forma atómica.
   */
  async updatePaymentStatus({ ticketId, amountPaid }, ctx) {
    try {
      requireTicketAccess(ctx);
      if (!ticketId) throw new Error("ticketId is required");

      const inc = safeNumber(amountPaid, "amountPaid");
      if (inc <= 0) throw new Error("amountPaid must be greater than 0");

      const existingTicket = await Ticket.findById(ticketId);
      if (!existingTicket) throw new Error("Ticket not found");
      const wasPaid = Boolean(existingTicket.paid);

      const ticket = await Ticket.findByIdAndUpdate(
        ticketId,
        { $inc: { amountPaid: inc } },
        { new: true, runValidators: true },
      );

      const event = await EventTicket.findById(ticket.eventId);
      if (!event) throw new Error("Event not found");

      const price = safeNumber(event.price, "event.price");
      const totalDue = Number(ticket.ticketQuantity) * price;
      const isPaid = Number(ticket.amountPaid) >= totalDue;

      if (ticket.paid !== isPaid) {
        ticket.paid = isPaid;
      }

      const newStatus = recalculateStatus(ticket);
      if (ticket.status !== newStatus) {
        ticket.status = newStatus;
      }

      await ticket.save();
      await maybeSendImportedPaidTicketEmail({
        ticket,
        event,
        wasPaid,
        previousQuantity: ticket.ticketQuantity,
        ctx,
      });

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Failed to update payment status");
    }
  },

  async settleTicketPayment({ ticketId }, ctx) {
    try {
      requireTicketAccess(ctx);
      if (!ticketId) throw new Error("ticketId is required");

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) throw new Error("Ticket not found");
      if (ticket.type === "courtesy") {
        throw new Error("La entrada de cortesía ya está pagada");
      }
      if (ticket.status === "cancelled") {
        throw new Error("La entrada está cancelada");
      }

      const event = await EventTicket.findById(ticket.eventId);
      if (!event) throw new Error("Event not found");

      const { balanceDue } = getTicketTotals(ticket, event);
      if (balanceDue <= 0) {
        throw new Error("La entrada ya está completamente pagada");
      }

      return await this.updatePaymentStatus(
        { ticketId, amountPaid: balanceDue },
        ctx,
      );
    } catch (err) {
      throw new Error(err?.message || "Failed to settle ticket payment");
    }
  },

  // ===========================================================================
  // MUTATIONS — VALIDACIÓN QR (ESCANEO)
  // ===========================================================================

  /**
   * Valida un QR y registra el ingreso de forma atómica.
   *
   * Flujo:
   *   1. Parsear payload
   *   2. Buscar ticket + verificar cross-evento
   *   3. Evaluar condiciones de bloqueo en orden de prioridad
   *   4. Actualización atómica con guarda $lt en scans (evita race condition)
   *   5. Recalcular status y persistir
   *
   * @param {string}  qrPayload  - JSON crudo leído del QR
   * @param {string}  [location] - Puerta o punto de acceso ("Puerta A")
   * @param {string}  [scannedBy] - ID del operador que escanea
   * @param {boolean} [forceEntry] - Admin override para entradas con deuda (opcional)
   */
  async validateTicket(
    { qrPayload, scannedBy, location, forceEntry = false },
    ctx,
  ) {
    try {
      const currentUser = requireTicketAccess(ctx);
      // 1. Parsear payload
      let parsed;
      try {
        parsed = JSON.parse(qrPayload);
      } catch {
        return buildValidationResult("invalid", null, "QR inválido o corrupto");
      }

      const { ticketId, eventId: qrEventId } = parsed;
      if (!ticketId) {
        return buildValidationResult("invalid", null, "QR sin ticket ID");
      }

      // 2. Cargar ticket con relaciones necesarias
      const ticket = await Ticket.findById(ticketId)
        .populate("userId", "name firstSurName secondSurName email")
        .populate("eventId", "name date price")
        .lean();

      if (!ticket) {
        return buildValidationResult("invalid", null, "Ticket no existe");
      }

      // Validación cross-evento: evita que un QR de otro evento cuele personas
      if (qrEventId && ticket.eventId._id.toString() !== qrEventId) {
        return buildValidationResult(
          "invalid",
          ticket,
          "QR no pertenece a este evento",
        );
      }

      const totals = getTicketTotals(ticket, ticket.eventId);

      // 3. Condiciones de bloqueo — orden: cancelled > unpaid > fully_used

      if (ticket.status === "cancelled") {
        return buildValidationResult("blocked", ticket, "Entrada cancelada");
      }

      if (!ticket.paid && ticket.type !== "courtesy" && !forceEntry) {
        return buildValidationResult(
          "unpaid",
          ticket,
          `Entrada sin pagar — debe cancelar el pago antes de ingresar`,
          {
            ...totals,
            canMarkPaid: true,
          },
        );
      }

      if (ticket.status === "fully_used") {
        return buildValidationResult(
          "duplicate",
          ticket,
          `Todos los ingresos ya fueron utilizados (${ticket.scans}/${ticket.ticketQuantity})`,
        );
      }

      // 4. Acceso permitido — actualización atómica con guarda en scans
      const maxScans = ticket.ticketQuantity;

      const updated = await Ticket.findOneAndUpdate(
        {
          _id: ticketId,
          scans: { $lt: maxScans }, // guarda: aún quedan ingresos
          status: { $nin: ["cancelled"] }, // segunda guarda: no fue cancelado concurrentemente
        },
        {
          $inc: { scans: 1 },
          $push: {
            scanLog: {
              scannedAt: new Date(),
              scannedBy:
                scannedBy || currentUser?.id || currentUser?._id || null,
              location: location || null,
              result: "ok",
            },
          },
        },
        { new: true },
      );

      if (!updated) {
        // La guarda falló: otro escáner procesó el mismo ticket en paralelo
        return buildValidationResult(
          "duplicate",
          ticket,
          "Ingreso ya registrado (doble escaneo detectado)",
        );
      }

      // 5. Recalcular y persistir status
      const newStatus = recalculateStatus(updated);
      if (updated.status !== newStatus) {
        await Ticket.findByIdAndUpdate(ticketId, { status: newStatus });
        updated.status = newStatus;
      }

      const remaining = maxScans - updated.scans;
      const message =
        remaining > 0
          ? `Acceso autorizado. Quedan ${remaining} entrada(s) disponibles.`
          : "Acceso autorizado. Última entrada utilizada.";

      return buildValidationResult(
        "ok",
        { ...ticket, scans: updated.scans, status: updated.status },
        message,
        totals,
      );
    } catch (err) {
      throw new Error(err?.message || "Error validating ticket");
    }
  },

  // ===========================================================================
  // MUTATIONS — GESTIÓN ADMINISTRATIVA
  // ===========================================================================

  /**
   * Cancela un ticket. Irreversible desde la app — solo admins.
   */
  async cancelTicket({ ticketId, reason, cancelledBy }, ctx) {
    try {
      requireTicketAdmin(ctx);
      if (!ticketId) throw new Error("ticketId is required");

      const ticket = await Ticket.findByIdAndUpdate(
        ticketId,
        {
          status: "cancelled",
          cancelledBy: cancelledBy || null,
          cancelledAt: new Date(),
          notes: reason || null,
          $push: {
            scanLog: {
              scannedAt: new Date(),
              scannedBy: cancelledBy || null,
              result: "invalid",
              note: `Cancelado: ${reason || "sin razón especificada"}`,
            },
          },
        },
        { new: true, runValidators: true },
      );

      if (!ticket) throw new Error("Ticket not found");

      return ticket;
    } catch (err) {
      throw new Error(err?.message || "Failed to cancel ticket");
    }
  },

  async deleteTicket({ ticketId }, ctx) {
    try {
      requireTicketAdmin(ctx);
      if (!ticketId) throw new Error("ticketId is required");

      const ticket = await Ticket.findById(ticketId);
      if (!ticket) throw new Error("Ticket not found");

      const quantity = assertPositiveInt(ticket.ticketQuantity || 1, "ticketQuantity");

      await Ticket.deleteOne({ _id: ticketId });
      await adjustEventTotalTickets(ticket.eventId, -quantity);

      return true;
    } catch (err) {
      throw new Error(err?.message || "Failed to delete ticket");
    }
  },
};
