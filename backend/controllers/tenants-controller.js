/**
 * =============================================
 * CONTROLADOR DE INQUILINOS (TENANTS)
 * Gestión de inquilinos y su baúl compartido
 * =============================================
 */

const express = require('express');
const router = express.Router();
const { requireAuth, logActivity } = require('../middleware/auth');

function dbQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

// =============================================
// GET /api/tenants
// Listar inquilinos donde soy owner o miembro
// =============================================
router.get('/', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const tenants = await dbQuery(db, `
            SELECT t.*,
                   u.first_name AS owner_first_name,
                   u.last_name  AS owner_last_name,
                   tm.role      AS my_role,
                   (SELECT COUNT(*) FROM tenant_members WHERE tenant_id = t.tenant_id) AS member_count,
                   (SELECT COUNT(*) FROM documents d WHERE d.tenant_id = t.tenant_id AND d.status = 'active') AS doc_count,
                   (SELECT COUNT(*) FROM folders f WHERE f.tenant_id = t.tenant_id AND f.is_active = TRUE) AS folder_count
            FROM tenants t
            INNER JOIN tenant_members tm ON t.tenant_id = tm.tenant_id AND tm.user_id = ?
            LEFT JOIN users u ON t.owner_id = u.user_id
            WHERE t.is_active = TRUE
            ORDER BY t.created_at DESC
        `, [req.userId]);

        res.json({ ok: true, success: true, data: tenants });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener inquilinos', message: error.message });
    }
});

// =============================================
// GET /api/tenants/metrics
// Métricas globales de todos mis inquilinos
// =============================================
router.get('/metrics', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const [metrics] = await dbQuery(db, `
            SELECT
                COALESCE(SUM(sub.doc_count), 0) AS total_docs,
                COALESCE(SUM(sub.tmpl_count), 0) AS total_templates,
                COALESCE(SUM(sub.user_count), 0) AS total_users,
                COUNT(DISTINCT sub.tenant_id) AS total_tenants
            FROM (
                SELECT t.tenant_id,
                       (SELECT COUNT(*) FROM documents d WHERE d.tenant_id = t.tenant_id AND d.status = 'active' AND d.is_template = FALSE) AS doc_count,
                       (SELECT COUNT(*) FROM documents d WHERE d.tenant_id = t.tenant_id AND d.status = 'active' AND d.is_template = TRUE) AS tmpl_count,
                       (SELECT COUNT(*) FROM tenant_members WHERE tenant_id = t.tenant_id) AS user_count
                FROM tenants t
                INNER JOIN tenant_members tm ON t.tenant_id = tm.tenant_id AND tm.user_id = ?
                WHERE t.is_active = TRUE
            ) sub
        `, [req.userId]);

        res.json({
            ok: true, success: true,
            data: {
                docs: metrics.total_docs || 0,
                templates: metrics.total_templates || 0,
                users: metrics.total_users || 0,
                tenants: metrics.total_tenants || 0
            }
        });
    } catch (error) {
        console.error('[TENANTS] Error metrics:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener métricas', message: error.message });
    }
});

// =============================================
// GET /api/tenants/:id
// Detalle de un inquilino con miembros
// =============================================
router.get('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este inquilino' });
        }

        const rows = await dbQuery(db, `
            SELECT t.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
            FROM tenants t
            LEFT JOIN users u ON t.owner_id = u.user_id
            WHERE t.tenant_id = ? AND t.is_active = TRUE
        `, [tenantId]);

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Inquilino no encontrado' });
        }

        const members = await dbQuery(db, `
            SELECT tm.member_id, tm.user_id, tm.role, tm.joined_at,
                   u.first_name, u.last_name, u.email, u.avatar_url
            FROM tenant_members tm
            INNER JOIN users u ON tm.user_id = u.user_id
            WHERE tm.tenant_id = ?
            ORDER BY tm.role = 'owner' DESC, tm.joined_at ASC
        `, [tenantId]);

        res.json({
            ok: true, success: true,
            data: { ...rows[0], members, my_role: membership[0].role }
        });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener inquilino', message: error.message });
    }
});

// =============================================
// POST /api/tenants
// Crear nuevo inquilino
// =============================================
router.post('/', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const {
        tenant_name, tenant_slug, tenant_email = '',
        tenant_color = '#7c3aed', lang = 'es',
        timezone = 'America/Bogota',
        inherit_storage = true, inherit_brand = true
    } = req.body;

    if (!tenant_name || !tenant_name.trim()) {
        return res.status(400).json({ ok: false, error: 'El nombre es requerido' });
    }
    if (!tenant_slug || !tenant_slug.trim()) {
        return res.status(400).json({ ok: false, error: 'El subdominio/slug es requerido' });
    }

    const slug = tenant_slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

    try {
        // Verificar slug único
        const existing = await dbQuery(db,
            'SELECT tenant_id FROM tenants WHERE tenant_slug = ?', [slug]
        );
        if (existing.length > 0) {
            return res.status(409).json({ ok: false, error: 'El slug ya está en uso, elige otro' });
        }

        const result = await dbQuery(db,
            `INSERT INTO tenants (tenant_name, tenant_slug, tenant_email, tenant_color, lang, timezone, inherit_storage, inherit_brand, owner_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tenant_name.trim(), slug, tenant_email, tenant_color, lang, timezone,
             inherit_storage ? 1 : 0, inherit_brand ? 1 : 0, req.userId]
        );

        const tenantId = result.insertId;

        // Agregar al creador como owner
        await dbQuery(db,
            'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)',
            [tenantId, req.userId, 'owner']
        );

        await logActivity(db, {
            userId: req.userId, action: 'create_tenant',
            entityType: 'tenant', entityId: tenantId,
            details: { tenant_name, tenant_slug: slug }, req
        });

        res.status(201).json({
            ok: true, success: true,
            message: 'Inquilino creado exitosamente',
            data: { tenant_id: tenantId, tenant_name: tenant_name.trim(), tenant_slug: slug }
        });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al crear inquilino', message: error.message });
    }
});

// =============================================
// PUT /api/tenants/:id
// Actualizar inquilino
// =============================================
router.put('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);
    const { tenant_name, tenant_email, tenant_color, lang, timezone, inherit_storage, inherit_brand } = req.body;

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para editar este inquilino' });
        }

        const updates = [], params = [];
        if (tenant_name !== undefined) { updates.push('tenant_name = ?'); params.push(tenant_name.trim()); }
        if (tenant_email !== undefined) { updates.push('tenant_email = ?'); params.push(tenant_email); }
        if (tenant_color !== undefined) { updates.push('tenant_color = ?'); params.push(tenant_color); }
        if (lang !== undefined) { updates.push('lang = ?'); params.push(lang); }
        if (timezone !== undefined) { updates.push('timezone = ?'); params.push(timezone); }
        if (inherit_storage !== undefined) { updates.push('inherit_storage = ?'); params.push(inherit_storage ? 1 : 0); }
        if (inherit_brand !== undefined) { updates.push('inherit_brand = ?'); params.push(inherit_brand ? 1 : 0); }

        if (updates.length === 0) return res.status(400).json({ ok: false, error: 'No hay cambios' });

        params.push(tenantId);
        await dbQuery(db, `UPDATE tenants SET ${updates.join(', ')} WHERE tenant_id = ?`, params);

        res.json({ ok: true, success: true, message: 'Inquilino actualizado' });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al actualizar inquilino', message: error.message });
    }
});

// =============================================
// DELETE /api/tenants/:id
// Eliminar inquilino (solo owner)
// =============================================
router.delete('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0 || membership[0].role !== 'owner') {
            return res.status(403).json({ ok: false, error: 'Solo el propietario puede eliminar el inquilino' });
        }

        // Desasociar folders y documents
        await dbQuery(db, 'UPDATE folders SET tenant_id = NULL WHERE tenant_id = ?', [tenantId]);
        await dbQuery(db, 'UPDATE documents SET tenant_id = NULL WHERE tenant_id = ?', [tenantId]);

        // Soft delete
        await dbQuery(db, 'UPDATE tenants SET is_active = FALSE WHERE tenant_id = ?', [tenantId]);

        res.json({ ok: true, success: true, message: 'Inquilino eliminado' });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al eliminar inquilino', message: error.message });
    }
});

// =============================================
// POST /api/tenants/:id/logo
// Subir/actualizar logo del inquilino
// =============================================
router.post('/:id/logo', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);
    const { logo_url } = req.body; // base64 data URL o URL de imagen

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
            return res.status(403).json({ ok: false, error: 'Sin permisos' });
        }

        await dbQuery(db, 'UPDATE tenants SET logo_url = ? WHERE tenant_id = ?', [logo_url, tenantId]);

        res.json({ ok: true, success: true, message: 'Logo actualizado' });
    } catch (error) {
        console.error('[TENANTS] Error logo:', error);
        res.status(500).json({ ok: false, error: 'Error al actualizar logo', message: error.message });
    }
});

// =============================================
// POST /api/tenants/:id/members
// Agregar miembro por email
// =============================================
router.post('/:id/members', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);
    const { email, role = 'member' } = req.body;

    if (!email) return res.status(400).json({ ok: false, error: 'El email es requerido' });

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para agregar miembros' });
        }

        const users = await dbQuery(db,
            'SELECT user_id, first_name, last_name, email FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );
        if (users.length === 0) {
            return res.status(404).json({ ok: false, error: 'No se encontró un usuario con ese email' });
        }

        const target = users[0];
        const existing = await dbQuery(db,
            'SELECT member_id FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, target.user_id]
        );
        if (existing.length > 0) {
            return res.status(409).json({ ok: false, error: 'El usuario ya es miembro de este inquilino' });
        }

        await dbQuery(db,
            'INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)',
            [tenantId, target.user_id, role]
        );

        res.status(201).json({
            ok: true, success: true,
            message: `${target.first_name} ${target.last_name} agregado`,
            data: { user_id: target.user_id, first_name: target.first_name, last_name: target.last_name, email: target.email, role }
        });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al agregar miembro', message: error.message });
    }
});

// =============================================
// DELETE /api/tenants/:id/members/:userId
// Remover miembro
// =============================================
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);

    try {
        if (targetUserId !== req.userId) {
            const membership = await dbQuery(db,
                'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
                [tenantId, req.userId]
            );
            if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
                return res.status(403).json({ ok: false, error: 'Sin permisos para remover miembros' });
            }
        }

        const target = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, targetUserId]
        );
        if (target.length === 0) return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        if (target[0].role === 'owner') return res.status(400).json({ ok: false, error: 'No se puede remover al propietario' });

        await dbQuery(db, 'DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [tenantId, targetUserId]);
        res.json({ ok: true, success: true, message: 'Miembro removido' });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al remover miembro', message: error.message });
    }
});

// =============================================
// GET /api/tenants/:id/vault
// Baúl compartido del inquilino: carpetas + documentos
// =============================================
router.get('/:id/vault', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este inquilino' });
        }

        const [folders, documents] = await Promise.all([
            dbQuery(db, `
                SELECT f.folder_id AS id, f.folder_name AS name, f.folder_slug AS slug,
                       f.folder_color AS color, f.folder_description AS description,
                       f.parent_id, f.folder_level AS level, f.created_at,
                       CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                       COUNT(DISTINCT d.document_id) AS doc_count
                FROM folders f
                LEFT JOIN users u ON f.user_id = u.user_id
                LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
                WHERE f.tenant_id = ? AND f.is_active = TRUE AND f.folder_level = 0
                GROUP BY f.folder_id
                ORDER BY f.created_at ASC
            `, [tenantId]),
            dbQuery(db, `
                SELECT d.document_id, d.title, d.document_type, d.status,
                       d.is_template, d.created_at, d.folder_id,
                       CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                       f.folder_name
                FROM documents d
                LEFT JOIN users u ON d.owner_id = u.user_id
                LEFT JOIN folders f ON d.folder_id = f.folder_id
                WHERE d.tenant_id = ? AND d.status = 'active' AND d.folder_id IS NULL
                ORDER BY d.created_at DESC
            `, [tenantId])
        ]);

        res.json({ ok: true, success: true, data: { folders, documents } });
    } catch (error) {
        console.error('[TENANTS] Error vault:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener baúl', message: error.message });
    }
});

// =============================================
// POST /api/tenants/:id/share-folder
// Compartir carpeta existente con el inquilino
// =============================================
router.post('/:id/share-folder', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);
    const { folder_id } = req.body;

    if (!folder_id) return res.status(400).json({ ok: false, error: 'folder_id es requerido' });

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'Sin acceso al inquilino' });
        }

        const folders = await dbQuery(db,
            'SELECT folder_id, folder_name FROM folders WHERE folder_id = ? AND user_id = ?',
            [folder_id, req.userId]
        );
        if (folders.length === 0) {
            return res.status(404).json({ ok: false, error: 'Carpeta no encontrada o sin permisos' });
        }

        await dbQuery(db, 'UPDATE folders SET tenant_id = ? WHERE folder_id = ?', [tenantId, folder_id]);
        await dbQuery(db, 'UPDATE documents SET tenant_id = ? WHERE folder_id = ?', [tenantId, folder_id]);

        res.json({ ok: true, success: true, message: 'Carpeta compartida con el inquilino' });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al compartir carpeta', message: error.message });
    }
});

// =============================================
// POST /api/tenants/:id/share-document
// Compartir documento existente con el inquilino
// =============================================
router.post('/:id/share-document', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const tenantId = parseInt(req.params.id);
    const { document_id } = req.body;

    if (!document_id) return res.status(400).json({ ok: false, error: 'document_id es requerido' });

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
            [tenantId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'Sin acceso al inquilino' });
        }

        const docs = await dbQuery(db,
            'SELECT document_id FROM documents WHERE document_id = ? AND owner_id = ?',
            [document_id, req.userId]
        );
        if (docs.length === 0) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado o sin permisos' });
        }

        await dbQuery(db, 'UPDATE documents SET tenant_id = ? WHERE document_id = ?', [tenantId, document_id]);
        res.json({ ok: true, success: true, message: 'Documento compartido con el inquilino' });
    } catch (error) {
        console.error('[TENANTS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al compartir documento', message: error.message });
    }
});

// =============================================
// GET /api/tenants/shared-with-me/vault
// Todo el contenido compartido conmigo vía inquilinos
// =============================================
router.get('/shared-with-me/vault', requireAuth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const [folders, documents] = await Promise.all([
            dbQuery(db, `
                SELECT f.folder_id AS id, f.folder_name AS name, f.folder_slug AS slug,
                       f.folder_color AS color, f.created_at, f.tenant_id,
                       CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                       t.tenant_name, t.tenant_color,
                       COUNT(DISTINCT d.document_id) AS doc_count
                FROM folders f
                INNER JOIN tenant_members tm ON f.tenant_id = tm.tenant_id AND tm.user_id = ?
                LEFT JOIN users u ON f.user_id = u.user_id
                LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
                LEFT JOIN tenants t ON f.tenant_id = t.tenant_id
                WHERE f.is_active = TRUE AND f.folder_level = 0 AND f.user_id != ?
                GROUP BY f.folder_id
                ORDER BY t.tenant_name, f.created_at ASC
            `, [req.userId, req.userId]),
            dbQuery(db, `
                SELECT d.document_id, d.title, d.document_type, d.created_at, d.tenant_id,
                       CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                       t.tenant_name, t.tenant_color
                FROM documents d
                INNER JOIN tenant_members tm ON d.tenant_id = tm.tenant_id AND tm.user_id = ?
                LEFT JOIN users u ON d.owner_id = u.user_id
                LEFT JOIN tenants t ON d.tenant_id = t.tenant_id
                WHERE d.status = 'active' AND d.owner_id != ?
                ORDER BY d.created_at DESC
            `, [req.userId, req.userId])
        ]);

        res.json({ ok: true, success: true, data: { folders, documents } });
    } catch (error) {
        console.error('[TENANTS] Error shared vault:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener baúl compartido', message: error.message });
    }
});

module.exports = router;
