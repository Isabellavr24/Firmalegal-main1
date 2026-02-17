/**
 * =============================================
 * CONTROLADOR DE EQUIPOS
 * API REST para gestión de equipos y miembros
 * =============================================
 */

const express = require('express');
const router = express.Router();
const { requireAuth, logActivity } = require('../middleware/auth');

// Helper: promisify db.query
function dbQuery(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

/**
 * GET /api/teams
 * Listar equipos del usuario (propios + donde es miembro)
 */
router.get('/', requireAuth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const teams = await dbQuery(db, `
            SELECT t.*,
                   u.first_name AS owner_first_name,
                   u.last_name AS owner_last_name,
                   tm.role AS my_role,
                   (SELECT COUNT(*) FROM team_members WHERE team_id = t.team_id) AS member_count
            FROM teams t
            INNER JOIN team_members tm ON t.team_id = tm.team_id AND tm.user_id = ?
            LEFT JOIN users u ON t.owner_id = u.user_id
            WHERE t.is_active = TRUE
            ORDER BY t.created_at DESC
        `, [req.userId]);

        res.json({ ok: true, success: true, data: teams });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener equipos', message: error.message });
    }
});

/**
 * GET /api/teams/:id
 * Obtener detalle de un equipo con sus miembros
 */
router.get('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);

    try {
        // Verificar que el usuario pertenece al equipo
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
        }

        // Obtener equipo
        const [team] = await dbQuery(db, `
            SELECT t.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
            FROM teams t
            LEFT JOIN users u ON t.owner_id = u.user_id
            WHERE t.team_id = ? AND t.is_active = TRUE
        `, [teamId]);

        if (!team) {
            return res.status(404).json({ ok: false, error: 'Equipo no encontrado' });
        }

        // Obtener miembros
        const members = await dbQuery(db, `
            SELECT tm.member_id, tm.user_id, tm.role, tm.joined_at,
                   u.first_name, u.last_name, u.email, u.avatar_url
            FROM team_members tm
            INNER JOIN users u ON tm.user_id = u.user_id
            WHERE tm.team_id = ?
            ORDER BY tm.role = 'owner' DESC, tm.joined_at ASC
        `, [teamId]);

        res.json({
            ok: true,
            success: true,
            data: { ...team, members, my_role: membership[0].role }
        });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener equipo', message: error.message });
    }
});

/**
 * POST /api/teams
 * Crear nuevo equipo
 * Body: { team_name, team_description?, team_color? }
 */
router.post('/', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const { team_name, team_description = '', team_color = '#7c3aed' } = req.body;

    if (!team_name || !team_name.trim()) {
        return res.status(400).json({ ok: false, error: 'El nombre del equipo es requerido' });
    }

    try {
        // Crear equipo
        const result = await dbQuery(db,
            'INSERT INTO teams (team_name, team_description, team_color, owner_id) VALUES (?, ?, ?, ?)',
            [team_name.trim(), team_description, team_color, req.userId]
        );

        const teamId = result.insertId;

        // Agregar al creador como owner del equipo
        await dbQuery(db,
            'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
            [teamId, req.userId, 'owner']
        );

        await logActivity(db, {
            userId: req.userId,
            action: 'create_team',
            entityType: 'team',
            entityId: teamId,
            details: { team_name },
            req
        });

        res.status(201).json({
            ok: true,
            success: true,
            message: 'Equipo creado exitosamente',
            data: { team_id: teamId, team_name: team_name.trim(), team_description, team_color }
        });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al crear equipo', message: error.message });
    }
});

/**
 * PUT /api/teams/:id
 * Actualizar equipo (solo owner o admin)
 */
router.put('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const { team_name, team_description, team_color } = req.body;

    try {
        // Verificar permisos
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para editar este equipo' });
        }

        const updates = [];
        const params = [];

        if (team_name !== undefined) { updates.push('team_name = ?'); params.push(team_name.trim()); }
        if (team_description !== undefined) { updates.push('team_description = ?'); params.push(team_description); }
        if (team_color !== undefined) { updates.push('team_color = ?'); params.push(team_color); }

        if (updates.length === 0) {
            return res.status(400).json({ ok: false, error: 'No hay cambios' });
        }

        params.push(teamId);
        await dbQuery(db, `UPDATE teams SET ${updates.join(', ')} WHERE team_id = ?`, params);

        res.json({ ok: true, success: true, message: 'Equipo actualizado' });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al actualizar equipo', message: error.message });
    }
});

/**
 * DELETE /api/teams/:id
 * Eliminar equipo (solo owner)
 */
router.delete('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0 || membership[0].role !== 'owner') {
            return res.status(403).json({ ok: false, error: 'Solo el propietario puede eliminar el equipo' });
        }

        // Desasociar carpetas y documentos del equipo
        await dbQuery(db, 'UPDATE folders SET team_id = NULL WHERE team_id = ?', [teamId]);
        await dbQuery(db, 'UPDATE documents SET team_id = NULL WHERE team_id = ?', [teamId]);

        // Soft delete
        await dbQuery(db, 'UPDATE teams SET is_active = FALSE WHERE team_id = ?', [teamId]);

        await logActivity(db, {
            userId: req.userId,
            action: 'delete_team',
            entityType: 'team',
            entityId: teamId,
            details: {},
            req
        });

        res.json({ ok: true, success: true, message: 'Equipo eliminado' });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al eliminar equipo', message: error.message });
    }
});

/**
 * POST /api/teams/:id/members
 * Agregar miembro al equipo
 * Body: { email, role? }
 */
router.post('/:id/members', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const { email, role = 'member' } = req.body;

    if (!email) {
        return res.status(400).json({ ok: false, error: 'El email es requerido' });
    }

    try {
        // Verificar permisos (owner o admin)
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
            return res.status(403).json({ ok: false, error: 'No tienes permisos para agregar miembros' });
        }

        // Buscar usuario por email
        const users = await dbQuery(db, 'SELECT user_id, first_name, last_name, email FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ ok: false, error: 'No se encontró un usuario con ese email' });
        }

        const targetUser = users[0];

        // Verificar que no sea ya miembro
        const existing = await dbQuery(db,
            'SELECT member_id FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, targetUser.user_id]
        );
        if (existing.length > 0) {
            return res.status(409).json({ ok: false, error: 'El usuario ya es miembro del equipo' });
        }

        // Agregar miembro
        await dbQuery(db,
            'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
            [teamId, targetUser.user_id, role]
        );

        await logActivity(db, {
            userId: req.userId,
            action: 'add_team_member',
            entityType: 'team',
            entityId: teamId,
            details: { added_user_id: targetUser.user_id, email, role },
            req
        });

        res.status(201).json({
            ok: true,
            success: true,
            message: `${targetUser.first_name} ${targetUser.last_name} agregado al equipo`,
            data: {
                user_id: targetUser.user_id,
                first_name: targetUser.first_name,
                last_name: targetUser.last_name,
                email: targetUser.email,
                role
            }
        });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al agregar miembro', message: error.message });
    }
});

/**
 * PUT /api/teams/:id/members/:userId
 * Cambiar rol de un miembro
 * Body: { role }
 */
router.put('/:id/members/:userId', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
        return res.status(400).json({ ok: false, error: 'Rol inválido (admin o member)' });
    }

    try {
        // Solo owner puede cambiar roles
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0 || membership[0].role !== 'owner') {
            return res.status(403).json({ ok: false, error: 'Solo el propietario puede cambiar roles' });
        }

        // No cambiar el rol del owner
        const target = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, targetUserId]
        );
        if (target.length === 0) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }
        if (target[0].role === 'owner') {
            return res.status(400).json({ ok: false, error: 'No se puede cambiar el rol del propietario' });
        }

        await dbQuery(db,
            'UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?',
            [role, teamId, targetUserId]
        );

        res.json({ ok: true, success: true, message: 'Rol actualizado' });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al actualizar rol', message: error.message });
    }
});

/**
 * DELETE /api/teams/:id/members/:userId
 * Remover miembro del equipo
 */
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);

    try {
        // El usuario puede removerse a sí mismo, o un admin/owner puede remover otros
        if (targetUserId !== req.userId) {
            const membership = await dbQuery(db,
                'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
                [teamId, req.userId]
            );
            if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para remover miembros' });
            }
        }

        // No remover al owner
        const target = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, targetUserId]
        );
        if (target.length === 0) {
            return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });
        }
        if (target[0].role === 'owner') {
            return res.status(400).json({ ok: false, error: 'No se puede remover al propietario del equipo' });
        }

        await dbQuery(db,
            'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, targetUserId]
        );

        await logActivity(db, {
            userId: req.userId,
            action: 'remove_team_member',
            entityType: 'team',
            entityId: teamId,
            details: { removed_user_id: targetUserId },
            req
        });

        res.json({ ok: true, success: true, message: 'Miembro removido del equipo' });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al remover miembro', message: error.message });
    }
});

/**
 * GET /api/teams/:id/documents
 * Obtener documentos compartidos en el equipo
 */
router.get('/:id/documents', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);

    try {
        // Verificar que el usuario pertenece al equipo
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
        }

        const documents = await dbQuery(db, `
            SELECT d.document_id, d.title, d.file_name, d.document_type, d.status,
                   d.is_template, d.created_at, d.folder_id,
                   u.first_name AS owner_first_name, u.last_name AS owner_last_name,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   f.folder_name
            FROM documents d
            LEFT JOIN users u ON d.owner_id = u.user_id
            LEFT JOIN folders f ON d.folder_id = f.folder_id
            WHERE d.team_id = ? AND d.status = 'active'
            ORDER BY d.created_at DESC
        `, [teamId]);

        res.json({ ok: true, success: true, data: documents });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener documentos del equipo', message: error.message });
    }
});

/**
 * GET /api/teams/:id/folders
 * Obtener carpetas del equipo
 */
router.get('/:id/folders', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);

    try {
        // Verificar que el usuario pertenece al equipo
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
        }

        const folders = await dbQuery(db, `
            SELECT f.folder_id, f.folder_name, f.folder_slug, f.folder_description, f.folder_color,
                   f.parent_id, f.folder_level, f.created_at,
                   u.first_name, u.last_name,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   COUNT(DISTINCT d.document_id) AS doc_count,
                   (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.folder_id AND sf.is_active = TRUE) AS subfolder_count
            FROM folders f
            LEFT JOIN users u ON f.user_id = u.user_id
            LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
            WHERE f.team_id = ? AND f.is_active = TRUE AND f.folder_level = 0
            GROUP BY f.folder_id
            ORDER BY f.created_at ASC
        `, [teamId]);

        const data = folders.map(f => ({
            id: f.folder_id,
            name: f.folder_name,
            slug: f.folder_slug,
            description: f.folder_description,
            color: f.folder_color,
            parent_id: f.parent_id,
            level: f.folder_level,
            item_count: (f.doc_count || 0) + (f.subfolder_count || 0),
            doc_count: f.doc_count || 0,
            subfolder_count: f.subfolder_count || 0,
            owner_name: f.owner_name,
            created_at: f.created_at
        }));

        res.json({ ok: true, success: true, data });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener carpetas del equipo', message: error.message });
    }
});

/**
 * POST /api/teams/:id/share-document
 * Compartir un documento existente con el equipo
 * Body: { document_id }
 */
router.post('/:id/share-document', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const { document_id } = req.body;

    if (!document_id) {
        return res.status(400).json({ ok: false, error: 'document_id es requerido' });
    }

    try {
        // Verificar que el usuario pertenece al equipo
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
        }

        // Verificar que el documento pertenece al usuario
        const docs = await dbQuery(db,
            'SELECT document_id, title FROM documents WHERE document_id = ? AND owner_id = ?',
            [document_id, req.userId]
        );
        if (docs.length === 0) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado o no tienes permisos' });
        }

        // Asignar team_id al documento
        await dbQuery(db,
            'UPDATE documents SET team_id = ? WHERE document_id = ?',
            [teamId, document_id]
        );

        await logActivity(db, {
            userId: req.userId,
            action: 'share_document_team',
            entityType: 'document',
            entityId: document_id,
            details: { team_id: teamId, title: docs[0].title },
            req
        });

        res.json({ ok: true, success: true, message: 'Documento compartido con el equipo' });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al compartir documento', message: error.message });
    }
});

/**
 * POST /api/teams/:id/share-folder
 * Compartir una carpeta con el equipo
 * Body: { folder_id }
 */
router.post('/:id/share-folder', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const { folder_id } = req.body;

    if (!folder_id) {
        return res.status(400).json({ ok: false, error: 'folder_id es requerido' });
    }

    try {
        // Verificar que el usuario pertenece al equipo
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
        }

        // Verificar que la carpeta pertenece al usuario
        const folders = await dbQuery(db,
            'SELECT folder_id, folder_name FROM folders WHERE folder_id = ? AND user_id = ?',
            [folder_id, req.userId]
        );
        if (folders.length === 0) {
            return res.status(404).json({ ok: false, error: 'Carpeta no encontrada o no tienes permisos' });
        }

        // Asignar team_id a la carpeta y sus documentos
        await dbQuery(db, 'UPDATE folders SET team_id = ? WHERE folder_id = ?', [teamId, folder_id]);
        await dbQuery(db, 'UPDATE documents SET team_id = ? WHERE folder_id = ?', [teamId, folder_id]);

        res.json({ ok: true, success: true, message: 'Carpeta compartida con el equipo' });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al compartir carpeta', message: error.message });
    }
});

/**
 * GET /api/teams/shared-with-me/documents
 * Obtener TODOS los documentos compartidos conmigo a través de mis equipos
 */
router.get('/shared-with-me/documents', requireAuth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const documents = await dbQuery(db, `
            SELECT d.document_id, d.title, d.file_name, d.document_type, d.status,
                   d.is_template, d.created_at, d.folder_id, d.team_id,
                   u.first_name AS owner_first_name, u.last_name AS owner_last_name,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   f.folder_name,
                   t.team_name, t.team_color
            FROM documents d
            INNER JOIN team_members tm ON d.team_id = tm.team_id AND tm.user_id = ?
            LEFT JOIN users u ON d.owner_id = u.user_id
            LEFT JOIN folders f ON d.folder_id = f.folder_id
            LEFT JOIN teams t ON d.team_id = t.team_id
            WHERE d.status = 'active' AND d.owner_id != ?
            ORDER BY d.created_at DESC
        `, [req.userId, req.userId]);

        res.json({ ok: true, success: true, data: documents });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener documentos compartidos', message: error.message });
    }
});

/**
 * GET /api/teams/shared-with-me/folders
 * Obtener TODAS las carpetas compartidas conmigo a través de mis equipos
 */
router.get('/shared-with-me/folders', requireAuth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        const folders = await dbQuery(db, `
            SELECT f.folder_id, f.folder_name, f.folder_slug, f.folder_description, f.folder_color,
                   f.parent_id, f.folder_level, f.created_at, f.team_id,
                   u.first_name, u.last_name,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   COUNT(DISTINCT d.document_id) AS doc_count,
                   (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.folder_id AND sf.is_active = TRUE) AS subfolder_count,
                   t.team_name, t.team_color
            FROM folders f
            INNER JOIN team_members tm ON f.team_id = tm.team_id AND tm.user_id = ?
            LEFT JOIN users u ON f.user_id = u.user_id
            LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
            LEFT JOIN teams t ON f.team_id = t.team_id
            WHERE f.is_active = TRUE AND f.folder_level = 0 AND f.user_id != ?
            GROUP BY f.folder_id
            ORDER BY f.created_at ASC
        `, [req.userId, req.userId]);

        const data = folders.map(f => ({
            id: f.folder_id,
            name: f.folder_name,
            slug: f.folder_slug,
            description: f.folder_description,
            color: f.folder_color,
            parent_id: f.parent_id,
            level: f.folder_level,
            item_count: (f.doc_count || 0) + (f.subfolder_count || 0),
            doc_count: f.doc_count || 0,
            subfolder_count: f.subfolder_count || 0,
            owner_name: f.owner_name,
            team_name: f.team_name,
            team_color: f.team_color,
            created_at: f.created_at
        }));

        res.json({ ok: true, success: true, data });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener carpetas compartidas', message: error.message });
    }
});

module.exports = router;
