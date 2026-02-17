/**
 * ==============================================
 * WORKER DE EMAILS PARA ENVÍO MASIVO
 * Procesa la cola de emails de forma asíncrona
 * ==============================================
 */

// Cargar .env desde la raíz del proyecto (dos niveles arriba: backend/workers -> backend -> raíz)
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const Queue = require('bull');
const mysql = require('mysql2');
const signatureRequestBulkTemplate = require('../lib/email/templates/signature-request-bulk');

// =============================================
// CONFIGURACIÓN
// =============================================

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Conexión a MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'firmalegalonline',
    authPlugins: {
        mysql_native_password: () => () => require('mysql2/lib/auth_plugins').mysql_native_password
    }
});

db.connect(err => {
    if (err) {
        console.error('🔴 [EMAIL-WORKER] Error al conectar a MySQL:', err);
        process.exit(1);
    }
    console.log('🟢 [EMAIL-WORKER] Conectado a MySQL');
});

// Cola de Bull
const emailQueue = new Queue('bulk-emails', {
    redis: {
        host: REDIS_HOST,
        port: REDIS_PORT
    }
});

console.log('🟢 [EMAIL-WORKER] Conectado a Redis');
console.log(`📧 [EMAIL-WORKER] Email Worker iniciado y esperando trabajos...`);

// =============================================
// PROCESAMIENTO DE TRABAJOS
// =============================================

emailQueue.process(async (job) => {
    const { recipientId, email, name, token, signatureDocumentId, documentTitle, userId } = job.data;

    console.log(`\n📧 [EMAIL-WORKER] Procesando email para: ${email}`);
    console.log(`   Nombre: ${name}`);
    console.log(`   Documento: ${documentTitle}`);

    try {
        // 1. Obtener datos del usuario que envía (para personalizar el email)
        const [senderResults] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT first_name, last_name, email FROM users WHERE user_id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (senderResults.length === 0) {
            throw new Error('Usuario emisor no encontrado');
        }

        const sender = senderResults[0];
        const senderName = `${sender.first_name} ${sender.last_name}`;

        // 2. Generar URL de firma con token
        const signatureUrl = `${APP_URL}/public-sign.html?token=${token}`;

        console.log(`   URL de firma: ${signatureUrl}`);

        // 3. Obtener configuración de email del usuario
        const [emailConfigResults] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM email_config WHERE user_id = ? AND is_active = TRUE LIMIT 1',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (emailConfigResults.length === 0) {
            throw new Error('Usuario no tiene configuración de email');
        }

        const emailConfig = emailConfigResults[0];

        // 4. Generar contenido del email usando la plantilla personalizada para envío masivo
        const htmlContent = signatureRequestBulkTemplate({
            recipientName: name,
            documentTitle: documentTitle,
            senderName: senderName,
            signatureUrl: signatureUrl,
            appUrl: APP_URL
        });

        // Texto plano (muy importante para evitar spam) - coincide con template HTML
        const plainText = `
Estimado cliente,

¡Buenas noticias! Ya está listo el documento para tu firma digital. Es un proceso fácil y seguro que consta de dos partes:

[OK] Ya realizaste la validación de identidad biométrica de manera exitosa.

Ahora debes proceder con la firma del documento.

DOCUMENTO A FIRMAR: ${documentTitle}

ANTES DE HACER CLIC EN EL ENLACE, POR FAVOR TEN EN CUENTA LO SIGUIENTE:

Al ingresar al sistema de firma digital, deberás buscar el recuadro designado para la firma. Allí podrás elegir entre TRES OPCIONES para completarla:

1. Firma tecleada:
   Escribe tu nombre completo y se generará automáticamente una firma en estilo tipográfico.

2. Firma manuscrita (gráfica):
   Dibuja tu firma directamente en el recuadro usando el cursor o una pantalla táctil.

3. Cargar imagen de tu firma:
   Si ya tienes tu firma escaneada, puedes subirla en formato JPG o PNG.

ENLACE PARA FIRMAR EL DOCUMENTO:
${signatureUrl}

¿Necesitas ayuda?
Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos. Estamos aquí para ayudarte en lo que necesites.

¡Que tengas un buen día!

Atentamente,
Isabella Vergara
Firmalegalonline@pkiservices.co

═══════════════════════════════════════════════════════════

MARCO LEGAL

Ley 527 de 1999 y Decreto 2364 de 2012:
El Decreto 2364 de 2012, que reglamenta el artículo 7 de la Ley 527 de 1999, define la firma electrónica como aquel método implementado para identificar a una persona y su voluntad para un fin específico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un documento.

Para que la firma electrónica genere efectos legales, deberá cumplir los mismos requisitos que tiene cualquier documento físico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen idénticos efectos.

CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE

PKI SERVICES S.A.S. debe dar cumplimiento al artículo 83 de la constitución política colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades públicas deberán ceñirse a los postulados de buena fe, la cual se presumirá en todas las gestiones que aquéllos adelanten ante éstas."

FALSEDAD EN DOCUMENTO PRIVADO

Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, Artículo 289: "El que falsifique documento privado que pueda servir de prueba, incurrirá, si lo usa, en prisión de uno (1) a seis (6) años."

ACREDITACIÓN ONAC

PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACIÓN DE COLOMBIA (ONAC).

Para cualquier duda o inquietud sobre la plataforma de Firma, puede ponerse en contacto con nuestro servicio de atención al cliente en:
Soporte PKI Services: https://pkiservices.co/soporte/?wpsc-section=ticket-list

═══════════════════════════════════════════════════════════

PKI SERVICES S.A.S.
Plataforma de Firma Electrónica Certificada

Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener información confidencial sometida a secreto profesional. No está permitida su reproducción o distribución sin la autorización expresa. Si usted no es el destinatario final por favor elimínelo e infórmenos por este mismo medio.

De acuerdo con la Ley Estatutaria 1581 de 2012 de Protección de Datos y normas concordantes, le informamos que nuestra entidad cuenta con política para el tratamiento de los datos personales almacenados en sus bases de datos.

© ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados
        `.trim();

        // 5. Enviar email usando SendGrid
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(emailConfig.sendgrid_api_key);

        const emailData = {
            to: email,
            from: {
                email: emailConfig.email_from,
                name: `${emailConfig.email_from_name} (FirmaLegal)`
            },
            replyTo: sender.email, // Permite responder directamente al remitente
            subject: `Solicitud de firma: ${documentTitle}`,
            text: plainText,
            html: htmlContent,
            // Headers anti-spam optimizados para Gmail
            headers: {
                'X-Priority': '3',
                'X-MSMail-Priority': 'Normal',
                'Importance': 'normal',
                'X-Mailer': 'FirmaLegal Online',
                'List-Unsubscribe': `<${APP_URL}/unsubscribe?token=${token}>`,
                'Precedence': 'bulk'
            },
            // Categorías de SendGrid
            categories: ['signature-request', 'legal-document', 'bulk-send'],
            // Custom args para tracking
            customArgs: {
                document_id: String(signatureDocumentId),
                recipient_id: String(recipientId),
                send_method: 'bulk_csv'
            },
            // Tracking settings (importante para reputación)
            trackingSettings: {
                clickTracking: { enable: true },
                openTracking: { enable: true },
                subscriptionTracking: { enable: false }
            }
        };

        await sgMail.send(emailData);

        console.log(`   ✅ Email enviado exitosamente a ${email}`);

        // 5. Actualizar estado en base de datos
        await new Promise((resolve, reject) => {
            db.query(
                `UPDATE document_recipients
                 SET status = 'sent', sent_at = NOW()
                 WHERE recipient_id = ?`,
                [recipientId],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        console.log(`   ✅ Estado actualizado a 'sent' en BD`);

        return { success: true, email, recipientId };

    } catch (error) {
        console.error(`   ❌ Error al procesar email para ${email}:`, error.message);

        // Actualizar estado a error en BD (opcional)
        try {
            await new Promise((resolve, reject) => {
                db.query(
                    `UPDATE document_recipients
                     SET status = 'sent'
                     WHERE recipient_id = ?`,
                    [recipientId],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });
        } catch (dbError) {
            console.error(`   ❌ Error al actualizar estado en BD:`, dbError.message);
        }

        throw error; // Bull reintentará automáticamente
    }
});

// =============================================
// EVENTOS DE LA COLA
// =============================================

emailQueue.on('completed', (job, result) => {
    console.log(`✅ Job #${job.id} completado: ${result.email}`);
});

emailQueue.on('failed', (job, err) => {
    console.error(`❌ Job #${job.id} falló:`, err.message);
    console.log(`   Intentos: ${job.attemptsMade}/${job.opts.attempts}`);
});

emailQueue.on('stalled', (job) => {
    console.warn(`⚠️  Job #${job.id} se atascó (stalled)`);
});

emailQueue.on('error', (error) => {
    console.error('❌ Error en la cola:', error);
});

// Manejar cierre graceful
process.on('SIGTERM', async () => {
    console.log('\n🛑 [EMAIL-WORKER] Recibida señal SIGTERM, cerrando worker...');
    await emailQueue.close();
    db.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 [EMAIL-WORKER] Recibida señal SIGINT (Ctrl+C), cerrando worker...');
    await emailQueue.close();
    db.end();
    process.exit(0);
});

console.log('✅ [EMAIL-WORKER] Worker listo para procesar emails');
console.log('   Presiona Ctrl+C para detener el worker\n');
