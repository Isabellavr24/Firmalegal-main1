/**
 * =============================================
 * BULK JOB PROCESSOR
 * Worker que escucha la cola de Bull y procesa jobs
 * Ejecutar con: node backend/workers/bulk-job-processor.js
 * =============================================
 */

const Queue = require('bull');
const mysql = require('mysql2');
const { processBulkJob } = require('./bulk-job-worker');

// =============================================
// CONFIGURACIÓN
// =============================================
require('dotenv').config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const DB_CONFIG = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '1234',
    database: 'firmalegalonline'
};

// =============================================
// INICIALIZACIÓN
// =============================================

let db;
let bulkJobQueue;

async function init() {
    try {
        console.log('🚀 [BULK-PROCESSOR] Inicializando worker...');

        // Conectar a BD (mismo método que server.js)
        db = mysql.createConnection(DB_CONFIG);

        db.connect(err => {
            if (err) {
                console.error('❌ Error al conectar a MySQL:', err);
                process.exit(1);
            }
            console.log('✅ Conectado a MySQL');
        });

        // Conectar a Redis/Bull
        bulkJobQueue = new Queue('bulk-jobs', {
            redis: {
                host: REDIS_HOST,
                port: REDIS_PORT
            }
        });

        console.log(`✅ Conectado a Redis (${REDIS_HOST}:${REDIS_PORT})`);

        // Configurar procesamiento de jobs
        bulkJobQueue.process(async (job) => {
            console.log(`\n📥 [BULK-PROCESSOR] Job recibido: ${job.id}`);
            console.log(`   Datos:`, job.data);

            try {
                const result = await processBulkJob(job, db);
                console.log(`✅ [BULK-PROCESSOR] Job ${job.id} completado exitosamente`);
                return result;

            } catch (error) {
                console.error(`❌ [BULK-PROCESSOR] Job ${job.id} falló:`, error);
                throw error; // Bull manejará reintentos según configuración
            }
        });

        // Event listeners
        bulkJobQueue.on('completed', (job, result) => {
            console.log(`\n✅ [BULL] Job ${job.id} completado`);
            console.log(`   Exitosos: ${result.successCount}, Fallidos: ${result.failedCount}`);
        });

        bulkJobQueue.on('failed', (job, err) => {
            console.error(`\n❌ [BULL] Job ${job.id} falló:`);
            console.error(`   Error: ${err.message}`);
        });

        bulkJobQueue.on('progress', (job, progress) => {
            console.log(`📊 [BULL] Job ${job.id} progreso: ${progress}%`);
        });

        bulkJobQueue.on('stalled', (job) => {
            console.warn(`⚠️  [BULL] Job ${job.id} está estancado`);
        });

        bulkJobQueue.on('error', (error) => {
            console.error(`❌ [BULL] Error en cola:`, error);
        });

        console.log('\n✅ Worker iniciado y escuchando jobs...');
        console.log('   Presiona Ctrl+C para detener\n');

    } catch (error) {
        console.error('❌ [BULK-PROCESSOR] Error de inicialización:', error);
        process.exit(1);
    }
}

// =============================================
// MANEJO DE SEÑALES
// =============================================

async function shutdown() {
    console.log('\n\n🛑 [BULK-PROCESSOR] Cerrando worker...');

    try {
        if (bulkJobQueue) {
            await bulkJobQueue.close();
            console.log('✅ Cola cerrada');
        }

        if (db) {
            db.end();
            console.log('✅ Conexión de BD cerrada');
        }

        console.log('👋 Hasta luego\n');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error durante cierre:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [BULK-PROCESSOR] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ [BULK-PROCESSOR] Uncaught Exception:', error);
    shutdown();
});

// =============================================
// INICIAR
// =============================================

init();
