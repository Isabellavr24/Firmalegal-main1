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
            <div class="header-icon">✅</div>
            <h1>Documento Firmado</h1>
        </div>

        <!-- Content -->
        <div class="content">
            <p class="greeting">Hola <strong>${recipientName}</strong>,</p>

            <div style="text-align: center;">
                <span class="success-badge">✓ Firma Completada</span>
            </div>

            <p>Te informamos que tu documento ha sido firmado exitosamente.</p>

            <!-- Document Card -->
            <div class="document-card">
                <h3>📄 ${documentTitle}</h3>
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
                    <span class="value" style="color: #2e7d32;">✓ Firmado</span>
                </div>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center;">
                <a href="${documentUrl}" class="cta-button">
                    📥 Ver y Descargar Documento
                </a>
            </div>

            <!-- Info Box -->
            <div class="info-box">
                <h4>📋 El documento firmado incluye:</h4>
                <ul>
                    <li>Firma electrónica del firmante</li>
                    <li>Fecha y hora exacta de la firma</li>
                    <li>Información de verificación</li>
                    <li>Certificado de autenticidad</li>
                </ul>
            </div>

            <div class="divider"></div>

            <p style="color: #666; font-size: 14px;">
                <strong>💡 Recomendación:</strong> Descarga y guarda una copia del documento
                firmado para tus registros.
            </p>

            <p style="margin-top: 30px; color: #666;">
                Saludos,<br>
                <strong style="color: #2b0e31;">Equipo de FirmaLegal Online</strong>
            </p>
        </div>

        <!-- Footer -->
        <div class="footer">
            <p>Este correo fue enviado desde <strong>FirmaLegal Online</strong></p>
            <p>
                Sistema de firma electrónica profesional<br>
                <a href="${appUrl}">Visitar FirmaLegal Online</a>
            </p>
            <p style="margin-top: 15px; color: #bbb;">
                © ${new Date().getFullYear()} FirmaLegal Online. Todos los derechos reservados.
            </p>
        </div>
    </div>
</body>
</html>
    `.trim();
};
