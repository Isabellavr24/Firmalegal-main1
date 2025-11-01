/**
 * =============================================
 * CLIENTE DE SENDGRID
 * Módulo para enviar emails usando SendGrid API
 * =============================================
 */

const sgMail = require('@sendgrid/mail');

/**
 * Configurar SendGrid con API Key
 * @param {string} apiKey - SendGrid API Key
 */
function configureSendGrid(apiKey) {
    if (!apiKey) {
        throw new Error('SendGrid API Key no configurada. Verifica tu archivo .env');
    }

    sgMail.setApiKey(apiKey);
    console.log('✅ SendGrid configurado correctamente');
}

/**
 * Enviar un email usando SendGrid
 * @param {Object} emailData - Datos del email
 * @param {string} emailData.to - Email del destinatario
 * @param {string} emailData.from - Email del remitente
 * @param {string} emailData.fromName - Nombre del remitente
 * @param {string} emailData.subject - Asunto del email
 * @param {string} emailData.text - Contenido en texto plano
 * @param {string} emailData.html - Contenido en HTML
 * @returns {Promise<Object>} Respuesta de SendGrid
 */
async function sendEmail({ to, from, fromName, subject, text, html }) {
    console.log('\n📧 [SENDGRID] Preparando envío de email...');
    console.log(`   Para: ${to}`);
    console.log(`   De: ${fromName} <${from}>`);
    console.log(`   Asunto: ${subject}`);

    const msg = {
        to,
        from: {
            email: from,
            name: fromName
        },
        subject,
        text,
        html
    };

    try {
        const response = await sgMail.send(msg);
        console.log('✅ [SENDGRID] Email enviado exitosamente');
        console.log(`   Message ID: ${response[0].headers['x-message-id']}`);
        console.log(`   Status Code: ${response[0].statusCode}`);

        return {
            success: true,
            messageId: response[0].headers['x-message-id'],
            statusCode: response[0].statusCode
        };
    } catch (error) {
        console.error('❌ [SENDGRID] Error al enviar email:', error);

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
 * Enviar múltiples emails (batch)
 * @param {Array<Object>} emails - Array de emails a enviar
 * @returns {Promise<Object>} Resultado del envío
 */
async function sendBatchEmails(emails) {
    console.log(`\n📧 [SENDGRID] Enviando ${emails.length} emails en batch...`);

    try {
        const messages = emails.map(email => ({
            to: email.to,
            from: {
                email: email.from,
                name: email.fromName
            },
            subject: email.subject,
            text: email.text,
            html: email.html
        }));

        const response = await sgMail.send(messages);
        console.log(`✅ [SENDGRID] ${emails.length} emails enviados exitosamente`);

        return {
            success: true,
            count: emails.length,
            responses: response
        };
    } catch (error) {
        console.error('❌ [SENDGRID] Error al enviar batch de emails:', error);

        return {
            success: false,
            error: error.message,
            details: error.response?.body
        };
    }
}

/**
 * Verificar si SendGrid está configurado correctamente
 * @returns {boolean}
 */
function isConfigured() {
    try {
        return sgMail.apiKey !== null && sgMail.apiKey !== undefined;
    } catch {
        return false;
    }
}

module.exports = {
    configureSendGrid,
    sendEmail,
    sendBatchEmails,
    isConfigured
};
