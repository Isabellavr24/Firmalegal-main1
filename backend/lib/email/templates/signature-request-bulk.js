module.exports = function signatureRequestBulkTemplate({ recipientName, documentTitle, senderName, signatureUrl, appUrl }) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solicitud de Firma Electrónica</title>
    <style>
        body { font-family: Arial, sans-serif; background: #F8F9FA; margin: 0; padding: 40px 20px; line-height: 1.6; }
        .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
        .header { background: #2a0d31; color: white; padding: 40px 40px; text-align: center; }
        .header h1 { margin: 16px 0 0; font-size: 28px; font-weight: 800; }
        .content { padding: 40px 40px; }
        .greeting { font-size: 16px; margin-bottom: 20px; }
        .success-message { background: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 25px 0; border-radius: 6px; color: #155724; }
        .document-card { background: #F8F9FA; border: 2px solid #E9ECEF; border-radius: 12px; padding: 24px; margin: 25px 0; text-align: center; }
        .document-card h3 { margin: 0 0 8px; color: #2a0d31; font-size: 18px; }
        .instructions-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 25px 0; border-radius: 6px; }
        .instructions-box h4 { margin: 0 0 15px; color: #856404; font-size: 16px; font-weight: 700; }
        .options-list { margin: 15px 0; padding-left: 0; list-style: none; }
        .options-list li { padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
        .options-list li:last-child { border-bottom: none; }
        .options-list strong { color: #2a0d31; display: block; margin-bottom: 4px; }
        .btn-sign { display: inline-block; background: #2a0d31 !important; color: #FFFFFF !important; padding: 18px 48px; text-decoration: none !important; border-radius: 999px; font-weight: 700; font-size: 16px; letter-spacing: 0.3px; margin: 20px 0; }
        a[class="btn-sign"] { color: #FFFFFF !important; }
        .help-text { background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 25px 0; color: #004085; font-size: 14px; }
        .signature-section { background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .signature-section p { margin: 8px 0; font-size: 14px; color: #495057; }
        .legal-section { background: #f8f9fa; padding: 25px; margin: 30px 0; border-radius: 8px; border-top: 3px solid #2a0d31; }
        .legal-section h4 { color: #2a0d31; font-size: 15px; margin: 0 0 12px; font-weight: 700; }
        .legal-section p { font-size: 12px; color: #6c757d; margin: 10px 0; line-height: 1.6; }
        .footer { background: #2a0d31; color: white; padding: 30px; text-align: center; }
        .footer p { margin: 8px 0; font-size: 13px; }
        .disclaimer { font-size: 11px; color: #ADB5BD; margin-top: 15px; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div style="font-size: 48px;">\u{1F4DD}</div>
            <h1>Firma Electr\u00F3nica - PKI Services</h1>
        </div>

        <div class="content">
            <p class="greeting"><strong>Estimado cliente,</strong></p>

            <div class="success-message">
                <strong>\u00A1Buenas noticias!</strong> Ya est\u00E1 listo el documento para tu firma digital. Es un proceso f\u00E1cil y seguro que consta de dos partes:
                <br><br>
                \u2705 <strong>Ya realizaste la validaci\u00F3n de identidad biom\u00E9trica de manera exitosa.</strong>
            </div>

            <p style="font-size: 16px; margin: 25px 0;">
                <strong>Ahora debes proceder con la firma del documento.</strong>
            </p>

            <div class="document-card">
                <div style="font-size: 36px; margin-bottom: 12px;">\u{1F4C4}</div>
                <h3>Documento a firmar:</h3>
                <p style="font-size: 18px; font-weight: 600; color: #2a0d31; margin: 8px 0;">${documentTitle || 'Documento'}</p>
            </div>

            <div class="instructions-box">
                <h4>\u26A0\uFE0F ANTES DE HACER CLIC EN EL ENLACE, POR FAVOR TEN EN CUENTA LO SIGUIENTE:</h4>
                <p style="margin: 12px 0 15px; color: #856404;">
                    Al ingresar al sistema de firma digital, deber\u00E1s buscar el recuadro designado para la firma. All\u00ED podr\u00E1s elegir entre <strong>tres opciones</strong> para completarla:
                </p>
                <ul class="options-list">
                    <li>
                        <strong>1. Firma tecleada:</strong>
                        <span>Escribe tu nombre completo y se generar\u00E1 autom\u00E1ticamente una firma en estilo tipogr\u00E1fico.</span>
                    </li>
                    <li>
                        <strong>2. Firma manuscrita (gr\u00E1fica):</strong>
                        <span>Dibuja tu firma directamente en el recuadro usando el cursor o una pantalla t\u00E1ctil.</span>
                    </li>
                    <li>
                        <strong>3. Cargar imagen de tu firma:</strong>
                        <span>Si ya tienes tu firma escaneada, puedes subirla en formato JPG o PNG.</span>
                    </li>
                </ul>
            </div>

            <div style="text-align: center; margin: 35px 0;">
                <p style="margin-bottom: 15px; font-size: 15px; color: #495057;">
                    Ahora debes firmar el documento haciendo clic en este enlace:
                </p>
                <a href="${signatureUrl}" class="btn-sign" style="display: inline-block; background: #2a0d31; color: #FFFFFF; padding: 18px 48px; text-decoration: none; border-radius: 999px; font-weight: 700; font-size: 16px; letter-spacing: 0.3px;">
                    \u270D\uFE0F Firmar Documento Ahora
                </a>
            </div>

            <div class="help-text">
                <strong>\u{1F4AC} \u00BFNecesitas ayuda?</strong><br>
                Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos. Estamos aqu\u00ED para ayudarte en lo que necesites.
            </div>

            <div class="signature-section">
                <p style="margin-bottom: 5px;"><strong>\u00A1Que tengas un buen d\u00EDa!</strong></p>
                <p style="margin: 15px 0 5px;"><strong>Atentamente,</strong></p>
                <p style="margin: 5px 0;"><strong>Isabella Vergara</strong></p>
                <p style="margin: 5px 0;">
                    <a href="mailto:Firmalegalonline@pkiservices.co" style="color: #2a0d31; text-decoration: none;">
                        \u{1F4E7} Firmalegalonline@pkiservices.co
                    </a>
                </p>
            </div>

            <div class="legal-section">
                <h4>\u{1F4DC} MARCO LEGAL</h4>
                <p>
                    El Decreto 2364 de 2012, que reglamenta el art\u00EDculo 7 de la Ley 527 de 1999, define la firma electr\u00F3nica como aquel m\u00E9todo implementado para identificar a una persona y su voluntad para un fin espec\u00EDfico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un documento.
                </p>
                <p>
                    Para que la firma electr\u00F3nica genere efectos legales, deber\u00E1 cumplir los mismos requisitos que tiene cualquier documento f\u00EDsico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen id\u00E9nticos efectos.
                </p>
                <p style="margin-top: 20px;">
                    <strong>\u2696\uFE0F CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE</strong><br>
                    PKI SERVICES S.A.S. debe dar cumplimiento al art\u00EDculo 83 de la constituci\u00F3n pol\u00EDtica colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades p\u00FAblicas deber\u00E1n ce\u00F1irse a los postulados de buena fe, la cual se presumir\u00E1 en todas las gestiones que aqu\u00E9llos adelanten ante \u00E9stas."
                </p>
                <p style="margin-top: 20px;">
                    <strong>\u26A0\uFE0F FALSEDAD EN DOCUMENTO PRIVADO</strong><br>
                    Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, Art\u00EDculo 289: "El que falsifique documento privado que pueda servir de prueba, incurrir\u00E1, si lo usa, en prisi\u00F3n de uno (1) a seis (6) a\u00F1os."
                </p>
                <p style="margin-top: 20px;">
                    <strong>\u{1F3DB}\uFE0F ACREDITACI\u00D3N ONAC</strong><br>
                    PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACI\u00D3N DE COLOMBIA (ONAC).
                </p>
                <p>
                    Para cualquier duda o inquietud sobre la plataforma de Firma, puede ponerse en contacto con nuestro servicio de atenci\u00F3n al cliente en:
                    <br>
                    <a href="https://pkiservices.co/soporte/?wpsc-section=ticket-list" style="color: #2a0d31; font-weight: 600;">
                        \u{1F517} Soporte PKI Services
                    </a>
                </p>
            </div>
        </div>

        <div class="footer">
            <p style="font-weight: 700; font-size: 15px;">PKI SERVICES S.A.S.</p>
            <p>Plataforma de Firma Electr\u00F3nica Certificada</p>
            <p class="disclaimer">
                Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener informaci\u00F3n confidencial sometida a secreto profesional. No est\u00E1 permitida su reproducci\u00F3n o distribuci\u00F3n sin la autorizaci\u00F3n expresa. Si usted no es el destinatario final por favor elim\u00EDnelo e inf\u00F3rmenos por este mismo medio.
            </p>
            <p class="disclaimer" style="margin-top: 12px;">
                De acuerdo con la Ley Estatutaria 1581 de 2012 de Protecci\u00F3n de Datos y normas concordantes, le informamos que nuestra entidad cuenta con pol\u00EDtica para el tratamiento de los datos personales almacenados en sus bases de datos.
            </p>
            <p style="margin-top: 15px; font-size: 12px; opacity: 0.8;">
                \u00A9 ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados
            </p>
        </div>
    </div>
</body>
</html>`;
};
