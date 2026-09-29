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
// Envios que han fallado en los ultimos minutos, para el resumen periodico del
// final del archivo. Se declara aqui porque el manejador de errores lo usa.
const fallosRecientes = [];

// Pool, no una conexion suelta. Con `createConnection`, cuando MySQL cerraba
// la conexion por inactividad esta quedaba muerta para siempre y el worker
// respondia a todo con "Can't add new command when connection is in closed
// state". El 17-09-2026 estuvo 21 horas sin enviar un solo correo, y en
// silencio: los correos se encolaban y el sistema los daba por buenos.
//
// El pool abre una conexion nueva cuando la anterior se cae, asi que el worker
// se recupera solo sin reiniciar el contenedor.
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'firmalegalonline',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,          // evita que MySQL la cierre por inactividad
    keepAliveInitialDelay: 30000,
    authPlugins: {
        mysql_native_password: () => () => require('mysql2/lib/auth_plugins').mysql_native_password
    }
});

// Comprobacion inicial: si la base no responde al arrancar, mejor saberlo aqui.
db.query('SELECT 1', err => {
    if (err) {
        console.error('🔴 [EMAIL-WORKER] Error al conectar a MySQL:', err.message);
        process.exit(1);
    }
    console.log('🟢 [EMAIL-WORKER] Conectado a MySQL (pool con reconexion)');
});

// Un fallo del pool ya no deja al worker mudo: se registra y se sigue. La
// siguiente consulta abrira una conexion nueva.
db.on('error', err => {
    console.error(`🔴 [EMAIL-WORKER] Error de conexion (${err.code}): ${err.message}`);
    console.error('   El pool abrira una conexion nueva en el proximo trabajo.');
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

        // 3. Configuración de envío. Todo sale por la cuenta de FirmaLegal
        // (user_id = 1): la configuración propia del usuario es opcional y, si
        // no la tiene, el correo igual debe salir. Sin este respaldo el envío
        // falla para cualquier cuenta que no haya configurado la suya.
        const [emailConfigResults] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM email_config WHERE user_id IN (?, 1) AND is_active = TRUE ORDER BY user_id = ? DESC LIMIT 1',
                [userId, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (emailConfigResults.length === 0) {
            throw new Error('No hay configuración de email del sistema (user_id=1)');
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

Buenas noticias. Ya esta listo el documento para su firma digital. Es un proceso facil y seguro.

Ya realizo la validacion de identidad biometrica de manera exitosa.

Ahora debe proceder con la firma del documento.

DOCUMENTO A FIRMAR: ${documentTitle}

ANTES DE HACER CLIC EN EL ENLACE, POR FAVOR TENGA EN CUENTA LO SIGUIENTE:

Al ingresar al sistema de firma digital, debera buscar el recuadro designado para la firma. Alli podra elegir entre tres opciones para completarla:

1. Firma tecleada:
   Escriba su nombre completo y se generara automaticamente una firma en estilo tipografico.

2. Firma manuscrita (grafica):
   Dibuje su firma directamente en el recuadro usando el cursor o una pantalla tactil.

3. Cargar imagen de su firma:
   Si ya tiene su firma escaneada, puede subirla en formato JPG o PNG.

ENLACE PARA FIRMAR EL DOCUMENTO:
${signatureUrl}

Necesita ayuda?
Si tiene alguna pregunta o necesita ayuda, no dude en contactarnos. Estamos aqui para ayudarle en lo que necesite.

Atentamente,
Isabella Vergara
Firmalegalonline@pkiservices.co

---

MARCO LEGAL

Ley 527 de 1999 y Decreto 2364 de 2012:
El Decreto 2364 de 2012, que reglamenta el articulo 7 de la Ley 527 de 1999, define la firma electronica como aquel metodo implementado para identificar a una persona y su voluntad para un fin especifico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un documento.

Para que la firma electronica genere efectos legales, debera cumplir los mismos requisitos que tiene cualquier documento fisico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen identicos efectos.

CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE

PKI SERVICES S.A.S. debe dar cumplimiento al articulo 83 de la constitucion politica colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades publicas deberan cenirse a los postulados de buena fe, la cual se presumira en todas las gestiones que aquellos adelanten ante estas."

FALSEDAD EN DOCUMENTO PRIVADO

Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, Articulo 289: "El que falsifique documento privado que pueda servir de prueba, incurrira, si lo usa, en prision de uno (1) a seis (6) anos."

ACREDITACION ONAC

PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACION DE COLOMBIA (ONAC).

Para cualquier duda o inquietud sobre la plataforma de Firma, puede ponerse en contacto con nuestro servicio de atencion al cliente en:
Soporte PKI Services: https://pkiservices.co/soporte/?wpsc-section=ticket-list

---

PKI SERVICES S.A.S.
Plataforma de Firma Electronica Certificada

Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener informacion confidencial sometida a secreto profesional. No esta permitida su reproduccion o distribucion sin la autorizacion expresa. Si usted no es el destinatario final por favor eliminelo e informenos por este mismo medio.

De acuerdo con la Ley Estatutaria 1581 de 2012 de Proteccion de Datos y normas concordantes, le informamos que nuestra entidad cuenta con politica para el tratamiento de los datos personales almacenados en sus bases de datos.

(c) ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados
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
            subject: `Firma electronica requerida - ${documentTitle}`,
            text: plainText,
            html: htmlContent,
            // Headers
            headers: {
                'X-Mailer': 'FirmaLegal Online'
            },
            // Categorías de SendGrid
            categories: ['signature-request', 'legal-document'],
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

        // Se cuenta para el resumen periodico. Sin esto, un worker caido pasaba
        // horas fallando y nadie se enteraba hasta que un padre reclamaba.
        fallosRecientes.push({ email, motivo: error.message, cuando: new Date() });

        // NO se marca como 'sent': el correo no salio. Antes se ponia 'sent'
        // igualmente, asi que un envio fallido quedaba indistinguible de uno
        // bueno y nadie podia saber a quien habia que reenviar. Se deja el
        // estado como estaba y Bull reintenta.
        throw error; // Bull reintentará automáticamente
    }
});

// Resumen periodico: un worker que falla en silencio es el peor caso, porque
// los correos se encolan, el sistema los da por buenos y el fallo solo se
// descubre cuando alguien reclama. Cada 15 minutos deja constancia en el log
// de cuantos envios fallaron, para que se vea al revisar.
setInterval(() => {
    const corte = Date.now() - 15 * 60 * 1000;
    while (fallosRecientes.length && fallosRecientes[0].cuando.getTime() < corte) {
        fallosRecientes.shift();
    }
    if (!fallosRecientes.length) return;

    const porMotivo = {};
    for (const f of fallosRecientes) {
        const clave = String(f.motivo).slice(0, 80);
        porMotivo[clave] = (porMotivo[clave] || 0) + 1;
    }
    console.error(`\n🔴 [EMAIL-WORKER] ${fallosRecientes.length} envio(s) fallido(s) en los ultimos 15 minutos:`);
    for (const [motivo, n] of Object.entries(porMotivo)) {
        console.error(`   ${String(n).padStart(4)} x  ${motivo}`);
    }
    console.error(`   Ultimos correos afectados: ${fallosRecientes.slice(-5).map(f => f.email).join(', ')}\n`);
}, 15 * 60 * 1000);

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
