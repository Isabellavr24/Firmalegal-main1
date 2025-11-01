/**
 * =============================================
 * CONTROLADOR DE CONFIGURACIÓN DE EMAIL
 * Gestión de configuración de SendGrid por usuario
 * =============================================
 */

const express = require('express');
const router = express.Router();
const { requireAuth, logActivity } = require('../middleware/auth');

/**
 * GET /api/email-config
 * Obtener configuración de email del usuario autenticado
 */
router.get('/', requireAuth, async (req, res) => {
    console.log('\n📧 [EMAIL-CONFIG] GET /api/email-config');
    console.log(`   Usuario: ${req.userId}`);

    const db = req.app.locals.db;

    try {
        const results = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    config_id,
                    user_id,
                    provider,
                    email_from,
                    email_from_name,
                    is_active,
                    is_verified,
                    created_at,
                    updated_at
                 FROM email_config
                 WHERE user_id = ? AND is_active = TRUE`,
                [req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (results.length === 0) {
            console.log('⚠️ [EMAIL-CONFIG] No hay configuración para este usuario');
            return res.json({
                success: true,
                configured: false,
                message: 'No hay configuración de email',
                data: null
            });
        }

        const config = results[0];
        console.log(`✅ [EMAIL-CONFIG] Configuración encontrada para ${config.email_from}`);

        res.json({
            success: true,
            configured: true,
            data: {
                config_id: config.config_id,
                provider: config.provider,
                email_from: config.email_from,
                email_from_name: config.email_from_name,
                is_verified: config.is_verified,
                created_at: config.created_at,
                updated_at: config.updated_at
            }
        });

    } catch (error) {
        console.error('❌ [EMAIL-CONFIG] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener configuración de email',
            message: error.message
        });
    }
});

/**
 * POST /api/email-config
 * Guardar o actualizar configuración de email del usuario
 */
router.post('/', requireAuth, async (req, res) => {
    console.log('\n📧 [EMAIL-CONFIG] POST /api/email-config');
    console.log(`   Usuario: ${req.userId}`);
    console.log('   Body:', JSON.stringify(req.body, null, 2));

    const {
        sendgrid_api_key,
        email_from,
        email_from_name = 'FirmaLegal Online'
    } = req.body;

    // Validaciones
    if (!sendgrid_api_key || !email_from) {
        console.log('❌ [EMAIL-CONFIG] Faltan campos requeridos');
        return res.status(400).json({
            success: false,
            error: 'Campos requeridos: sendgrid_api_key, email_from'
        });
    }

    // Validar formato de API Key de SendGrid
    if (!sendgrid_api_key.startsWith('SG.')) {
        console.log('❌ [EMAIL-CONFIG] API Key inválida');
        return res.status(400).json({
            success: false,
            error: 'La API Key de SendGrid debe comenzar con "SG."'
        });
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email_from)) {
        console.log('❌ [EMAIL-CONFIG] Email inválido');
        return res.status(400).json({
            success: false,
            error: 'El formato del email es inválido'
        });
    }

    const db = req.app.locals.db;

    try {
        // Verificar si ya existe configuración para este usuario
        const existing = await new Promise((resolve, reject) => {
            db.query(
                'SELECT config_id FROM email_config WHERE user_id = ?',
                [req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        let result;

        if (existing.length > 0) {
            // UPDATE - Actualizar configuración existente
            console.log('📝 [EMAIL-CONFIG] Actualizando configuración existente...');

            result = await new Promise((resolve, reject) => {
                db.query(
                    `UPDATE email_config
                     SET sendgrid_api_key = ?,
                         email_from = ?,
                         email_from_name = ?,
                         is_verified = FALSE,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE user_id = ?`,
                    [sendgrid_api_key, email_from, email_from_name, req.userId],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });

            console.log(`✅ [EMAIL-CONFIG] Configuración actualizada para usuario ${req.userId}`);

            // Log de actividad
            await logActivity(db, {
                userId: req.userId,
                action: 'update_email_config',
                entityType: 'email_config',
                entityId: existing[0].config_id,
                details: { email_from, email_from_name, provider: 'sendgrid' },
                req
            });

            res.json({
                success: true,
                message: 'Configuración de email actualizada exitosamente',
                data: {
                    config_id: existing[0].config_id,
                    email_from,
                    email_from_name,
                    provider: 'sendgrid'
                }
            });

        } else {
            // INSERT - Crear nueva configuración
            console.log('📝 [EMAIL-CONFIG] Creando nueva configuración...');

            result = await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO email_config (user_id, provider, sendgrid_api_key, email_from, email_from_name)
                     VALUES (?, 'sendgrid', ?, ?, ?)`,
                    [req.userId, sendgrid_api_key, email_from, email_from_name],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });

            const configId = result.insertId;
            console.log(`✅ [EMAIL-CONFIG] Configuración creada con ID: ${configId}`);

            // Log de actividad
            await logActivity(db, {
                userId: req.userId,
                action: 'create_email_config',
                entityType: 'email_config',
                entityId: configId,
                details: { email_from, email_from_name, provider: 'sendgrid' },
                req
            });

            res.status(201).json({
                success: true,
                message: 'Configuración de email creada exitosamente',
                data: {
                    config_id: configId,
                    email_from,
                    email_from_name,
                    provider: 'sendgrid'
                }
            });
        }

    } catch (error) {
        console.error('❌ [EMAIL-CONFIG] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al guardar configuración de email',
            message: error.message
        });
    }
});

/**
 * DELETE /api/email-config
 * Eliminar configuración de email del usuario
 */
router.delete('/', requireAuth, async (req, res) => {
    console.log('\n📧 [EMAIL-CONFIG] DELETE /api/email-config');
    console.log(`   Usuario: ${req.userId}`);

    const db = req.app.locals.db;

    try {
        const result = await new Promise((resolve, reject) => {
            db.query(
                'UPDATE email_config SET is_active = FALSE WHERE user_id = ?',
                [req.userId],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        if (result.affectedRows === 0) {
            console.log('⚠️ [EMAIL-CONFIG] No hay configuración para eliminar');
            return res.status(404).json({
                success: false,
                error: 'No hay configuración de email para este usuario'
            });
        }

        console.log(`✅ [EMAIL-CONFIG] Configuración desactivada para usuario ${req.userId}`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'delete_email_config',
            entityType: 'email_config',
            entityId: null,
            details: {},
            req
        });

        res.json({
            success: true,
            message: 'Configuración de email eliminada exitosamente'
        });

    } catch (error) {
        console.error('❌ [EMAIL-CONFIG] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al eliminar configuración de email',
            message: error.message
        });
    }
});

/**
 * POST /api/email-config/test
 * Probar configuración de email enviando un email de prueba
 */
router.post('/test', requireAuth, async (req, res) => {
    console.log('\n📧 [EMAIL-CONFIG] POST /api/email-config/test');
    console.log(`   Usuario: ${req.userId}`);

    const { to } = req.body;

    if (!to) {
        return res.status(400).json({
            success: false,
            error: 'El campo "to" (email destino) es requerido'
        });
    }

    const db = req.app.locals.db;

    try {
        // Obtener configuración del usuario
        const configs = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM email_config WHERE user_id = ? AND is_active = TRUE',
                [req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (configs.length === 0) {
            console.log('⚠️ [EMAIL-CONFIG] No hay configuración para probar');
            return res.status(404).json({
                success: false,
                error: 'No tienes configuración de email. Por favor configúrala primero.'
            });
        }

        const config = configs[0];

        // Enviar email de prueba usando la configuración del usuario
        const mailer = require('../lib/email/mailer-dynamic');
        const result = await mailer.sendTestEmailWithConfig(config, to);

        if (result.success) {
            res.json({
                success: true,
                message: `Email de prueba enviado exitosamente a ${to}`,
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error al enviar email de prueba',
                details: result.error
            });
        }

    } catch (error) {
        console.error('❌ [EMAIL-CONFIG] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al probar configuración de email',
            message: error.message
        });
    }
});

module.exports = router;
