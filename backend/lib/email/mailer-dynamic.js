/**
 * =============================================
 * MAILER DINÁMICO - POR USUARIO
 * Envío de emails usando la configuración del usuario desde DB
 * =============================================
 */

const sendgrid = require('./sendgrid');
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Enviar email usando configuración del usuario
 * @param {Object} userConfig - Configuración desde email_config table
 * @param {Object} emailData - Datos del email
 * @returns {Promise<Object>}
 */
async function sendEmailWithUserConfig(userConfig, { to, subject, text, html }) {
    if (!userConfig || !userConfig.sendgrid_api_key) {
        return {
            success: false,
            error: 'No hay configuración de email para este usuario'
        };
    }

    // Configurar SendGrid temporalmente con la API Key del usuario
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(userConfig.sendgrid_api_key);

    console.log(`\n📧 [MAILER-DYNAMIC] Enviando email con config del usuario ${userConfig.user_id}`);
    console.log(`   De: ${userConfig.email_from_name} <${userConfig.email_from}>`);
    console.log(`   Para: ${to}`);
    console.log(`   Asunto: ${subject}`);

    const msg = {
        to,
        from: {
            email: userConfig.email_from,
            name: userConfig.email_from_name || 'FirmaLegal Online'
        },
        subject,
        text,
        html
    };

    try {
        const response = await sgMail.send(msg);
        console.log('✅ [MAILER-DYNAMIC] Email enviado exitosamente');
        console.log(`   Message ID: ${response[0].headers['x-message-id']}`);

        return {
            success: true,
            messageId: response[0].headers['x-message-id'],
            statusCode: response[0].statusCode
        };
    } catch (error) {
        console.error('❌ [MAILER-DYNAMIC] Error al enviar email:', error);

        if (error.response) {
            console.error('   Status:', error.response.statusCode);
            console.error('   Body:', JSON.stringify(error.response.body, null, 2));
        }

        return {
            success: false,
            error: error.message,
            details: error.response?.body
        };
    }
}

/**
 * Enviar email de prueba con configuración del usuario
 * @param {Object} userConfig - Configuración del usuario
 * @param {string} to - Email de destino
 * @returns {Promise<Object>}
 */
async function sendTestEmailWithConfig(userConfig, to) {
    const subject = '✅ Prueba de Configuración - FirmaLegal Online';

    const text = `
¡Hola!

Este es un email de prueba de FirmaLegal Online.

Si recibes este mensaje, significa que tu configuración de SendGrid está funcionando correctamente.

Configuración actual:
- Remitente: ${userConfig.email_from_name} <${userConfig.email_from}>
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

            <p>Si recibes este mensaje, significa que tu configuración de SendGrid está funcionando correctamente.</p>

            <div class="info-box">
                <strong>Tu configuración:</strong><br>
                📧 Remitente: ${userConfig.email_from_name} &lt;${userConfig.email_from}&gt;<br>
                🌐 URL de la aplicación: ${APP_URL}<br>
                🔑 Proveedor: SendGrid
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

    return await sendEmailWithUserConfig(userConfig, { to, subject, text, html });
}

/**
 * Enviar solicitud de firma usando configuración del usuario
 * @param {Object} userConfig - Configuración del usuario
 * @param {Object} data - Datos para el email
 * @returns {Promise<Object>}
 */
async function sendSignatureRequestWithConfig(userConfig, { to, recipientName, documentTitle, senderName, documentId }) {
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
${userConfig.email_from_name || 'FirmaLegal Online'}
    `.trim();

    const html = require('./templates/signature-request')({
        recipientName,
        documentTitle,
        senderName,
        signatureUrl,
        appUrl: APP_URL
    });

    console.log(`\n📧 [MAILER-DYNAMIC] Enviando solicitud de firma a ${to}`);
    console.log(`   Documento: ${documentTitle}`);
    console.log(`   URL: ${signatureUrl}`);

    return await sendEmailWithUserConfig(userConfig, { to, subject, text, html });
}

/**
 * Enviar notificación de firma completada usando configuración del usuario
 * @param {Object} userConfig - Configuración del usuario
 * @param {Object} data - Datos para el email
 * @returns {Promise<Object>}
 */
async function sendSignatureCompletedWithConfig(userConfig, { to, recipientName, documentTitle, signerName, documentId }) {
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
${userConfig.email_from_name || 'FirmaLegal Online'}
    `.trim();

    const html = require('./templates/signature-completed')({
        recipientName,
        documentTitle,
        signerName,
        documentUrl,
        appUrl: APP_URL
    });

    console.log(`\n📧 [MAILER-DYNAMIC] Enviando notificación de firma completada a ${to}`);
    console.log(`   Documento: ${documentTitle}`);
    console.log(`   Firmante: ${signerName}`);

    return await sendEmailWithUserConfig(userConfig, { to, subject, text, html });
}

/**
 * Obtener configuración de email de un usuario
 * @param {Object} db - Conexión a la base de datos
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>}
 */
async function getUserEmailConfig(db, userId) {
    return new Promise((resolve, reject) => {
        db.query(
            'SELECT * FROM email_config WHERE user_id = ? AND is_active = TRUE',
            [userId],
            (err, results) => {
                if (err) reject(err);
                else resolve(results.length > 0 ? results[0] : null);
            }
        );
    });
}

module.exports = {
    sendEmailWithUserConfig,
    sendTestEmailWithConfig,
    sendSignatureRequestWithConfig,
    sendSignatureCompletedWithConfig,
    getUserEmailConfig
};
