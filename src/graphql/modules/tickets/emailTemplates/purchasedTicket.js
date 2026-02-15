// tickets/emailTemplates/purchasedTicket.js

const escapeHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

module.exports = function buildPurchasedTicketEmail({
  ticket,
  event,

  user,
  buyerName,
  buyerEmail,
  raffleNumbers = [],
  qrCodeDataUrl, // "data:image/png;base64,...."
  locale = "es-CR",
}) {
  const ticketId = ticket?._id?.toString?.() || "";
  const eventName = escapeHtml(event?.name ?? "");
  const eventDescription = escapeHtml(event?.description ?? "");

  const fullName = escapeHtml(
    (
      `${user?.name ?? buyerName ?? ""} ` +
      `${user?.firstSurName ?? ""} ` +
      `${user?.secondSurName ?? ""}`
    ).trim(),
  );

  const recipientEmail = escapeHtml(user?.email ?? buyerEmail ?? "");
  const orderDate = escapeHtml(new Date().toLocaleDateString(locale));

  const raffleHtml = raffleNumbers.length
    ? raffleNumbers.map((n) => `<div>${escapeHtml(n)}</div>`).join("")
    : "";

  return {
    subject: "Entradas asignadas",
    text: "Aquí están tus entradas.",
    html: `
      <html dir="ltr" lang="es">
        <head>
          <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
          <meta name="x-apple-disable-message-reformatting" />
        </head>
        <body style="background-color:#ffffff; font-family: Arial, sans-serif;">
          <div style="max-width:600px;margin:10px auto;border:1px solid #e5e5e5;padding:24px;">
            
            <div style="text-align:center;">
              <img
                alt="Banda CEDES Don Bosco"
                height="120"
                width="200"
                src="https://res.cloudinary.com/dnv9akklf/image/upload/q_auto,f_auto/v1686511395/LOGO_BCDB_qvjabt.png"
                style="display:block;margin:0 auto 16px auto;border:none;outline:none;text-decoration:none;"
              />
              <h1 style="margin:0 0 8px 0;font-size:28px;line-height:1.25;">
                ¡${eventDescription}!
              </h1>
              ${eventName ? `<p style="margin:0 0 12px 0;color:#666;">Evento: <strong>${eventName}</strong></p>` : ""}
            </div>

            <hr style="border:none;border-top:1px solid #eaeaea;margin:20px 0;" />

            <p style="margin:0 0 6px 0;text-align:center;font-weight:bold;">Número de Entrada</p>
            <p style="margin:0 0 16px 0;text-align:center;color:#6f6f6f;">${escapeHtml(ticketId)}</p>

            <p style="margin:0 0 6px 0;text-align:center;font-weight:bold;">Entradas asignadas a:</p>
            <p style="margin:0 0 6px 0;text-align:center;"><strong>${fullName}</strong></p>
            ${recipientEmail ? `<p style="margin:0 0 16px 0;text-align:center;color:#6f6f6f;">${recipientEmail}</p>` : ""}

            ${raffleHtmlBlock(raffleHtml)}

            <hr style="border:none;border-top:1px solid #eaeaea;margin:20px 0;" />

            <p style="margin:0 0 10px 0;text-align:center;color:#747474;">
              Acá están tu/s entrada/s para el evento. Utiliza el código QR al presentarlo en la entrada del evento.
            </p>
            <p style="margin:0 0 18px 0;text-align:center;color:#747474;">
              Antes de ingresar a la actividad, las entradas deben estar canceladas al SINPE de la BCDB. (6445-3952).
            </p>

            <div style="text-align:center; margin: 10px 0 18px 0;">
              <img alt="QR Code" src="cid:qrCode" width="260" style="display:block;margin:0 auto;border:none;outline:none;" />
            </div>

            <p style="margin:0;text-align:center;font-weight:bold;">Fecha de reserva</p>
            <p style="margin:6px 0 0 0;text-align:center;">${orderDate}</p>

            <hr style="border:none;border-top:1px solid #eaeaea;margin:20px 0;" />

            <p style="margin:0;text-align:center;font-weight:bold;font-size:18px;">
              www.bandacedesdonbosco.com
            </p>

            <p style="margin:18px 0 0 0;text-align:center;color:#afafaf;font-size:13px;line-height:20px;">
              Por favor contáctanos si tienes alguna pregunta. (Si respondes a este correo, no podremos ver el mensaje.)
            </p>

            <p style="margin:10px 0 0 0;text-align:center;color:#afafaf;font-size:13px;line-height:20px;">
              © ${new Date().getFullYear()} Banda CEDES Don Bosco, Todos los derechos reservados.
            </p>
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

function raffleHtmlBlock(raffleHtml) {
  if (!raffleHtml) return "";
  return `
    <hr style="border:none;border-top:1px solid #eaeaea;margin:20px 0;" />
    <h2 style="margin:0 0 10px 0;text-align:center;font-size:18px;">
      Sus números para la rifa:
    </h2>
    <div style="text-align:center;font-size:20px;line-height:1.6;">
      ${raffleHtml}
    </div>
  `;
}
