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

  const recipientName = escapeHtml(
    buyerName || ticket?.buyerName || "Invitado",
  );
  const recipientEmail = escapeHtml(buyerEmail || ticket?.buyerEmail || "");
  const eventName = escapeHtml(event?.name || "Evento BCDB");
  const eventDescription = escapeHtml(
    event?.description || "Tus entradas están listas",
  );
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
        <body style="margin:0;padding:0;background-color:#f0ede8;font-family:Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">

          <div style="max-width:560px;margin:0 auto;padding:36px 16px 52px;">

            <!-- MAIN CARD -->
            <div style="background:#ffffff;border-radius:3px;overflow:hidden;border:1px solid #dedad4;">

              <!-- HEADER: compact, editorial -->
              <div style="padding:30px 32px 24px;border-bottom:1px solid #eeebe6;">
                <p style="margin:0 0 14px 0;font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#b0a99e;">
                  Banda CEDES Don Bosco
                </p>
                <h1 style="margin:0 0 8px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;line-height:1.15;color:#1a1a18;letter-spacing:-.3px;">
                  ${eventName}
                </h1>
                <p style="margin:0;font-size:14px;line-height:1.65;color:#7a756e;">
                  ${eventDescription}
                </p>
              </div>

              <!-- BODY -->
              <div style="padding:26px 32px 30px;">

                <!-- Greeting -->
                <p style="margin:0 0 22px 0;font-size:14.5px;line-height:1.7;color:#444;">
                  Hola <strong style="color:#1a1a18;">${recipientName}</strong> — tus entradas ya quedaron listas. Presenta este QR en la entrada; corresponde a <strong style="color:#1a1a18;">${quantity}</strong> entrada(s).
                </p>

                <!-- Details table -->
                <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:26px;">
                  ${
                    eventDate
                      ? `
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #f0ede8;color:#b0a99e;width:100px;vertical-align:top;">Fecha</td>
                    <td style="padding:8px 0;border-bottom:1px solid #f0ede8;color:#1a1a18;">${eventDate}</td>
                  </tr>`
                      : ""
                  }
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #f0ede8;color:#b0a99e;vertical-align:top;">Entradas</td>
                    <td style="padding:8px 0;border-bottom:1px solid #f0ede8;color:#1a1a18;font-weight:700;">${quantity}</td>
                  </tr>
                  ${
                    externalNumbers
                      ? `
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #f0ede8;color:#b0a99e;vertical-align:top;">Números</td>
                    <td style="padding:8px 0;border-bottom:1px solid #f0ede8;color:#1a1a18;">${externalNumbers}</td>
                  </tr>`
                      : ""
                  }
                  <tr>
                    <td style="padding:8px 0;color:#b0a99e;vertical-align:top;">Correo</td>
                    <td style="padding:8px 0;color:#1a1a18;">${recipientEmail || "No disponible"}</td>
                  </tr>
                </table>

                <!-- QR block -->
                <div style="text-align:center;padding:22px 0;">
                  <img
                    alt="Código QR"
                    src="cid:qrCode"
                    width="180"
                    style="display:block;margin:0 auto;border:1px solid #dedad4;"
                  />
                  <p style="margin:10px 0 0;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#c0b9b1;">
                    Escanear en la entrada
                  </p>
                </div>

             

              </div>

              <!-- FOOTER -->
              <div style="padding:18px 32px;border-top:1px solid #eeebe6;background:#faf8f5;text-align:center;">
                <div style="display:inline-flex;flex-direction:column;align-items:center;gap:8px;">
                  <span style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#b0a99e;font-weight:700;">
                    Desarrollado por
                  </span>
                  <a
                    href="${JOSUE_INSTAGRAM_URL}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:#1f3c88;text-decoration:none;background:#ffffff;border:1px solid #dbe3f2;border-radius:999px;padding:10px 16px;box-shadow:0 4px 14px rgba(31,60,136,.06);"
                  >
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:#f3f6fc;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" style="display:block;">
                        <rect x="3" y="3" width="18" height="18" rx="5" stroke="#1f3c88" stroke-width="2"/>
                        <circle cx="12" cy="12" r="4" stroke="#1f3c88" stroke-width="2"/>
                        <circle cx="17.2" cy="6.8" r="1.3" fill="#1f3c88"/>
                      </svg>
                    </span>
                    <span>Josué Chinchilla</span>
                    <span style="font-size:13px;line-height:1;color:#8a99ba;">↗</span>
                  </a>
                </div>
              </div>

            </div>
            <!-- /CARD -->

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
