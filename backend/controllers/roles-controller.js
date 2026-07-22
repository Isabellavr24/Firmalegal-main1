/**
 * =============================================
 * CONTROLADOR DE ROLES DE FIRMANTES
 * Sistema de roles similar a DocuSeal
 * =============================================
 */

const crypto = require('crypto');

/**
 * COLORES PREDEFINIDOS PARA ROLES
 */
const ROLE_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
];

/**
 * NOMBRES DE ROLES PREDETERMINADOS
 */
const DEFAULT_ROLE_NAMES = [
    'Primera parte',
    'Segunda parte',
    'Tercera parte',
    'Cuarta parte',
    'Quinta parte',
    'Sexta parte',
    'Séptima parte',
    'Octava parte',
];

/**
 * =============================================
 * 1. CREACIÓN Y GESTIÓN DE ROLES
 * =============================================
 */

/**
 * Crear roles para un documento
 * POST /api/documents/:documentId/roles
 *
 * Body: {
 *   roles: [
 *     { name: 'Primera parte', order: 1, color: '#3B82F6', signInOrder: true },
 *     { name: 'Segunda parte', order: 2, color: '#10B981', signInOrder: true }
 *   ],
 *   signInOrder: true,  // Firma secuencial global
 *   allowParallel: true, // Permitir firma paralela en mismo orden
 *   reminderIntervalDays: 3,
 *   expirationDays: 30
 * }
 */
async function createRoles(req, res) {
    const documentId = req.params.id; // La ruta es /:id/roles
    const { roles, signInOrder, allowParallel, reminderIntervalDays, expirationDays } = req.body;
    const userId = req.userId;
    const db = req.app.locals.db;

    console.log(`📋 [ROLES] POST /api/documents/${documentId}/roles`);
    console.log(`   Usuario: ${userId}`);
    console.log(`   Roles a crear: ${roles.length}`);

    try {
        // Verificar que el documento existe y pertenece al usuario
        const [docs] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (docs.length === 0) {
            console.log('❌ [ROLES] Documento no encontrado');
            return res.status(404).json({
                success: false,
                error: 'Documento no encontrado'
            });
        }

        // Iniciar transacción
        await new Promise((resolve, reject) => {
            db.beginTransaction((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // 1. Crear configuración de firma
            const expiresAt = expirationDays
                ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
                : null;

            await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO document_signing_config
                     (document_id, sign_in_order, allow_parallel_in_same_order,
                      reminder_interval_days, expiration_days, expires_at)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                     sign_in_order = VALUES(sign_in_order),
                     allow_parallel_in_same_order = VALUES(allow_parallel_in_same_order),
                     reminder_interval_days = VALUES(reminder_interval_days),
                     expiration_days = VALUES(expiration_days),
                     expires_at = VALUES(expires_at)`,
                    [documentId, signInOrder || false, allowParallel !== false,
                     reminderIntervalDays || 3, expirationDays, expiresAt],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            console.log('   ✅ Configuración de firma creada');

            // 2. Eliminar roles anteriores (si existen)
            await new Promise((resolve, reject) => {
                db.query(
                    'DELETE FROM signer_roles WHERE document_id = ?',
                    [documentId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // 3. Crear nuevos roles
            const createdRoles = [];
            for (let i = 0; i < roles.length; i++) {
                const role = roles[i];
                const result = await new Promise((resolve, reject) => {
                    db.query(
                        `INSERT INTO signer_roles
                         (document_id, role_name, role_order, role_color, sign_in_order, is_optional)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            documentId,
                            role.name || DEFAULT_ROLE_NAMES[i],
                            role.order || (i + 1),
                            role.color || ROLE_COLORS[i % ROLE_COLORS.length],
                            role.signInOrder !== false,
                            role.isOptional || false
                        ],
                        (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        }
                    );
                });

                createdRoles.push({
                    roleId: result.insertId,
                    name: role.name || DEFAULT_ROLE_NAMES[i],
                    order: role.order || (i + 1),
                    color: role.color || ROLE_COLORS[i % ROLE_COLORS.length]
                });

                console.log(`   ✅ Rol creado: ${role.name || DEFAULT_ROLE_NAMES[i]} (orden ${role.order || (i + 1)})`);
            }

            // Commit transacción
            await new Promise((resolve, reject) => {
                db.commit((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`✅ [ROLES] ${createdRoles.length} roles creados exitosamente`);

            res.json({
                success: true,
                roles: createdRoles,
                config: {
                    signInOrder: signInOrder || false,
                    allowParallel: allowParallel !== false,
                    reminderIntervalDays: reminderIntervalDays || 3,
                    expirationDays,
                    expiresAt
                }
            });

        } catch (error) {
            // Rollback en caso de error
            await new Promise((resolve) => {
                db.rollback(() => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('❌ [ROLES] Error al crear roles:', error);
        res.status(500).json({
            success: false,
            error: 'Error al crear roles',
            details: error.message
        });
    }
}

/**
 * Obtener roles de un documento
 * GET /api/documents/:documentId/roles
 */
async function getRoles(req, res) {
    const documentId = req.params.id; // Ruta: /:id/roles
    const userId = req.userId;
    const db = req.app.locals.db;

    try {
        // Verificar acceso al documento
        const [docs] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (docs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Documento no encontrado'
            });
        }

        // 🔥 NUEVO: Primero intentar obtener partes del documento (document_parts)
        const [parts] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    part_id,
                    role_name,
                    order_position,
                    color
                 FROM document_parts
                 WHERE document_id = ?
                 ORDER BY order_position ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        // Si hay partes configuradas, usarlas
        if (parts.length > 0) {
            console.log(`✅ [ROLES] Encontradas ${parts.length} partes en document_parts`);
            
            return res.json({
                success: true,
                roles: parts.map(p => ({
                    roleId: p.order_position, // Usar order_position como roleId
                    partId: p.part_id, // 🔥 NUEVO: Incluir part_id
                    name: p.role_name,
                    order: p.order_position,
                    color: p.color || '#6b7280'
                })),
                config: {
                    signInOrder: false // Las partes no tienen configuración de orden por ahora
                }
            });
        }

        // Si no hay partes, buscar en signer_roles (sistema antiguo)
        console.log(`ℹ️ [ROLES] No hay partes en document_parts, buscando en signer_roles`);

        // Obtener roles (sistema antiguo)
        const [roles] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    role_id,
                    role_name,
                    role_order,
                    role_color,
                    sign_in_order,
                    is_optional
                 FROM signer_roles
                 WHERE document_id = ?
                 ORDER BY role_order ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        // Obtener configuración
        const [config] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM document_signing_config WHERE document_id = ?',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        res.json({
            success: true,
            roles: roles.map(r => ({
                roleId: r.role_id,
                name: r.role_name,
                order: r.role_order,
                color: r.role_color,
                signInOrder: r.sign_in_order === 1,
                isOptional: r.is_optional === 1
            })),
            config: config[0] || null
        });

    } catch (error) {
        console.error('❌ [ROLES] Error al obtener roles:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener roles'
        });
    }
}

/**
 * =============================================
 * 2. ASIGNACIÓN DE CAMPOS A ROLES
 * =============================================
 */

/**
 * Asignar campos a roles
 * POST /api/documents/:documentId/fields/assign-roles
 *
 * Body: {
 *   assignments: [
 *     { fieldId: 1, roleId: 1 },
 *     { fieldId: 2, roleId: 1 },
 *     { fieldId: 3, roleId: 2 }
 *   ]
 * }
 */
async function assignFieldsToRoles(req, res) {
    const documentId = req.params.id; // Ruta: /:id/fields/assign-roles
    const { assignments } = req.body;
    const userId = req.userId;
    const db = req.app.locals.db;

    console.log(`🎯 [ROLES] POST /api/documents/${documentId}/fields/assign-roles`);
    console.log(`   Asignaciones: ${assignments.length}`);

    try{
        // Verificar documento
        const [docs] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (docs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Documento no encontrado'
            });
        }

        // Actualizar asignaciones
        for (const assignment of assignments) {
            await new Promise((resolve, reject) => {
                db.query(
                    `UPDATE document_fields
                     SET role_id = ?
                     WHERE field_id = ? AND document_id = ?`,
                    [assignment.roleId, assignment.fieldId, documentId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        console.log(`✅ [ROLES] ${assignments.length} campos asignados a roles`);

        res.json({
            success: true,
            assignedCount: assignments.length
        });

    } catch (error) {
        console.error('❌ [ROLES] Error al asignar campos:', error);
        res.status(500).json({
            success: false,
            error: 'Error al asignar campos a roles'
        });
    }
}

/**
 * =============================================
 * 3. ASIGNACIÓN DE DESTINATARIOS A ROLES
 * =============================================
 */

/**
 * Asignar destinatarios a roles y calcular orden de firma
 * POST /api/documents/:documentId/recipients/assign-roles
 *
 * Body: {
 *   assignments: [
 *     { recipientId: 1, roleId: 1 },
 *     { recipientId: 2, roleId: 2 },
 *     { recipientId: 3, roleId: 2 }  // Dos personas con el mismo rol
 *   ]
 * }
 */
async function assignRecipientsToRoles(req, res) {
    const documentId = req.params.id; // Ruta: /:id/recipients/assign-roles
    const { assignments } = req.body;
    const userId = req.userId;
    const db = req.app.locals.db;

    console.log(`👥 [ROLES] POST /api/documents/${documentId}/recipients/assign-roles`);
    console.log(`   Asignaciones: ${assignments.length}`);

    try {
        // Verificar documento y obtener configuración
        const [config] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dsc.* FROM document_signing_config dsc
                 JOIN documents d ON dsc.document_id = d.document_id
                 WHERE dsc.document_id = ? AND d.owner_id = ?`,
                [documentId, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (config.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Documento no encontrado o sin configuración de firma'
            });
        }

        const signingConfig = config[0];
        const signInOrder = signingConfig.sign_in_order === 1;

        // Obtener información de roles
        const [roles] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM signer_roles WHERE document_id = ? ORDER BY role_order ASC',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        const roleMap = {};
        roles.forEach(r => {
            roleMap[r.role_id] = r;
        });

        // Iniciar transacción
        await new Promise((resolve, reject) => {
            db.beginTransaction((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // Actualizar cada destinatario
            for (const assignment of assignments) {
                const role = roleMap[assignment.roleId];
                if (!role) {
                    throw new Error(`Rol ${assignment.roleId} no encontrado`);
                }

                const signingOrder = role.role_order;

                // Si firma secuencial está activada:
                // - Rol orden 1 puede firmar inmediatamente (can_sign_at = NOW())
                // - Otros roles no pueden firmar todavía (can_sign_at = NULL)
                const canSignAt = (signInOrder && role.role_order === 1) ? new Date() : null;

                await new Promise((resolve, reject) => {
                    db.query(
                        `UPDATE document_recipients
                         SET role_id = ?,
                             signing_order = ?,
                             can_sign_at = ?
                         WHERE recipient_id = ? AND document_id = ?`,
                        [assignment.roleId, signingOrder, canSignAt, assignment.recipientId, documentId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                console.log(`   ✅ Destinatario ${assignment.recipientId} → Rol "${role.role_name}" (orden ${signingOrder})`);
            }

            // Commit
            await new Promise((resolve, reject) => {
                db.commit((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log(`✅ [ROLES] ${assignments.length} destinatarios asignados`);

            res.json({
                success: true,
                assignedCount: assignments.length,
                signInOrder
            });

        } catch (error) {
            await new Promise((resolve) => {
                db.rollback(() => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('❌ [ROLES] Error al asignar destinatarios:', error);
        res.status(500).json({
            success: false,
            error: 'Error al asignar destinatarios a roles',
            details: error.message
        });
    }
}

/**
 * =============================================
 * 4. VALIDACIÓN Y CONTROL DE FIRMA
 * =============================================
 */

/**
 * Verificar si un destinatario puede firmar
 * GET /api/signatures/validate/:token
 */
async function validateSigningAccess(req, res) {
    const { token } = req.params;
    const db = req.app.locals.db;

    try {
        // Obtener información del destinatario y su rol
        const [recipients] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    dr.*,
                    sr.role_name,
                    sr.role_order,
                    sr.role_color,
                    dsc.sign_in_order,
                    d.title AS document_title
                 FROM document_recipients dr
                 JOIN documents d ON dr.document_id = d.document_id
                 LEFT JOIN signer_roles sr ON dr.role_id = sr.role_id
                 LEFT JOIN document_signing_config dsc ON dr.document_id = dsc.document_id
                 WHERE dr.token = ?`,
                [token],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (recipients.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Token inválido'
            });
        }

        const recipient = recipients[0];

        // Verificar si ya firmó
        if (recipient.status === 'completed') {
            return res.json({
                success: true,
                canSign: false,
                reason: 'already_signed',
                message: 'Ya has completado tu firma',
                recipient: {
                    name: recipient.name,
                    email: recipient.email,
                    roleName: recipient.role_name,
                    completedAt: recipient.completed_at
                }
            });
        }

        // Verificar si está rechazado
        if (recipient.status === 'rejected') {
            return res.json({
                success: true,
                canSign: false,
                reason: 'rejected',
                message: 'Has rechazado este documento'
            });
        }

        // Verificar orden de firma
        const signInOrder = recipient.sign_in_order === 1;
        const canSignAt = recipient.can_sign_at;
        const now = new Date();

        if (signInOrder && canSignAt && canSignAt > now) {
            // Todavía no es su turno
            return res.json({
                success: true,
                canSign: false,
                reason: 'waiting_for_turn',
                message: 'Debes esperar a que otros firmantes completen primero',
                canSignAt: canSignAt,
                roleName: recipient.role_name
            });
        }

        // Obtener campos que debe completar
        const [fields] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT * FROM document_fields
                 WHERE document_id = ? AND role_id = ?
                 ORDER BY page_number, y_position`,
                [recipient.document_id, recipient.role_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        // ¡Puede firmar!
        res.json({
            success: true,
            canSign: true,
            recipient: {
                recipientId: recipient.recipient_id,
                name: recipient.name,
                email: recipient.email,
                roleName: recipient.role_name,
                roleColor: recipient.role_color,
                roleOrder: recipient.role_order
            },
            document: {
                documentId: recipient.document_id,
                title: recipient.document_title
            },
            fields: fields.map(f => ({
                fieldId: f.field_id,
                type: f.field_type,
                page: f.page_number,
                x: parseFloat(f.x_position),
                y: parseFloat(f.y_position),
                width: parseFloat(f.width),
                height: parseFloat(f.height),
                required: f.required === 1,
                label: f.field_label
            })),
            signInOrder
        });

    } catch (error) {
        console.error('❌ [ROLES] Error al validar acceso:', error);
        res.status(500).json({
            success: false,
            error: 'Error al validar acceso de firma'
        });
    }
}

/**
 * =============================================
 * 5. COMPLETAR FIRMA Y ACTIVAR SIGUIENTE ROL
 * =============================================
 */

/**
 * Completar firma de un destinatario
 * POST /api/signatures/complete/:token
 *
 * Body: {
 *   fieldValues: [
 *     { fieldId: 1, type: 'signature', signaturePath: '/path/to/sig.png' },
 *     { fieldId: 2, type: 'text', textValue: 'John Doe' },
 *     { fieldId: 3, type: 'date', dateValue: '2025-01-15' }
 *   ]
 * }
 */
async function completeSignature(req, res) {
    const { token } = req.params;
    const { fieldValues } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const db = req.app.locals.db;

    console.log(`✍️ [ROLES] POST /api/signatures/complete/${token}`);
    console.log(`   Campos completados: ${fieldValues.length}`);

    try {
        // Obtener destinatario
        const [recipients] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    dr.*,
                    sr.role_order,
                    dsc.sign_in_order
                 FROM document_recipients dr
                 LEFT JOIN signer_roles sr ON dr.role_id = sr.role_id
                 LEFT JOIN document_signing_config dsc ON dr.document_id = dsc.document_id
                 WHERE dr.token = ?`,
                [token],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (recipients.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Token inválido'
            });
        }

        const recipient = recipients[0];

        if (recipient.status === 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Ya has completado este documento'
            });
        }

        // Iniciar transacción
        await new Promise((resolve, reject) => {
            db.beginTransaction((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // 1. Guardar valores de campos
            for (const fieldValue of fieldValues) {
                await new Promise((resolve, reject) => {
                    db.query(
                        `INSERT INTO field_values
                         (field_id, recipient_id, value_type, text_value, signature_path, date_value, ip_address, user_agent)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                         text_value = VALUES(text_value),
                         signature_path = VALUES(signature_path),
                         date_value = VALUES(date_value)`,
                        [
                            fieldValue.fieldId,
                            recipient.recipient_id,
                            fieldValue.type,
                            fieldValue.textValue || null,
                            fieldValue.signaturePath || null,
                            fieldValue.dateValue || null,
                            ipAddress,
                            userAgent
                        ],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }

            console.log(`   ✅ ${fieldValues.length} campos guardados`);

            // 2. Actualizar estado del destinatario
            await new Promise((resolve, reject) => {
                db.query(
                    `UPDATE document_recipients
                     SET status = 'completed',
                         completed_at = NOW(),
                         ip_address = ?,
                         user_agent = ?
                     WHERE recipient_id = ?`,
                    [ipAddress, userAgent, recipient.recipient_id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            console.log('   ✅ Destinatario marcado como completado');

            // 3. Registrar evento
            await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO signature_events
                     (document_id, recipient_id, role_id, event_type, ip_address, user_agent)
                     VALUES (?, ?, ?, 'document_signed', ?, ?)`,
                    [recipient.document_id, recipient.recipient_id, recipient.role_id, ipAddress, userAgent],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // 4. Si firma secuencial está activada, activar siguiente firmante
            if (recipient.sign_in_order === 1) {
                const nextRoleOrder = recipient.role_order + 1;

                // Intentar por signer_roles (envío manual con roles)
                const r1 = await new Promise((resolve, reject) => {
                    db.query(
                        `UPDATE document_recipients dr
                         JOIN signer_roles sr ON dr.role_id = sr.role_id
                         SET dr.can_sign_at = NOW(), dr.status = 'sent'
                         WHERE dr.document_id = ?
                         AND sr.role_order = ?
                         AND dr.status IN ('sent','waiting')
                         AND (dr.can_sign_at IS NULL OR dr.can_sign_at > NOW())`,
                        [recipient.document_id, nextRoleOrder],
                        (err, result) => { if (err) reject(err); else resolve(result); }
                    );
                });

                // Si no afectó filas (bulk-send usa signing_order sin role_id), activar por signing_order
                if (!r1 || r1.affectedRows === 0) {
                    await new Promise((resolve, reject) => {
                        db.query(
                            `UPDATE document_recipients
                             SET can_sign_at = NOW(), status = 'sent'
                             WHERE document_id = ?
                             AND signing_order = ?
                             AND role_id IS NULL
                             AND status IN ('sent','waiting')`,
                            [recipient.document_id, nextRoleOrder],
                            (err, result) => { if (err) reject(err); else resolve(result); }
                        );
                    });
                    console.log(`   🔓 Siguiente firmante (signing_order ${nextRoleOrder}) activado por bulk-send`);
                } else {
                    console.log(`   🔓 Siguiente rol (orden ${nextRoleOrder}) activado`);
                }
            }

            // 5. Verificar si el documento está completamente firmado
            const [remaining] = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT COUNT(*) as pending
                     FROM document_recipients
                     WHERE document_id = ? AND status != 'completed' AND status != 'rejected'`,
                    [recipient.document_id],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            const isComplete = remaining[0].pending === 0;

            if (isComplete) {
                // Registrar evento de documento completado
                await new Promise((resolve, reject) => {
                    db.query(
                        `INSERT INTO signature_events
                         (document_id, event_type, event_data)
                         VALUES (?, 'document_completed', JSON_OBJECT('completedAt', NOW()))`,
                        [recipient.document_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                console.log('   🎉 ¡Documento completamente firmado!');
            }

            // Commit
            await new Promise((resolve, reject) => {
                db.commit((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            console.log('✅ [ROLES] Firma completada exitosamente');

            res.json({
                success: true,
                message: 'Firma completada exitosamente',
                documentComplete: isComplete
            });

        } catch (error) {
            await new Promise((resolve) => {
                db.rollback(() => resolve());
            });
            throw error;
        }

    } catch (error) {
        console.error('❌ [ROLES] Error al completar firma:', error);
        res.status(500).json({
            success: false,
            error: 'Error al completar firma',
            details: error.message
        });
    }
}

/**
 * =============================================
 * 6. HELPER: CREAR ROLES AUTOMÁTICAMENTE
 * =============================================
 */

/**
 * Crear roles automáticamente basándose en número de destinatarios
 * Útil para simplificar el flujo cuando no se necesita personalización
 *
 * POST /api/documents/:documentId/roles/auto-create
 * Body: { recipientCount: 3 }
 */
async function autoCreateRoles(req, res) {
    const documentId = req.params.id; // Ruta: /:id/roles/auto-create
    const { recipientCount } = req.body;
    const userId = req.userId;
    const db = req.app.locals.db;

    try {
        const roles = [];
        for (let i = 0; i < recipientCount; i++) {
            roles.push({
                name: DEFAULT_ROLE_NAMES[i] || `Parte ${i + 1}`,
                order: i + 1,
                color: ROLE_COLORS[i % ROLE_COLORS.length],
                signInOrder: true
            });
        }

        req.body = {
            roles,
            signInOrder: false, // Por defecto paralelo
            allowParallel: true,
            reminderIntervalDays: 3
        };

        return createRoles(req, res);

    } catch (error) {
        console.error('❌ [ROLES] Error en auto-creación:', error);
        res.status(500).json({
            success: false,
            error: 'Error al crear roles automáticamente'
        });
    }
}

module.exports = {
    createRoles,
    getRoles,
    assignFieldsToRoles,
    assignRecipientsToRoles,
    validateSigningAccess,
    completeSignature,
    autoCreateRoles,
    ROLE_COLORS,
    DEFAULT_ROLE_NAMES
};
