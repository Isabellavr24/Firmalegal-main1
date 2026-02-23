/**
 * =============================================
 * TEMPLATE: FIRMA COMPLETADA
 * Email de notificación cuando un documento es firmado
 * =============================================
 */

module.exports = function signatureCompletedTemplate({ recipientName, documentTitle, signerName, documentUrl, appUrl }) {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Documento Firmado - ${documentTitle}</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .email-container {
            max-width: 600px;
            margin: 40px auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 26px;
            font-weight: 700;
        }
        .header-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 18px;
            color: #2b0e31;
            margin-bottom: 20px;
        }
        .success-badge {
            display: inline-block;
            background: #e8f5e9;
            color: #2e7d32;
            padding: 12px 24px;
            border-radius: 24px;
            font-weight: 600;
            font-size: 14px;
            margin: 20px 0;
        }
        .document-card {
            background: #f9f9f9;
            border-left: 4px solid #2e7d32;
            padding: 20px;
            margin: 25px 0;
            border-radius: 6px;
        }
        .document-card h3 {
            margin: 0 0 15px 0;
            color: #2b0e31;
            font-size: 18px;
        }
        .document-card .info-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 8px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .document-card .info-row:last-child {
            border-bottom: none;
        }
        .document-card .label {
            color: #666;
            font-size: 14px;
        }
        .document-card .value {
            color: #2b0e31;
            font-weight: 600;
            font-size: 14px;
        }
        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
            color: white !important;
            text-decoration: none;
            padding: 16px 40px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            margin: 25px 0;
            text-align: center;
            transition: transform 0.2s;
        }
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(46, 125, 50, 0.3);
        }
        .info-box {
            background: #fff3e0;
            border-left: 4px solid #f57c00;
            padding: 20px;
            margin: 25px 0;
            border-radius: 6px;
        }
        .info-box h4 {
            margin: 0 0 10px 0;
            color: #e65100;
            font-size: 16px;
        }
        .info-box ul {
            margin: 10px 0 0 0;
            padding-left: 20px;
        }
        .info-box li {
            margin: 8px 0;
            color: #f57c00;
        }
        .footer {
            background: #f9f9f9;
            padding: 30px;
            text-align: center;
            color: #999;
            font-size: 13px;
            border-top: 1px solid #e0e0e0;
        }
        .footer a {
            color: #2e7d32;
            text-decoration: none;
        }
        .divider {
            height: 1px;
            background: #e0e0e0;
            margin: 30px 0;
        }
        @media only screen and (max-width: 600px) {
            .email-container {
                margin: 0;
                border-radius: 0;
            }
            .content {
                padding: 30px 20px;
            }
            .header {
                padding: 30px 20px;
            }
            .document-card .info-row {
                flex-direction: column;
            }
            .document-card .value {
                margin-top: 5px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <div class="header-icon"><span style="display:inline-block;width:48px;height:48px;background:rgba(255,255,255,0.2);color:white;border-radius:50%;text-align:center;line-height:48px;font-size:28px;font-weight:bold;">&#10003;</span></div>
            <h1>Documento Firmado</h1>
        </div>

        <!-- Content -->
        <div class="content">
            <p class="greeting">Hola <strong>${recipientName}</strong>,</p>

            <div style="text-align: center;">
                <span class="success-badge">&#10003; Firma Completada</span>
            </div>

            <p>Te informamos que tu documento ha sido firmado exitosamente.</p>

            <!-- Document Card -->
            <div class="document-card">
                <h3>${documentTitle}</h3>
                <div class="info-row">
                    <span class="label">Firmado por:</span>
                    <span class="value">${signerName}</span>
                </div>
                <div class="info-row">
                    <span class="label">Fecha:</span>
                    <span class="value">${new Date().toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}</span>
                </div>
                <div class="info-row">
                    <span class="label">Estado:</span>
                    <span class="value" style="color: #2e7d32;">&#10003; Firmado</span>
                </div>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center;">
                <a href="${documentUrl}" class="cta-button">
                    Ver y Descargar Documento
                </a>
            </div>

            <!-- Info Box -->
            <div class="info-box">
                <h4>El documento firmado incluye:</h4>
                <ul>
                    <li>Firma electrónica del firmante</li>
                    <li>Fecha y hora exacta de la firma</li>
                    <li>Información de verificación</li>
                    <li>Certificado de autenticidad</li>
                </ul>
            </div>

            <div class="divider"></div>

            <p style="color: #666; font-size: 14px;">
                <strong>Recomendaci&#243;n:</strong> Descarga y guarda una copia del documento firmado para tus registros.
            </p>

            <p style="margin-top: 30px; color: #666;">
                Saludos,<br>
                <strong style="color: #2b0e31;">Isabella Vergara<br>
                <a href="mailto:firmalegalonline@pkiservices.co" style="color: #2b0e31; text-decoration: none;">&#128231; Firmalegalonline@pkiservices.co</a></strong>
            </p>

            <!-- Sección Legal -->
            <div style="background: #f8f9fa; padding: 25px; margin: 30px 0; border-radius: 8px; border-top: 3px solid #2b0e31;">
                <h4 style="color: #2b0e31; font-size: 14px; margin: 0 0 12px; font-weight: 700;">LA FIRMA ELECTR&#211;NICA</h4>
                <p style="font-size: 12px; color: #6c757d; margin: 10px 0; line-height: 1.6;">
                    Deber&#225; entenderse como un acuerdo de voluntades contenidas en un documento electr&#243;nico o mensaje de datos, y aceptaci&#243;n previa de verificaci&#243;n que deber&#225; hacerse con una contrase&#241;a, c&#243;digo o dato biom&#233;trico que permita la validaci&#243;n de identidad del firmante.
                    <em>"Art&#237;culo 3&#186; Cumplimiento del Requisito de Firma. Cuando se exija la firma de una persona, ese requisito quedar&#225; cumplido en relaci&#243;n con un mensaje de datos si se utiliza una firma electr&#243;nica que, a la luz de todas las circunstancias del caso, incluido cualquier acuerdo aplicable, sea tan confiable como apropiada para los fines con los cuales se gener&#243; o comunic&#243; ese mensaje."</em>
                </p>

                <h4 style="color: #2b0e31; font-size: 14px; margin: 20px 0 12px; font-weight: 700;">&#128220; MARCO LEGAL</h4>
                <p style="font-size: 12px; color: #6c757d; margin: 10px 0; line-height: 1.6;">
                    El Decreto 2364 de 2012, que reglamenta el art&#237;culo 7 de la Ley 527 de 1999, define la firma electr&#243;nica como aquel m&#233;todo implementado para identificar a una persona y su voluntad para un fin espec&#237;fico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un contrato, documento o mensaje electr&#243;nico. Para que la firma electr&#243;nica genere efectos legales, deber&#225; cumplir los mismos requisitos que tiene cualquier contrato f&#237;sico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen id&#233;nticos efectos.
                </p>

                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong style="color: #2b0e31;">&#9878;&#65039; CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE</strong><br>
                    PKI SERVICES S.A.S. debe dar cumplimiento al art&#237;culo 83 de la constituci&#243;n pol&#237;tica colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades p&#250;blicas deber&#225;n ce&#241;irse a los postulados de buena fe, la cual se presumir&#225; en todas las gestiones que aqu&#233;llos adelanten ante &#233;stas."
                </p>

                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong style="color: #2b0e31;">&#9888;&#65039; FALSEDAD EN DOCUMENTO PRIVADO</strong><br>
                    Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, por la cual se expide el C&#243;digo Penal. Art&#237;culo 289. Falsedad en documento privado: "El que falsifique documento privado que pueda servir de prueba, incurrir&#225;, si lo usa, en prisi&#243;n de uno (1) a seis (6) a&#241;os."
                </p>

                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong style="color: #2b0e31;">&#169; DERECHOS DE AUTOR</strong><br>
                    Todo el contenido de los correos, comunicaciones y funcionalidad de las plataformas ofrecidas por PKI SERVICES, son de su propiedad de &#233;sta, de conformidad a lo dispuesto en el art&#237;culo 539 del C&#243;digo de Comercio, as&#237; como en el art&#237;culo 20 y concordantes de la Ley 23 de 1982.
                </p>

                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong style="color: #2b0e31;">&#127963;&#65039; ACREDITACI&#211;N ONAC</strong><br>
                    PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACI&#211;N DE COLOMBIA (ONAC).
                    Para cualquier duda o inquietud, puede ponerse en contacto con nuestro servicio de atenci&#243;n al cliente en:
                    <a href="https://pkiservices.co/soporte/?wpsc-section=ticket-list" style="color: #2b0e31; font-weight: 600;">&#128279; Soporte PKI Services</a>
                </p>
            </div>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p><strong>PKI SERVICES S.A.S.</strong></p>
            <p>Plataforma de Firma Electr&#243;nica Certificada</p>
            <p style="font-size: 11px; color: #ADB5BD; margin-top: 15px; line-height: 1.5;">
                Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener informaci&#243;n confidencial sometida a secreto profesional. No est&#225; permitida su reproducci&#243;n o distribuci&#243;n sin la autorizaci&#243;n expresa. Si usted no es el destinatario final por favor elim&#237;nelo e inf&#243;rmenos por este mismo medio.
            </p>
            <p style="font-size: 11px; color: #ADB5BD; margin-top: 12px; line-height: 1.5;">
                De acuerdo con la Ley Estatutaria 1581 de 2012 de Protecci&#243;n de Datos y normas concordantes, le informamos que nuestra entidad cuenta con pol&#237;tica para el tratamiento de los datos personales almacenados en sus bases de datos.
            </p>
            <p style="margin-top: 15px; color: #bbb; font-size: 12px;">
                &#169; ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados
            </p>
        </div>
    </div>
</body>
</html>
    `.trim();
};
