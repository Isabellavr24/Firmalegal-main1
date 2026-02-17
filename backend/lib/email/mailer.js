/**
 * =============================================
 * MAILER - INTERFAZ UNIFICADA DE EMAILS
 * Abstracción para envío de emails (SendGrid, SMTP, etc.)
 * =============================================
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sendgrid = require('./sendgrid');

// Configurar SendGrid al cargar el módulo
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'firmalegalonline@pkiservices.co';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'FirmaLegal Online';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Inicializar SendGrid
if (SENDGRID_API_KEY && SENDGRID_API_KEY !== 'SG.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX') {
    try {
        sendgrid.configureSendGrid(SENDGRID_API_KEY);
        console.log('✅ [MAILER] SendGrid inicializado');
    } catch (error) {
        console.error('❌ [MAILER] Error al inicializar SendGrid:', error.message);
    }
} else {
    console.warn('⚠️ [MAILER] SendGrid API Key no configurada. Los emails no se enviarán.');
    console.warn('   Configura SENDGRID_API_KEY en el archivo backend/.env');
}

/**
 * Enviar email genérico
 * @param {Object} options - Opciones del email
 * @param {string} options.to - Email destinatario
 * @param {string} options.subject - Asunto
 * @param {string} options.text - Texto plano
 * @param {string} options.html - HTML del email
 * @returns {Promise<Object>}
 */
async function sendEmail({ to, subject, text, html }) {
    if (!sendgrid.isConfigured()) {
        console.warn('⚠️ [MAILER] SendGrid no configurado. Email no enviado.');
        return {
            success: false,
            error: 'SendGrid no configurado. Configura SENDGRID_API_KEY en .env'
        };
    }

    return await sendgrid.sendEmail({
        to,
        from: EMAIL_FROM,
        fromName: EMAIL_FROM_NAME,
        subject,
        text,
        html
    });
}

/**
 * Enviar solicitud de firma de documento
 * @param {Object} data - Datos para el email
 * @param {string} data.to - Email del firmante
 * @param {string} data.recipientName - Nombre del firmante
 * @param {string} data.documentTitle - Título del documento
 * @param {string} data.senderName - Nombre de quien envía
 * @param {number} data.documentId - ID del documento
 * @returns {Promise<Object>}
 */
async function sendSignatureRequest({ to, recipientName, documentTitle, senderName, documentId }) {
    const signatureUrl = `${APP_URL}/sign.html?document_id=${documentId}`;

    const subject = `📝 Solicitud de firma: ${documentTitle}`;

    const text = `
Hola ${recipientName},

${senderName} te ha enviado un documento para tu firma electrónica.

Documento: ${documentTitle}

Para revisar y firmar el documento, por favor accede al siguiente enlace:
${signatureUrl}

Este enlace te llevará a una página segura donde podrás:
- Revisar el contenido del documento
- Firmar electrónicamente
- Descargar una copia firmada

Si tienes alguna pregunta, contacta directamente con ${senderName}.

Saludos,
Equipo de FirmaLegal Online
    `.trim();

    const html = require('./templates/signature-request')({
        recipientName,
        documentTitle,
        senderName,
        signatureUrl,
        appUrl: APP_URL
    });

    console.log(`\n📧 [MAILER] Enviando solicitud de firma a ${to}`);
    console.log(`   Documento: ${documentTitle}`);
    console.log(`   URL: ${signatureUrl}`);

    return await sendEmail({ to, subject, text, html });
}

/**
 * Enviar notificación de documento firmado
 * @param {Object} data - Datos para el email
 * @param {string} data.to - Email del propietario del documento
 * @param {string} data.recipientName - Nombre del propietario
 * @param {string} data.documentTitle - Título del documento
 * @param {string} data.signerName - Nombre de quien firmó
 * @param {number} data.documentId - ID del documento
 * @returns {Promise<Object>}
 */
async function sendSignatureCompleted({ to, recipientName, documentTitle, signerName, documentId }) {
    const documentUrl = `${APP_URL}/tracking.html?document_id=${documentId}`;

    const subject = `✅ Documento firmado: ${documentTitle}`;

    const text = `
Hola ${recipientName},

Te informamos que ${signerName} ha firmado el documento "${documentTitle}".

Puedes ver el documento firmado y descargarlo desde:
${documentUrl}

El documento firmado incluye:
- Firma electrónica del firmante
- Fecha y hora de la firma
- Información de verificación

Saludos,
Equipo de FirmaLegal Online
    `.trim();

    const html = require('./templates/signature-completed')({
        recipientName,
        documentTitle,
        signerName,
        documentUrl,
        appUrl: APP_URL
    });

    console.log(`\n📧 [MAILER] Enviando notificación de firma completada a ${to}`);
    console.log(`   Documento: ${documentTitle}`);
    console.log(`   Firmante: ${signerName}`);

    return await sendEmail({ to, subject, text, html });
}

/**
 * Enviar email de prueba
 * @param {string} to - Email de destino
 * @returns {Promise<Object>}
 */
async function sendTestEmail(to) {
    const subject = '✅ Prueba de Configuración - FirmaLegal Online';

    const text = `
¡Hola!

Este es un email de prueba de FirmaLegal Online.

Si recibes este mensaje, significa que la configuración de SendGrid está funcionando correctamente.

Configuración actual:
- Remitente: ${EMAIL_FROM_NAME} <${EMAIL_FROM}>
- URL de la aplicación: ${APP_URL}

¡Todo listo para enviar notificaciones de firma!

Saludos,
Equipo de FirmaLegal Online
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #c41e56 0%, #2b0e31 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
        .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }
        .badge { display: inline-block; padding: 8px 16px; background: #e8f5e9; color: #2e7d32; border-radius: 20px; font-weight: 600; margin: 20px 0; }
        .info-box { background: #f5f5f5; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .info-box strong { color: #c41e56; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 24px;">🎉 ¡Configuración Exitosa!</h1>
        </div>
        <div class="content">
            <p>¡Hola!</p>

            <div class="badge">✅ SendGrid Configurado</div>

            <p>Este es un email de prueba de <strong>FirmaLegal Online</strong>.</p>

            <p>Si recibes este mensaje, significa que la configuración de SendGrid está funcionando correctamente.</p>

            <div class="info-box">
                <strong>Configuración actual:</strong><br>
                📧 Remitente: ${EMAIL_FROM_NAME} &lt;${EMAIL_FROM}&gt;<br>
                🌐 URL de la aplicación: ${APP_URL}
            </div>

            <p>¡Todo listo para enviar notificaciones de firma!</p>

            <p style="margin-top: 30px;">Saludos,<br><strong>Equipo de FirmaLegal Online</strong></p>
        </div>
        <div class="footer">
            Este es un email automático de prueba de FirmaLegal Online
        </div>
    </div>
</body>
</html>
    `.trim();

    console.log(`\n📧 [MAILER] Enviando email de prueba a ${to}`);

    return await sendEmail({ to, subject, text, html });
}

/**
 * Verificar si el mailer está configurado correctamente
 * @returns {Object}
 */
function getStatus() {
    return {
        configured: sendgrid.isConfigured(),
        apiKey: SENDGRID_API_KEY ? `${SENDGRID_API_KEY.substring(0, 10)}...` : 'No configurada',
        from: EMAIL_FROM,
        fromName: EMAIL_FROM_NAME,
        appUrl: APP_URL
    };
}

module.exports = {
    sendEmail,
    sendSignatureRequest,
    sendSignatureCompleted,
    sendTestEmail,
    getStatus,
    EMAIL_FROM,
    EMAIL_FROM_NAME,
    APP_URL
};
