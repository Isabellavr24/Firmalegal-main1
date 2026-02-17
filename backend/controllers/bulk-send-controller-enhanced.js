/**
 * =============================================
 * BULK SEND CONTROLLER - ENHANCED
 * Con soporte para mapeo de campos AcroForm
 * =============================================
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const crypto = require('crypto');
const Queue = require('bull');
const path = require('path');
const fs = require('fs').promises;
const { logActivity } = require('../middleware/auth');
const { query } = require('../lib/db-utils');

// =============================================
// CONFIGURACIÓN DE MULTER
// =============================================
const excelStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const { PATHS } = require('../config/paths');
        const dir = path.join(PATHS.UPLOADS_DIR, 'bulk_excel');
        try {
            await fs.mkdir(dir, { recursive: true });
            cb(null, dir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `bulk-${uniqueSuffix}-${file.originalname}`);
    }
});

const uploadExcel = multer({
    storage: excelStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /csv|xlsx|xls/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        if (extname) {
            cb(null, true);
        } else {
            cb(new Error('Solo archivos CSV o XLSX'));
        }
    }
});

// =============================================
// CONFIGURACIÓN DE BULL (COLA)
// =============================================
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

let bulkJobQueue;
try {
    bulkJobQueue = new Queue('bulk-jobs', {
        redis: { host: REDIS_HOST, port: REDIS_PORT }
    });
    console.log(`✅ [BULK-ENHANCED] Cola de trabajos masivos inicializada`);
} catch (error) {
    console.error('❌ [BULK-ENHANCED] Error al conectar con Redis:', error.message);
}

// =============================================
// FUNCIONES AUXILIARES
// =============================================

/**
 * Parsear Excel/CSV y extraer columnas
 */
function parseExcelFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.csv') {
        const fileContent = require('fs').readFileSync(filePath, 'utf8');
        const parsed = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true
        });
        return {
            data: parsed.data,
            columns: parsed.meta.fields || []
        };
    } else {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        const columns = data.length > 0 ? Object.keys(data[0]) : [];

        return { data, columns };
    }
}

/**
 * Generar token único
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// =============================================
// ENDPOINTS
// =============================================

/**
 * POST /api/bulk/upload-excel
 * Paso 1: Subir Excel y crear job pendiente de mapeo
 */
router.post('/upload-excel', uploadExcel.single('excel'), async (req, res) => {
    console.log('\n📊 [BULK-ENHANCED] POST /upload-excel');

    const { templateId } = req.body;
    const db = req.app.locals.db;
    const userId = req.userId || 1;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se recibió archivo Excel'
            });
        }

        if (!templateId) {
            return res.status(400).json({
                success: false,
                error: 'templateId es requerido'
            });
        }

        // Verificar que la plantilla existe y tiene AcroForm
        const templates = await query(db,
            `SELECT id, name, has_acroform, file_path
             FROM documents
             WHERE id = ? AND is_template = TRUE`,
            [templateId]
        );

        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

        const template = templates[0];

        if (!template.has_acroform) {
            return res.status(400).json({
                success: false,
                error: 'La plantilla no tiene campos AcroForm'
            });
        }

        console.log(`📄 Plantilla: ${template.name}`);

        // Parsear Excel para obtener columnas
        const excelPath = req.file.path;
        const { data, columns } = parseExcelFile(excelPath);

        if (data.length === 0) {
            await fs.unlink(excelPath);
            return res.status(400).json({
                success: false,
                error: 'El archivo Excel está vacío'
            });
        }

        console.log(`📊 Excel: ${data.length} filas, ${columns.length} columnas`);
        console.log(`📋 Columnas: ${columns.join(', ')}`);

        // Crear bulk_job
        const jobResult = await query(db,
            `INSERT INTO bulk_jobs
             (template_id, excel_file_path, excel_columns, total_rows, status, created_by, created_at)
             VALUES (?, ?, ?, ?, 'pending_mapping', ?, NOW())`,
            [templateId, excelPath, JSON.stringify(columns), data.length, userId]
        );

        const bulkJobId = jobResult.insertId;

        console.log(`✅ Bulk job creado: ID ${bulkJobId}`);

        res.json({
            success: true,
            data: {
                bulkJobId,
                templateId,
                templateName: template.name,
                columns,
                totalRows: data.length
            }
        });

    } catch (error) {
        console.error('[BULK-ENHANCED] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al procesar Excel',
            details: error.message
        });
    }
});

/**
 * GET /api/bulk/:bulkJobId/columns
 * Obtener columnas del Excel de un job
 */
router.get('/:bulkJobId/columns', async (req, res) => {
    const { bulkJobId } = req.params;
    const db = req.app.locals.db;

    try {
        const jobs = await query(db,
            `SELECT excel_columns FROM bulk_jobs WHERE id = ?`,
            [bulkJobId]
        );

        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Job no encontrado'
            });
        }

        const columns = JSON.parse(jobs[0].excel_columns || '[]');

        res.json({
            success: true,
            data: { columns }
        });

    } catch (error) {
        console.error('[BULK-ENHANCED] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener columnas'
        });
    }
});

/**
 * POST /api/bulk/:bulkJobId/mappings
 * Paso 2: Guardar mapeo de campos PDF ↔ columnas Excel
 */
router.post('/:bulkJobId/mappings', async (req, res) => {
    console.log('\n📊 [BULK-ENHANCED] POST /:bulkJobId/mappings');

    const { bulkJobId } = req.params;
    const { mappings } = req.body; // [{ fieldId, columnName, transformRule }]
    const db = req.app.locals.db;

    try {
        if (!mappings || !Array.isArray(mappings)) {
            return res.status(400).json({
                success: false,
                error: 'El parámetro mappings debe ser un array'
            });
        }

        // Verificar que el job existe
        const jobs = await query(db,
            `SELECT id, status FROM bulk_jobs WHERE id = ?`,
            [bulkJobId]
        );

        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Job no encontrado'
            });
        }

        console.log(`📋 Guardando ${mappings.length} mapeos para job ${bulkJobId}`);

        // Limpiar mapeos anteriores
        await query(db,
            `DELETE FROM bulk_mappings WHERE bulk_job_id = ?`,
            [bulkJobId]
        );

        // Insertar nuevos mapeos
        for (const mapping of mappings) {
            if (!mapping.fieldId || !mapping.columnName) {
                continue; // Skip invalid mappings
            }

            await query(db,
                `INSERT INTO bulk_mappings
                 (bulk_job_id, template_field_id, excel_column_name, transform_rule)
                 VALUES (?, ?, ?, ?)`,
                [
                    bulkJobId,
                    mapping.fieldId,
                    mapping.columnName,
                    mapping.transformRule || 'direct'
                ]
            );

            console.log(`  ✓ Campo ${mapping.fieldId} ↔ Columna "${mapping.columnName}"`);
        }

        // Actualizar estado del job
        await query(db,
            `UPDATE bulk_jobs
             SET mapping_configured = TRUE, status = 'ready', updated_at = NOW()
             WHERE id = ?`,
            [bulkJobId]
        );

        console.log(`✅ Mapeos guardados, job listo para procesar`);

        res.json({
            success: true,
            message: 'Mapeos guardados correctamente',
            data: {
                bulkJobId,
                mappingsCount: mappings.length
            }
        });

    } catch (error) {
        console.error('[BULK-ENHANCED] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al guardar mapeos',
            details: error.message
        });
    }
});

/**
 * POST /api/bulk/:bulkJobId/start
 * Paso 3: Iniciar procesamiento del job (encolar en Bull)
 */
router.post('/:bulkJobId/start', async (req, res) => {
    console.log('\n📊 [BULK-ENHANCED] POST /:bulkJobId/start');

    const { bulkJobId } = req.params;
    const db = req.app.locals.db;
    const userId = req.userId || 1;

    try {
        // Verificar que el job está listo
        const jobs = await query(db,
            `SELECT bj.*, d.name as template_name
             FROM bulk_jobs bj
             JOIN documents d ON bj.template_id = d.document_id
             WHERE bj.id = ? AND bj.mapping_configured = TRUE AND bj.status = 'ready'`,
            [bulkJobId]
        );

        if (jobs.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'El job no está listo o no existe (verifica el mapeo)'
            });
        }

        const job = jobs[0];

        console.log(`🚀 Iniciando procesamiento de job ${bulkJobId}`);
        console.log(`   Plantilla: ${job.template_name}`);
        console.log(`   Filas: ${job.total_rows}`);

        // Actualizar estado
        await query(db,
            `UPDATE bulk_jobs
             SET status = 'processing', started_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [bulkJobId]
        );

        // Encolar job en Bull
        if (!bulkJobQueue) {
            return res.status(503).json({
                success: false,
                error: 'Cola de trabajos no disponible'
            });
        }

        await bulkJobQueue.add({
            bulkJobId,
            userId
        }, {
            attempts: 1, // No reintentar automáticamente
            timeout: 3600000 // 1 hora timeout
        });

        console.log(`✅ Job ${bulkJobId} encolado exitosamente`);

        // Log de actividad
        if (logActivity) {
            await logActivity(db, {
                userId,
                action: 'start_bulk_job',
                entityType: 'bulk_job',
                entityId: bulkJobId,
                details: {
                    template_name: job.template_name,
                    total_rows: job.total_rows
                },
                req
            });
        }

        res.json({
            success: true,
            message: 'Procesamiento iniciado',
            data: {
                bulkJobId,
                totalRows: job.total_rows,
                status: 'processing'
            }
        });

    } catch (error) {
        console.error('[BULK-ENHANCED] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al iniciar procesamiento',
            details: error.message
        });
    }
});

/**
 * GET /api/bulk/:bulkJobId/status
 * Obtener progreso de un job
 */
router.get('/:bulkJobId/status', async (req, res) => {
    const { bulkJobId } = req.params;
    const db = req.app.locals.db;

    try {
        const jobs = await query(db,
            `SELECT
                bj.*,
                d.name as template_name,
                ROUND((bj.processed_rows / bj.total_rows) * 100, 2) as progress_percentage
             FROM bulk_jobs bj
             JOIN documents d ON bj.template_id = d.document_id
             WHERE bj.id = ?`,
            [bulkJobId]
        );

        if (jobs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Job no encontrado'
            });
        }

        const job = jobs[0];

        // Obtener errores recientes
        const errors = await query(db,
            `SELECT row_number, error_type, error_message
             FROM bulk_job_errors
             WHERE bulk_job_id = ?
             ORDER BY created_at DESC
             LIMIT 10`,
            [bulkJobId]
        );

        res.json({
            success: true,
            data: {
                bulkJobId: job.id,
                status: job.status,
                totalRows: job.total_rows,
                processedRows: job.processed_rows,
                successfulRows: job.successful_rows,
                failedRows: job.failed_rows,
                progressPercentage: job.progress_percentage,
                startedAt: job.started_at,
                completedAt: job.completed_at,
                errorMessage: job.error_message,
                recentErrors: errors
            }
        });

    } catch (error) {
        console.error('[BULK-ENHANCED] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener estado'
        });
    }
});

/**
 * GET /api/bulk/jobs
 * Listar jobs del usuario
 */
router.get('/jobs', async (req, res) => {
    const db = req.app.locals.db;
    const userId = req.userId || 1;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        const jobs = await query(db,
            `SELECT
                bj.id,
                bj.status,
                bj.total_rows,
                bj.processed_rows,
                bj.successful_rows,
                bj.failed_rows,
                bj.created_at,
                bj.started_at,
                bj.completed_at,
                d.name as template_name
             FROM bulk_jobs bj
             JOIN documents d ON bj.template_id = d.document_id
             WHERE bj.created_by = ?
             ORDER BY bj.created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const countResult = await query(db,
            `SELECT COUNT(*) as total FROM bulk_jobs WHERE created_by = ?`,
            [userId]
        );

        res.json({
            success: true,
            data: jobs,
            pagination: {
                page,
                limit,
                total: countResult[0].total
            }
        });

    } catch (error) {
        console.error('[BULK-ENHANCED] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al listar jobs'
        });
    }
});

module.exports = router;
module.exports.bulkJobQueue = bulkJobQueue;
