/**
 * tickets/emailTemplates/courtesyTicket.js
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

module.exports = function buildCourtesyTicket({
  ticket,
  event,
  buyerName,
  buyerEmail, // opcional (no se usa en html, pero lo dejamos por consistencia)
  qrCodeDataUrl, // "data:image/png;base64,...."
  locale = "es-CR",

  // opcionales por si querés parametrizar links/textos
  confirmUrl = "https://wa.link/z7nmqs",
  instagramUrl = "https://www.instagram.com/bandacedesdonbosco/#",
  facebookUrl = "https://www.facebook.com/bcdbcr",

  // si luego querés mover estos hardcodes a datos del evento:
  invitationText = "Te esperamos el sábado 16 de agosto en CEDES Don Bosco, a las 4:30 p.m. Entrada gratuita con previa confirmación.",
} = {}) {
  const safeName = escapeHtml(buyerName || "Invitado/a");
  const year = new Date().getFullYear();

  // por si querés mostrarlo en algún lado en el futuro:
  const ticketId = ticket?._id?.toString?.() || "";
  const safeTicketId = escapeHtml(ticketId);

  // si querés usarlo (ahora el template no lo muestra explícito)
  const eventDescription = escapeHtml(event?.description ?? "");

  return {
    subject: "🎟 Entrada de cortesía - 60 Aniversario BCDB",
    text: "Gracias por acompañarnos. Aquí está tu entrada.",
    html: `
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--[if mso]>
      <xml><w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word"><w:DontUseAdvancedTypographyReadingMail /></w:WordDocument>
      <o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG /></o:OfficeDocumentSettings></xml>
    <![endif]-->
    <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@100;200;300;400;500;600;700;800;900" rel="stylesheet" type="text/css" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: inherit !important; }
      #MessageViewBody a { color: inherit; text-decoration: none; }
      p { line-height: inherit; }
      .desktop_hide, .desktop_hide table { mso-hide: all; display: none; max-height: 0px; overflow: hidden; }
      .image_block img + div { display: none; }
      sup, sub { font-size: 75%; line-height: 0; }
      @media (max-width: 720px) {
        .mobile_hide { display:none; max-height:0; overflow:hidden; font-size:0px; }
        .row-content { width: 100% !important; }
        .stack .column { width: 100%; display: block; }
      }
    </style>
  </head>

  <body class="body" style="background-color:#293964;margin:0;padding:0;-webkit-text-size-adjust:none;text-size-adjust:none;">
    <table class="nl-container" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#293964;">
      <tbody>
        <tr>
          <td>

            <!-- HERO -->
            <table class="row row-1" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
                      style="background-color:#293964;background-image:url('https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511065/effect_sczdbc.png');background-repeat:no-repeat;color:#000000;width:700px;margin:0 auto;"
                      width="700">
                      <tbody>
                        <tr>
                          <td class="column column-1" width="100%" style="padding-bottom:5px;padding-top:25px;vertical-align:top;">
                            <table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                              <tr>
                                <td class="pad" style="width:100%;">
                                  <div class="alignment" align="center">
                                    <div style="max-width:197px;">
                                      <img src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/Logo_BCDB_-_Bg_White_mfxnej.png"
                                        style="display:block;height:auto;border:0;width:100%;" width="197" alt="BCDB" />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>

                            <div style="height:21px;line-height:21px;font-size:1px;">&#8202;</div>

                            <table class="heading_block block-3" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                              <tr>
                                <td class="pad" style="padding:10px;text-align:center;">
                                  <h3 style="margin:0;color:#fafafa;font-family:'Oswald',Arial,Helvetica,sans-serif;font-size:35px;font-weight:700;line-height:1.2;">
                                    ¡GRACIAS POR SER PARTE DE ESTA HISTORIA!
                                  </h3>
                                </td>
                              </tr>
                            </table>

                            <table class="heading_block block-4" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                              <tr>
                                <td class="pad">
                                  <h1 style="margin:0;color:#fafafa;font-family:'Oswald',Arial,Helvetica,sans-serif;font-size:100px;font-weight:700;letter-spacing:-2px;line-height:1.3;text-align:center;">
                                    CELEBRAMOS<br/>60 AÑOS
                                  </h1>
                                </td>
                              </tr>
                            </table>

                            <!-- (Opcional) Ticket ID / Evento si querés mostrarlo -->
                            <!-- <p style="color:#fafafa;text-align:center;font-family:Helvetica,Arial,sans-serif;margin:0;">Entrada: ${safeTicketId}</p> -->
                            <!-- <p style="color:#fafafa;text-align:center;font-family:Helvetica,Arial,sans-serif;margin:0;">${eventDescription}</p> -->

                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- BODY -->
            <table class="row row-2" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
                      style="background-color:#fafafa;color:#000000;width:700px;margin:0 auto;" width="700">
                      <tbody>
                        <tr>
                          <td class="column column-1" width="100%" style="vertical-align:top;">

                            <table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
                              <tr>
                                <td class="pad" style="width:100%;">
                                  <div class="alignment" align="center">
                                    <div style="max-width:700px;">
                                      <img src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511066/DSC08255_ndwf2n.webp"
                                        style="display:block;height:auto;width:100%;" width="700" alt="BCDB" />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </table>

                            <table class="paragraph_block block-2" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="word-break:break-word;">
                              <tr>
                                <td class="pad" style="padding:10px 60px;">
                                  <div style="color:#5a3b36;font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:1.2;text-align:center;">
                                    <p style="margin:0;">
                                      Estimado/a <strong>${safeName}</strong>, nos complace invitarte cordialmente a la velada especial del 60 aniversario de la Banda CEDES Don Bosco.
                                      <br /><br />
                                      La Banda CEDES Don Bosco cumple 60 años y queremos celebrarlo junto a quienes han sido parte esencial de este legado musical. Te extendemos una cordial invitación para acompañarnos en esta histórica velada.
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            </table>

                            <table class="button_block block-3" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                              <tr>
                                <td class="pad">
                                  <div class="alignment" align="center">
                                    <a href="${escapeHtml(confirmUrl)}" target="_blank"
                                      style="background:#ffc75e;border:1px solid #ffc75e;border-radius:60px;color:#5a3b36;display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:600;line-height:36px;padding:6px 22px;text-decoration:none;">
                                      CONFIRMAR ASISTENCIA
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            </table>

                            <div style="height:45px;line-height:45px;font-size:1px;">&#8202;</div>

                            <table class="heading_block block-5" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation">
                              <tr>
                                <td class="pad">
                                  <h2 style="margin:0;color:#293964;font-family:'Oswald',Arial,Helvetica,sans-serif;font-size:60px;font-weight:700;letter-spacing:-2px;line-height:1.2;text-align:center;">
                                    UNA NOCHE MEMORABLE
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

            <!-- INVITACIÓN + DETALLE -->
            <table class="row row-3" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
                      style="background-color:#fafafa;color:#000000;padding:25px;width:700px;margin:0 auto;" width="700">
                      <tbody>
                        <tr>
                          <td width="50%" style="vertical-align:middle;">
                            <img src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511066/DSC07357_sut03v.png"
                              style="display:block;width:100%;border-radius:12px;" alt="BCDB" />
                          </td>
                          <td width="10"></td>
                          <td width="50%" style="background:#e1e1e1;border-radius:12px;padding:15px;vertical-align:middle;">
                            <div style="text-align:center;">
                              <img src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/ICON2_dxqwae.png" width="77" alt="Ticket" style="display:block;margin:0 auto 10px auto;" />
                              <h3 style="margin:0;color:#293964;font-family:'Oswald',Arial,Helvetica,sans-serif;font-size:35px;font-weight:700;letter-spacing:-1px;line-height:1.2;">
                                INVITACIÓN ESPECIAL
                              </h3>
                              <p style="margin:10px 0 0 0;color:#5a3b36;font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:1.2;">
                                ${escapeHtml(invitationText)}
                              </p>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- QR -->
            <table class="row row-5" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
                      style="background-color:#ffffff;color:#000000;width:700px;margin:0 auto;" width="700">
                      <tbody>
                        <tr>
                          <td style="padding-top:35px;">
                            <h3 style="margin:0;color:#293964;font-family:'Oswald',Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;line-height:1.2;text-align:center;">
                              Al llegar al evento
                            </h3>
                            <h2 style="margin:10px 0 0 0;color:#293964;font-family:'Oswald',Arial,Helvetica,sans-serif;font-size:60px;font-weight:700;letter-spacing:-2px;line-height:1.2;text-align:center;">
                              PRESENTA ESTE QR
                            </h2>

                            <div style="padding:15px 0;text-align:center;">
                              <img alt="QR Code" src="cid:qrCode" style="display:block;height:auto;border:0;width:100%;max-width:700px;margin:0 auto;" />
                            </div>

                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- FOOTER -->
            <table class="row row-10" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
              <tbody>
                <tr>
                  <td>
                    <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation"
                      style="background-color:#293964;color:#000000;padding:25px 0;width:700px;margin:0 auto;" width="700">
                      <tbody>
                        <tr>
                          <td style="text-align:center;">
                            <img src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/Logo_BCDB_-_Bg_White_mfxnej.png" width="210" alt="BCDB" style="display:block;margin:0 auto 12px auto;" />

                            <div style="margin:10px 0;">
                              <a href="${escapeHtml(facebookUrl)}" target="_blank" style="display:inline-block;margin:0 10px;">
                                <img src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511064/facebook_n4yyp8.png" width="32" alt="Facebook" style="border:0;display:block;" />
                              </a>
                              <a href="${escapeHtml(instagramUrl)}" target="_blank" style="display:inline-block;margin:0 10px;">
                                <img src="https://res.cloudinary.com/dnhhbkmpf/image/upload/v1754511065/instagram_zxhfpb.png" width="32" alt="Instagram" style="border:0;display:block;" />
                              </a>
                            </div>

                            <p style="margin:0;color:#fafafa;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.2;">
                              San José, Costa Rica | © ${year} Banda CEDES Don Bosco
                            </p>
                            <p style="margin:8px 0 0 0;color:#fafafa;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.2;">
                              Todos los derechos reservados
                            </p>

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
  </body>
</html>
    `,
    attachments: qrCodeDataUrl
      ? [
          {
            filename: "entrada-cortesia.png",
            content: String(qrCodeDataUrl).split(",")[1],
            encoding: "base64",
            cid: "qrCode",
          },
        ]
      : [],
  };
};
