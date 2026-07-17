/**
 * =============================================
 * CLIENTE DE SENDGRID
 * Módulo para enviar emails usando SendGrid API
 * =============================================
 */

const sgMail = require('@sendgrid/mail');

let _configured = false;

/**
 * Configurar SendGrid con API Key
 * @param {string} apiKey - SendGrid API Key
 */
function configureSendGrid(apiKey) {
    if (!apiKey) {
        throw new Error('SendGrid API Key no configurada. Verifica tu archivo .env');
    }

    sgMail.setApiKey(apiKey);
    _configured = true;
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
async function sendEmail({ to, from, fromName, subject, text, html, attachments }) {
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
        html,
        trackingSettings: {
            clickTracking: { enable: false, enableText: false },
            openTracking: { enable: false }
        }
    };
    if (attachments && attachments.length > 0) msg.attachments = attachments;

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Enviar múltiples emails uno por uno para detectar fallos individuales
 * @param {Array<Object>} emails - Array de emails a enviar
 * @returns {Promise<Object>} Resultado del envío
 */
async function sendBatchEmails(emails) {
    console.log(`\n📧 [SENDGRID] Enviando ${emails.length} emails en batch...`);

    const results = [];
    let successCount = 0;
    const failures = [];

    for (const email of emails) {
        // Validar formato de email antes de enviar
        if (!email.to || !EMAIL_REGEX.test(email.to)) {
            const msg = `Email inválido rechazado antes de enviar: "${email.to}"`;
            console.error(`❌ [SENDGRID] ${msg}`);
            failures.push({ to: email.to, error: msg });
            continue;
        }

        try {
            const msg = {
                to: email.to,
                from: { email: email.from, name: email.fromName },
                subject: email.subject,
                text: email.text,
                html: email.html,
                replyTo: email.replyTo || email.from,
                categories: email.categories || [],
                customArgs: email.customArgs || {},
                trackingSettings: {
                    clickTracking: { enable: false, enableText: false },
                    openTracking: { enable: false }
                }
            };

            const response = await sgMail.send(msg);
            const statusCode = response[0]?.statusCode;
            console.log(`✅ [SENDGRID] Email enviado a ${email.to} (status ${statusCode})`);
            successCount++;
            results.push({ to: email.to, success: true, statusCode });
        } catch (error) {
            const detail = error.response?.body?.errors?.[0]?.message || error.message;
            console.error(`❌ [SENDGRID] Error enviando a ${email.to}: ${detail}`);
            failures.push({ to: email.to, error: detail });
        }
    }

    if (failures.length > 0) {
        console.error(`⚠️ [SENDGRID] ${failures.length} email(s) fallaron:`);
        failures.forEach(f => console.error(`   - ${f.to}: ${f.error}`));
    }

    console.log(`✅ [SENDGRID] ${successCount}/${emails.length} emails enviados exitosamente`);

    return {
        success: failures.length === 0,
        count: successCount,
        failures,
        results
    };
}

/**
 * Verificar si SendGrid está configurado correctamente
 * @returns {boolean}
 */
function isConfigured() {
    return _configured;
}

module.exports = {
    configureSendGrid,
    sendEmail,
    sendBatchEmails,
    isConfigured
};
