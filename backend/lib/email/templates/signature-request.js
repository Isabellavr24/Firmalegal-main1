module.exports = function signatureRequestTemplate({ recipientName, documentTitle, senderName, signatureUrl, appUrl }) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solicitud de Firma</title>
    <style>
        body { font-family: Arial, sans-serif; background: #F8F9FA; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
        .header { background: #2a0d31; color: white; padding: 48px 40px; text-align: center; }
        .header h1 { margin: 16px 0 0; font-size: 32px; font-weight: 800; }
        .content { padding: 48px 40px; }
        .document-card { background: #F8F9FA; border: 2px solid #E9ECEF; border-radius: 12px; padding: 28px; margin: 32px 0; text-align: center; }
        .document-card h3 { margin: 0 0 12px; color: #2a0d31; font-size: 20px; }
        .btn-sign { display: inline-block; background: #2a0d31 !important; color: #FFFFFF !important; padding: 16px 48px; text-decoration: none !important; border-radius: 999px; font-weight: 700; font-size: 16px; letter-spacing: 0.3px; }
        a[class="btn-sign"] { color: #FFFFFF !important; }
        .footer { background: #F8F9FA; padding: 40px; text-align: center; border-top: 1px solid #E9ECEF; color: #6C757D; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div style="font-size: 56px;">📝</div>
            <h1>Solicitud de Firma</h1>
        </div>
        <div class="content">
            <p>Hola <strong>${recipientName || 'Usuario'}</strong>,</p>
            <p><strong>${senderName || 'Un usuario'}</strong> te ha solicitado que revises y firmes el siguiente documento:</p>
            <div class="document-card">
                <div style="font-size: 40px; margin-bottom: 16px;">📄</div>
                <h3>${documentTitle || 'Documento'}</h3>
            </div>
            <div style="text-align: center; margin: 36px 0;">
                <a href="${signatureUrl}" class="btn-sign" style="display: inline-block; background: #2a0d31; color: #FFFFFF; padding: 16px 48px; text-decoration: none; border-radius: 999px; font-weight: 700; font-size: 16px; letter-spacing: 0.3px;">✍️ Revisar y Firmar</a>
            </div>
            <p style="color: #6C757D; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E9ECEF;">
                Si tienes preguntas, contáctanos respondiendo a este correo.
            </p>
        </div>
        <div class="footer">
            <p><strong style="color: #2a0d31;">FirmaLegal Online</strong></p>
            <p style="font-size: 13px; color: #ADB5BD;">© ${new Date().getFullYear()} FirmaLegal Online.</p>
        </div>
    </div>
</body>
</html>`;
};
