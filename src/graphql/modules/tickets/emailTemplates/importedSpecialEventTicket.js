"use strict";

const SPECIAL_EVENT_ID = "69c213e365b8a50a73072670";
const JOSUE_INSTAGRAM_URL = "https://instagram.com/josuechinchilla3";

const escapeHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function formatEventDate(value, locale = "es-CR") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

module.exports = function buildImportedSpecialEventTicket({
  ticket,
  event,
  buyerName,
  buyerEmail,
  qrCodeDataUrl,
  locale = "es-CR",
} = {}) {
  const eventId = String(event?._id || event?.id || "");
  if (eventId !== SPECIAL_EVENT_ID) return null;

  const recipientName = escapeHtml(buyerName || ticket?.buyerName || "Invitado");
  const recipientEmail = escapeHtml(buyerEmail || ticket?.buyerEmail || "");
  const eventName = escapeHtml(event?.name || "Evento BCDB");
  const eventDescription = escapeHtml(event?.description || "Tus entradas están listas");
  const eventDate = escapeHtml(formatEventDate(event?.date, locale));
  const ticketId = escapeHtml(ticket?._id?.toString?.() || ticket?.id || "");
  const quantity = Number(ticket?.ticketQuantity || 1);
  const externalNumbers = Array.isArray(ticket?.externalTicketNumbers)
    ? ticket.externalTicketNumbers.map((n) => escapeHtml(n)).join(", ")
    : "";

  return {
    subject: `Tus entradas para ${eventName}`,
    text: `Hola ${recipientName}, tus ${quantity} entrada(s) para ${eventName} ya están listas.`,
    html: `
      <html dir="ltr" lang="es">
        <head>
          <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
          <meta name="x-apple-disable-message-reformatting" />
        </head>
        <body style="margin:0;background:#f5f1e8;font-family:Helvetica,Arial,sans-serif;color:#231f20;">
          <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
            <div style="background:linear-gradient(135deg,#1f3c88 0%,#0b1530 100%);border-radius:28px;padding:32px;color:#ffffff;box-shadow:0 20px 45px rgba(13,21,48,.18);">
              <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#d6def8;">
                Banda CEDES Don Bosco
              </p>
              <h1 style="margin:0;font-size:34px;line-height:1.1;font-weight:800;">
                ${eventName}
              </h1>
              <p style="margin:14px 0 0 0;font-size:16px;line-height:1.6;color:#e6ebff;">
                ${eventDescription}
              </p>
            </div>

            <div style="background:#ffffff;border-radius:24px;margin-top:-18px;padding:28px;box-shadow:0 18px 36px rgba(35,31,32,.08);">
              <p style="margin:0 0 10px 0;font-size:15px;line-height:1.7;">
                Hola <strong>${recipientName}</strong>, tus entradas ya quedaron listas para ingresar al evento.
              </p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.7;color:#5a5f73;">
                Presenta este QR en la entrada. Este correo corresponde a <strong>${quantity}</strong> entrada(s).
              </p>

              <div style="display:block;background:#f8f9fe;border:1px solid #e6ebff;border-radius:18px;padding:18px;margin-bottom:22px;">
                <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7380a6;">
                  Datos del evento
                </p>
                <p style="margin:0 0 6px 0;font-size:15px;"><strong>Evento:</strong> ${eventName}</p>
                ${eventDate ? `<p style="margin:0 0 6px 0;font-size:15px;"><strong>Fecha:</strong> ${eventDate}</p>` : ""}
                <p style="margin:0 0 6px 0;font-size:15px;"><strong>Cantidad:</strong> ${quantity} entrada(s)</p>
                ${externalNumbers ? `<p style="margin:0 0 6px 0;font-size:15px;"><strong>Números de entrada:</strong> ${externalNumbers}</p>` : ""}
                <p style="margin:0;font-size:15px;"><strong>Correo:</strong> ${recipientEmail || "No disponible"}</p>
              </div>

              <div style="text-align:center;margin:22px 0;">
                <img alt="QR Code" src="cid:qrCode" width="250" style="display:block;margin:0 auto;border:none;outline:none;" />
              </div>

              <div style="background:#fff8ea;border:1px solid #f2dfb5;border-radius:18px;padding:16px 18px;margin-top:12px;">
                <p style="margin:0;font-size:14px;line-height:1.7;color:#5d4b1f;">
                  <strong>Referencia:</strong> ${ticketId}
                </p>
              </div>

              <div style="margin-top:26px;padding-top:18px;border-top:1px solid #eceff7;text-align:center;">
                <p style="margin:0 0 8px 0;font-size:15px;line-height:1.7;color:#66708a;font-weight:600;">
                  Desarrollado por
                  <a
                    href="${JOSUE_INSTAGRAM_URL}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="color:#1f3c88;font-weight:800;text-decoration:none;margin-left:6px;display:inline-flex;align-items:center;gap:6px;"
                  >
                    <span
                      style="display:inline-block;width:16px;height:16px;vertical-align:middle;"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="5" stroke="#1f3c88" stroke-width="1.8"/>
                        <circle cx="12" cy="12" r="4.2" stroke="#1f3c88" stroke-width="1.8"/>
                        <circle cx="17.4" cy="6.6" r="1.2" fill="#1f3c88"/>
                      </svg>
                    </span>
                    Josué Chinchilla
                  </a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.7;color:#a0a6ba;">
                  Guarda este correo y preséntalo el día del evento.
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    attachments: qrCodeDataUrl
      ? [
          {
            filename: "ticket.png",
            content: String(qrCodeDataUrl).split(",")[1],
            encoding: "base64",
            cid: "qrCode",
          },
        ]
      : [],
  };
};
