/**
 * =============================================
 * TEMPLATE: VERIFICACIÓN DE CORREO ELECTRÓNICO
 * Email para confirmar el cambio de correo del usuario
 * =============================================
 */

module.exports = function emailVerificationTemplate({ recipientName, newEmail, verificationUrl, appUrl }) {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirma tu nuevo correo electrónico - FirmaLegal Online</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 30px 20px;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .header {
            background: #2b0e31;
            color: white;
            padding: 32px 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 22px;
            font-weight: 700;
        }
        .content {
            padding: 32px 30px;
            color: #333;
            font-size: 15px;
        }
        .info-card {
            background: #f8f9fa;
            border-left: 4px solid #2b0e31;
            padding: 16px 20px;
            border-radius: 6px;
            margin: 24px 0;
            font-size: 14px;
        }
        .btn {
            display: inline-block;
            background: #c41e56;
            color: white !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 15px;
            margin: 24px 0;
        }
        .btn-wrap {
            text-align: center;
        }
        .warning {
            background: #fff8e1;
            border-left: 4px solid #f0a500;
            padding: 14px 18px;
            border-radius: 6px;
            font-size: 13px;
            color: #555;
            margin: 20px 0;
        }
        .footer {
            background: #f9f9f9;
            padding: 20px 30px;
            text-align: center;
            color: #999;
            font-size: 12px;
            border-top: 1px solid #e0e0e0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Confirma tu nuevo correo electr&#243;nico</h1>
        </div>
        <div class="content">
            <p>Hola <strong>${recipientName}</strong>,</p>
            <p>Recibimos una solicitud para cambiar el correo electr&#243;nico de tu cuenta en <strong>FirmaLegal Online</strong>.</p>

            <div class="info-card">
                <strong>Nuevo correo electr&#243;nico:</strong><br>
                ${newEmail}
            </div>

            <p>Para confirmar el cambio, haz clic en el siguiente bot&#243;n. El enlace es v&#225;lido por <strong>24 horas</strong>.</p>

            <div class="btn-wrap">
                <a href="${verificationUrl}" class="btn">Confirmar cambio de correo</a>
            </div>

            <div class="warning">
                Si no solicitaste este cambio, ignora este mensaje. Tu correo actual seguir&#225; siendo el mismo y no se realizar&#225; ning&#250;n cambio.
            </div>

            <p style="color: #666; font-size: 13px; margin-top: 24px;">
                Si el bot&#243;n no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${verificationUrl}" style="color: #c41e56; word-break: break-all;">${verificationUrl}</a>
            </p>
        </div>
        <div class="footer">
            <p>PKI SERVICES S.A.S. &mdash; <a href="${appUrl}" style="color: #999;">FirmaLegal Online</a></p>
            <p>Este es un mensaje autom&#225;tico, por favor no respondas a este correo.</p>
        </div>
    </div>
</body>
</html>
    `.trim();
};
