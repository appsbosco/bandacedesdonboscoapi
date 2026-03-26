const BookingRequest = require("../../../../../models/BookingRequest");
const { sendMail } = require("../../../shared/mailer");

const ADMIN_ROLES = new Set(["Admin", "Director", "Dirección Logística"]);
const ENSEMBLE_LABELS = {
  BANDAS_DE_CONCIERTO: "Bandas de Concierto",
  BIG_BAND: "Big Band",
  BANDA_DE_MARCHA: "Banda de Marcha",
  CIMARRONA: "Cimarrona",
};
const EVENT_TYPE_LABELS = {
  CONCERT: "Concierto",
  FESTIVAL: "Festival",
  PARADE: "Desfile",
  WEDDING: "Boda",
  CORPORATE: "Evento corporativo",
  INSTITUTIONAL: "Evento institucional",
  COMMUNITY: "Evento comunal",
  PRIVATE: "Celebración privada",
  PROTOCOL: "Acto protocolario",
  OTHER: "Otro",
};
const BUDGET_CURRENCY_LABELS = {
  CRC: "Colones (CRC)",
  USD: "Dólares (USD)",
};
const LEGACY_EVENT_TYPE_ALIASES = {
  CONCIERTO: "CONCERT",
  FESTIVAL: "FESTIVAL",
  DESFILE: "PARADE",
  BODA: "WEDDING",
  WEDDING: "WEDDING",
  "EVENTO CORPORATIVO": "CORPORATE",
  CORPORATE: "CORPORATE",
  "EVENTO INSTITUCIONAL": "INSTITUTIONAL",
  INSTITUTIONAL: "INSTITUTIONAL",
  "EVENTO COMUNAL": "COMMUNITY",
  COMMUNITY: "COMMUNITY",
  "CELEBRACION PRIVADA": "PRIVATE",
  "CELEBRACIÓN PRIVADA": "PRIVATE",
  PRIVATE: "PRIVATE",
  "ACTO PROTOCOLARIO": "PROTOCOL",
  PROTOCOL: "PROTOCOL",
  OTRO: "OTHER",
  OTHER: "OTHER",
};
const VALID_EVENT_TYPES = new Set(Object.keys(EVENT_TYPE_LABELS));
const EMAIL_LOGO_URL =
  process.env.BOOKING_REQUEST_EMAIL_LOGO_URL ||
  "https://res.cloudinary.com/dnv9akklf/image/upload/q_auto,f_auto/v1686511395/LOGO_BCDB_qvjabt.png";

function getCurrentUser(ctx) {
  return ctx?.user || ctx?.me || ctx?.currentUser || null;
}

function requireAdmin(ctx) {
  const user = getCurrentUser(ctx);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    throw new Error("No autorizado");
  }
  return user;
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeSearch(value) {
  return cleanString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLegacyKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function normalizeBookingRequestEventType(value) {
  const normalized = normalizeLegacyKey(value);
  if (!normalized) return "OTHER";
  if (VALID_EVENT_TYPES.has(normalized)) return normalized;
  return LEGACY_EVENT_TYPE_ALIASES[normalized] || "OTHER";
}

function parseDateInput(value, fieldName) {
  const normalized = cleanString(value);
  const date = new Date(normalized);
  if (!normalized || Number.isNaN(date.getTime())) {
    throw new Error(`Campo inválido: ${fieldName}`);
  }
  return date;
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value));
}

function validateBookingRequestInput(input = {}) {
  const requiredTextFields = [
    ["fullName", 3],
    ["email", 5],
    ["phone", 7],
    ["eventTime", 3],
    ["venue", 3],
    ["province", 2],
    ["canton", 2],
    ["district", 2],
    ["address", 10],
    ["estimatedDuration", 2],
    ["message", 20],
  ];

  if (!ENSEMBLE_LABELS[input.ensemble]) {
    throw new Error("Agrupación inválida");
  }

  if (!EVENT_TYPE_LABELS[input.eventType]) {
    throw new Error("Tipo de evento inválido");
  }

  requiredTextFields.forEach(([field, minLength]) => {
    const value = cleanString(input[field]);
    if (value.length < minLength) {
      throw new Error(`Campo inválido: ${field}`);
    }
  });

  if (!validateEmail(input.email)) {
    throw new Error("Correo electrónico inválido");
  }

  if (input.expectedAudience != null && Number(input.expectedAudience) < 0) {
    throw new Error("La cantidad de público no puede ser negativa");
  }

  if (input.estimatedBudget != null && Number(input.estimatedBudget) < 0) {
    throw new Error("El presupuesto no puede ser negativo");
  }

  if ((input.estimatedBudget != null && input.estimatedBudget !== "") && !input.budgetCurrency) {
    throw new Error("Debes indicar la moneda del presupuesto");
  }

  if (input.budgetCurrency && !BUDGET_CURRENCY_LABELS[input.budgetCurrency]) {
    throw new Error("Moneda inválida");
  }

  if (input.eventType === "OTHER" && cleanString(input.eventTypeOther).length < 3) {
    throw new Error("Debes especificar el tipo de evento");
  }

  if (input.acceptedDataPolicy !== true) {
    throw new Error("Debes aceptar el tratamiento de datos");
  }

  return {
    ensemble: input.ensemble,
    fullName: cleanString(input.fullName),
    company: cleanString(input.company),
    email: cleanString(input.email).toLowerCase(),
    phone: cleanString(input.phone),
    eventType: normalizeBookingRequestEventType(input.eventType),
    eventTypeOther: cleanString(input.eventTypeOther),
    eventDate: parseDateInput(input.eventDate, "eventDate"),
    eventTime: cleanString(input.eventTime),
    venue: cleanString(input.venue),
    province: cleanString(input.province),
    canton: cleanString(input.canton),
    district: cleanString(input.district),
    address: cleanString(input.address),
    estimatedDuration: cleanString(input.estimatedDuration),
    expectedAudience:
      input.expectedAudience == null || input.expectedAudience === ""
        ? null
        : Number(input.expectedAudience),
    estimatedBudget:
      input.estimatedBudget == null || input.estimatedBudget === ""
        ? null
        : Number(input.estimatedBudget),
    budgetCurrency: input.budgetCurrency || null,
    message: cleanString(input.message),
    acceptedDataPolicy: true,
  };
}

function getEventTypeLabel(request) {
  if (request.eventType === "OTHER" && request.eventTypeOther) {
    return `${EVENT_TYPE_LABELS.OTHER}: ${request.eventTypeOther}`;
  }

  return EVENT_TYPE_LABELS[request.eventType] || request.eventType;
}

function getBudgetLabel(request) {
  if (request.estimatedBudget == null) return "No indicado";
  const currency = BUDGET_CURRENCY_LABELS[request.budgetCurrency] || request.budgetCurrency || "";
  return `${request.estimatedBudget} ${currency}`.trim();
}

function getNotificationRecipients() {
  const raw =
    process.env.BOOKING_REQUEST_NOTIFICATION_EMAILS ||
    process.env.CONTACT_NOTIFICATION_EMAILS ||
    "banda@cedesdonbosco.ed.cr";

  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function buildInternalEmailHtml(request) {
  return `
    <div style="margin:0;background:#f8fafc;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#0369a1 100%);padding:28px 32px;color:#ffffff;">
          <img src="${EMAIL_LOGO_URL}" alt="Banda CEDES Don Bosco" style="max-width:140px;height:auto;display:block;margin-bottom:18px;" />
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#bae6fd;">Nueva solicitud</p>
          <h1 style="margin:0;font-size:28px;line-height:1.2;">Contratación de ${ENSEMBLE_LABELS[request.ensemble]}</h1>
        </div>
        <div style="padding:28px 32px;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:18px 20px;margin-bottom:22px;">
            <p style="margin:0 0 6px;font-size:14px;color:#475569;">Solicitante</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">${request.fullName}</p>
            <p style="margin:8px 0 0;font-size:14px;color:#475569;">${request.company || "Sin empresa"} · ${request.email} · ${request.phone}</p>
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 12px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Tipo de evento:</strong> ${getEventTypeLabel(request)}</td>
              <td style="padding:0 0 12px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Fecha:</strong> ${request.eventDate.toLocaleDateString("es-CR")}</td>
            </tr>
            <tr>
              <td style="padding:0 0 12px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Hora:</strong> ${request.eventTime}</td>
              <td style="padding:0 0 12px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Duración:</strong> ${request.estimatedDuration}</td>
            </tr>
            <tr>
              <td style="padding:0 0 12px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Público esperado:</strong> ${request.expectedAudience ?? "No indicado"}</td>
              <td style="padding:0 0 12px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Presupuesto:</strong> ${getBudgetLabel(request)}</td>
            </tr>
          </table>
          <div style="margin-top:12px;padding:18px 20px;border:1px solid #e2e8f0;border-radius:18px;">
            <p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Lugar:</strong> ${request.venue}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Provincia / Cantón / Distrito:</strong> ${request.province} / ${request.canton} / ${request.district}</p>
            <p style="margin:0;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Dirección:</strong> ${request.address}</p>
          </div>
          <div style="margin-top:20px;padding:18px 20px;background:#f8fafc;border-radius:18px;border:1px solid #e2e8f0;">
            <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0f172a;">Mensaje adicional</p>
            <p style="margin:0;font-size:14px;line-height:1.7;color:#334155;">${request.message.replace(/\n/g, "<br />")}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildConfirmationEmailHtml(request) {
  return `
    <div style="margin:0;background:#f8fafc;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#0f172a 0%,#0369a1 100%);padding:28px 32px;color:#ffffff;">
          <img src="${EMAIL_LOGO_URL}" alt="Banda CEDES Don Bosco" style="max-width:140px;height:auto;display:block;margin-bottom:18px;" />
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#bae6fd;">Confirmación automática</p>
          <h1 style="margin:0;font-size:28px;line-height:1.2;">Recibimos tu solicitud</h1>
        </div>
        <div style="padding:28px 32px;">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Hola ${request.fullName},</p>
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
            Gracias por tu interés en contratar a <strong>${ENSEMBLE_LABELS[request.ensemble]}</strong> de la Banda CEDES Don Bosco.
          </p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">
            Nuestro equipo revisará la información enviada y te contactará por este medio para continuar con la atención de la solicitud.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:18px 20px;">
            <p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Agrupación:</strong> ${ENSEMBLE_LABELS[request.ensemble]}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Evento:</strong> ${getEventTypeLabel(request)}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Fecha:</strong> ${request.eventDate.toLocaleDateString("es-CR")}</p>
            <p style="margin:0 0 8px;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Lugar:</strong> ${request.venue}</p>
            <p style="margin:0;font-size:14px;color:#475569;"><strong style="color:#0f172a;">Ubicación:</strong> ${request.province} / ${request.canton} / ${request.district}</p>
          </div>
          <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#64748b;">
            Este correo es una confirmación automática de recepción.
          </p>
        </div>
      </div>
    </div>
  `;
}

async function sendNotificationEmails(request, ctx) {
  const sender = ctx?.sendEmail || ctx?.services?.email?.sendEmail || sendMail;
  const recipients = getNotificationRecipients();

  try {
    await sender({
      to: recipients.join(", "),
      subject: `Nueva solicitud de contratación: ${ENSEMBLE_LABELS[request.ensemble]}`,
      html: buildInternalEmailHtml(request),
    });

    request.notificationEmailSentAt = new Date();
  } catch (error) {
    console.error("[bookingRequests] notification email error", error);
  }

  try {
    await sender({
      to: request.email,
      subject: "Recibimos tu solicitud de contratación",
      html: buildConfirmationEmailHtml(request),
    });

    request.confirmationEmailSentAt = new Date();
  } catch (error) {
    console.error("[bookingRequests] confirmation email error", error);
  }

  await request.save();
}

async function createBookingRequest(input, ctx) {
  const payload = validateBookingRequestInput(input);
  const request = await BookingRequest.create(payload);
  await sendNotificationEmails(request, ctx);
  return request;
}

async function getBookingRequests(filter, ctx) {
  requireAdmin(ctx);

  const query = {};

  if (filter?.ensemble) query.ensemble = filter.ensemble;
  if (filter?.status) query.status = filter.status;

  if (filter?.dateFrom || filter?.dateTo) {
    query.eventDate = {};
    if (filter.dateFrom) query.eventDate.$gte = parseDateInput(filter.dateFrom, "dateFrom");
    if (filter.dateTo) {
      const dateTo = parseDateInput(filter.dateTo, "dateTo");
      dateTo.setHours(23, 59, 59, 999);
      query.eventDate.$lte = dateTo;
    }
  }

  if (filter?.searchText) {
    const regex = new RegExp(normalizeSearch(filter.searchText), "i");
    query.$or = [
      { fullName: regex },
      { email: regex },
      { company: regex },
      { phone: regex },
      { eventType: regex },
      { eventTypeOther: regex },
      { district: regex },
      { venue: regex },
    ];
  }

  return BookingRequest.find(query).sort({ createdAt: -1 }).lean(false);
}

async function getBookingRequest(id, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID requerido");
  return BookingRequest.findById(id);
}

async function updateBookingRequestStatus(id, input, ctx) {
  requireAdmin(ctx);
  if (!id) throw new Error("ID requerido");
  if (!input?.status) throw new Error("Estado requerido");

  const updated = await BookingRequest.findByIdAndUpdate(
    id,
    {
      $set: {
        status: input.status,
        statusNotes: cleanString(input.statusNotes),
      },
    },
    { new: true, runValidators: true },
  );

  if (!updated) {
    throw new Error("Solicitud no encontrada");
  }

  return updated;
}

module.exports = {
  createBookingRequest,
  getBookingRequests,
  getBookingRequest,
  updateBookingRequestStatus,
  ENSEMBLE_LABELS,
  normalizeBookingRequestEventType,
};
