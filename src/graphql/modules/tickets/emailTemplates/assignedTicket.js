/**
 * tickets/emailTemplates/assignedTicket.js
 * Generado por scaffold-graphql.js
 * (No sobreescribir: editá libremente)
 */

"use strict";

const escapeHtml = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

module.exports = function buildAssignedTicket({
  ticket,
  event,
  user,
  recipient = {}, // { name, type: "user" | "parent" }
  raffleNumbers = [],
  qrCodeDataUrl, // data:image/png;base64,...
  locale = "es-CR",

  // opcionales / hardcodes actuales
  paymentSinpe = "6445-3952",
  contactName = "Josué Chinchilla",
  contactUrl = "https://wa.link/mh2ots",
  websiteUrl = "www.bandacedesdonbosco.com",
  year = new Date().getFullYear(),
} = {}) {
  const ticketId = ticket?._id?.toString?.() || "";
  const safeTicketId = escapeHtml(ticketId);

  const eventDescription = escapeHtml(event?.description ?? "");
  const eventName = escapeHtml(event?.name ?? "evento");

  const fullName = user
    ? `${user.name ?? ""} ${user.firstSurName ?? ""} ${user.secondSurName ?? ""}`
        .replace(/\s+/g, " ")
        .trim()
    : recipient?.name || "";

  const safeFullName = escapeHtml(fullName || "Usuario");

  const isParent = recipient?.type === "parent";

  const subject = isParent
    ? "Entradas asignadas a su hijo/a"
    : "Entradas asignadas";
  const text = isParent
    ? "Aquí están las entradas asignadas a su hijo/a."
    : "Aquí están tus entradas.";

  const raffleHtml =
    Array.isArray(raffleNumbers) && raffleNumbers.length > 0
      ? raffleNumbers.map((n) => `<div>${escapeHtml(n)}</div>`).join("")
      : "";

  // Copy diferente para padre vs usuario (manteniendo tu estilo)
  const introParagraph = isParent
    ? `Acá están tu/s entrada/s para el evento. Utiliza el código QR al presentarlo en la entrada del evento.`
    : `Acá están tu/s entrada/s para la/el ${eventName}. Utiliza el código QR al presentarlo en la entrada del evento.`;

  return {
    subject,
    text,
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
                              ${safeTicketId}
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
                      ¡ ${eventDescription}!
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
                      ${introParagraph}
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
                      canceladas al SINPE de la BCDB. (${escapeHtml(paymentSinpe)}) .
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
                      ${safeFullName}
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

                    <div style="width: 100%; text-align: center;">
                      <a
                        href="${escapeHtml(contactUrl)}"
                        style="
                          font-size: 12px;
                          text-align: center;
                          line-height: 2;
                          margin: auto;
                        "
                      >${escapeHtml(contactName)}</a>
                    </div>
                  </td>
                </tr>

                ${
                  raffleHtml
                    ? `
                <tr>
                  <td>
                    <h1
                      style="
                        font-size: 32px;
                        line-height: 1.3;
                        font-weight: 700;
                        text-align: center;
                        letter-spacing: -1px;
                        margin: 24px 0 0 0;
                      "
                    >
                      ${raffleHtml}
                    </h1>
                  </td>
                </tr>
                `
                    : ""
                }

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
                      ${escapeHtml(new Date().toLocaleDateString(locale))}
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
              style="padding-top: 22px; padding-bottom: 22px"
            >
              <tbody>
                <tr>
                  <td>
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
                      ${escapeHtml(websiteUrl)}
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
                    <p
                      style="
                        font-size: 13px;
                        line-height: 24px;
                        margin: 0;
                        color: #afafaf;
                        text-align: center;
                        padding-top: 30px;
                        padding-bottom: 10px;
                      "
                    >
                      Por favor contáctanos si tienes alguna pregunta. (Si respondes a este correo, no podremos ver el mensaje.)
                    </p>

                    <p
                      style="
                        font-size: 13px;
                        line-height: 24px;
                        margin: 0;
                        color: #afafaf;
                        text-align: center;
                        padding-bottom: 30px;
                      "
                    >
                      © ${escapeHtml(year)} Banda CEDES Don Bosco, Todos los derechos reservados.
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>

          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`,
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
