/**
 * =============================================
 * CONTROLADOR DE EQUIPOS E INQUILINOS
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
 * Listar todos los equipos (Superadmin ve todos, otros ven solo los suyos)
 */
router.get('/', requireAuth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        // Verificar si es Superadministrador
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        const isSuperAdmin = userRole && userRole.role_name === 'Superadministrador';

        let teams;
        if (isSuperAdmin) {
            // Superadmin ve todos los equipos activos
            teams = await dbQuery(db, `
                SELECT t.*,
                       u.first_name AS owner_first_name,
                       u.last_name AS owner_last_name,
                       'owner' AS my_role,
                       (SELECT COUNT(*) FROM team_members WHERE team_id = t.team_id) AS member_count
                FROM teams t
                LEFT JOIN users u ON t.owner_id = u.user_id
                WHERE t.is_active = TRUE
                ORDER BY t.created_at DESC
            `, []);
        } else {
            // Otros ven solo equipos donde son miembros
            teams = await dbQuery(db, `
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
        }

        res.json({ ok: true, success: true, data: teams });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener equipos', message: error.message });
    }
});

/**
 * GET /api/teams/members/search?q=
 * Buscar usuarios para agregar a un equipo (solo Superadmin)
 */
router.get('/members/search', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const q = (req.query.q || '').trim();

    try {
        // Solo Superadmin puede buscar
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        if (!userRole || userRole.role_name !== 'Superadministrador') {
            return res.status(403).json({ ok: false, error: 'Solo el Superadministrador puede buscar usuarios' });
        }

        if (!q || q.length < 2) {
            return res.json({ ok: true, data: [] });
        }

        const searchTerm = `%${q}%`;
        const users = await dbQuery(db, `
            SELECT u.user_id, u.first_name, u.last_name, u.email, u.avatar_url,
                   t.team_name AS current_team_name, tm.team_id AS current_team_id
            FROM users u
            LEFT JOIN team_members tm ON tm.user_id = u.user_id
            LEFT JOIN teams t ON t.team_id = tm.team_id AND t.is_active = TRUE
            WHERE u.is_active = 1
              AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)
              AND u.user_id != ?
            ORDER BY u.first_name ASC
            LIMIT 20
        `, [searchTerm, searchTerm, searchTerm, req.userId]);

        res.json({ ok: true, data: users });
    } catch (error) {
        console.error('[TEAMS] Error search:', error);
        res.status(500).json({ ok: false, error: 'Error al buscar usuarios', message: error.message });
    }
});

/**
 * GET /api/teams/shared-with-me/vault
 * Obtener carpetas y documentos de compañeros de equipo (no propios)
 */
router.get('/shared-with-me/vault', requireAuth, async (req, res) => {
    const db = req.app.locals.db;

    try {
        // Obtener el equipo del usuario actual
        const myTeams = await dbQuery(db,
            'SELECT team_id FROM team_members WHERE user_id = ?',
            [req.userId]
        );

        if (myTeams.length === 0) {
            return res.json({ ok: true, success: true, data: { folders: [], documents: [] } });
        }

        // Obtener los user_id de los compañeros de equipo (excluyendo al usuario actual)
        const teamMemberRows = await dbQuery(db, `
            SELECT DISTINCT tm2.user_id, t.team_name, t.team_color
            FROM team_members tm1
            JOIN team_members tm2 ON tm2.team_id = tm1.team_id
            JOIN teams t ON t.team_id = tm1.team_id AND t.is_active = TRUE
            WHERE tm1.user_id = ? AND tm2.user_id != ?
        `, [req.userId, req.userId]);

        if (teamMemberRows.length === 0) {
            return res.json({ ok: true, success: true, data: { folders: [], documents: [] } });
        }

        const memberIds = teamMemberRows.map(r => r.user_id);
        const memberPlaceholders = memberIds.map(() => '?').join(',');

        // Carpetas de otros miembros del mismo equipo
        const folders = await dbQuery(db, `
            SELECT f.folder_id, f.folder_name, f.folder_slug, f.folder_description, f.folder_color,
                   f.parent_id, f.folder_level, f.created_at,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   COUNT(DISTINCT d.document_id) AS doc_count,
                   (SELECT t2.team_name FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = f.user_id AND t2.is_active = TRUE LIMIT 1) AS team_name,
                   (SELECT t2.team_color FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = f.user_id AND t2.is_active = TRUE LIMIT 1) AS team_color
            FROM folders f
            INNER JOIN users u ON f.user_id = u.user_id
            LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
            WHERE f.user_id IN (${memberPlaceholders})
              AND f.is_active = TRUE
              AND f.folder_level = 0
            GROUP BY f.folder_id
            ORDER BY f.created_at ASC
        `, memberIds);

        // Documentos sin carpeta de otros miembros del mismo equipo
        const documents = await dbQuery(db, `
            SELECT d.document_id, d.title, d.file_name, d.document_type, d.status,
                   d.is_template, d.created_at, d.folder_id,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   f.folder_name,
                   (SELECT t2.team_name FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = d.owner_id AND t2.is_active = TRUE LIMIT 1) AS team_name,
                   (SELECT t2.team_color FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = d.owner_id AND t2.is_active = TRUE LIMIT 1) AS team_color
            FROM documents d
            INNER JOIN users u ON d.owner_id = u.user_id
            LEFT JOIN folders f ON d.folder_id = f.folder_id
            WHERE d.owner_id IN (${memberPlaceholders})
              AND d.status = 'active'
              AND (d.folder_id IS NULL OR d.folder_id = 0)
            ORDER BY d.created_at DESC
        `, memberIds);

        const foldersData = folders.map(f => ({
            id: f.folder_id,
            name: f.folder_name,
            slug: f.folder_slug,
            description: f.folder_description,
            color: f.folder_color,
            parent_id: f.parent_id,
            level: f.folder_level,
            doc_count: f.doc_count || 0,
            owner_name: f.owner_name,
            team_name: f.team_name,
            team_color: f.team_color,
            created_at: f.created_at
        }));

        res.json({ ok: true, success: true, data: { folders: foldersData, documents } });
    } catch (error) {
        console.error('[TEAMS] Error shared-with-me:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener contenido compartido', message: error.message });
    }
});

/**
 * GET /api/teams/:id
 * Obtener detalle de un equipo con sus miembros (Superadmin puede ver cualquiera)
 */
router.get('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);

    try {
        // Verificar acceso
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        const isSuperAdmin = userRole && userRole.role_name === 'Superadministrador';

        if (!isSuperAdmin) {
            const membership = await dbQuery(db,
                'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
                [teamId, req.userId]
            );
            if (membership.length === 0) {
                return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
            }
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
                   u.first_name, u.last_name, u.email, u.avatar_url,
                   r.role_name
            FROM team_members tm
            INNER JOIN users u ON tm.user_id = u.user_id
            LEFT JOIN roles r ON u.role_id = r.role_id
            WHERE tm.team_id = ?
            ORDER BY tm.role = 'owner' DESC, tm.joined_at ASC
        `, [teamId]);

        // Estadísticas del equipo: contar docs/carpetas de los miembros del equipo (excluye al superadmin/owner)
        const memberIds = members.map(m => m.user_id);

        let totalDocs = 0;
        let totalFolders = 0;

        if (memberIds.length > 0) {
            const placeholders = memberIds.map(() => '?').join(',');
            const [dStats] = await dbQuery(db,
                `SELECT COUNT(*) AS total_docs FROM documents WHERE owner_id IN (${placeholders}) AND status = "active"`,
                memberIds
            );
            const [fStats] = await dbQuery(db,
                `SELECT COUNT(*) AS total_folders FROM folders WHERE user_id IN (${placeholders}) AND is_active = TRUE`,
                memberIds
            );
            totalDocs = dStats?.total_docs || 0;
            totalFolders = fStats?.total_folders || 0;
        }

        // Si el superadmin no es miembro del equipo, su rol es 'admin' (puede gestionar pero no aparece como dueño)
        const myRole = members.find(m => m.user_id === req.userId)?.role || (isSuperAdmin ? 'admin' : null);

        res.json({
            ok: true,
            success: true,
            data: {
                ...team,
                members,
                my_role: myRole,
                stats: {
                    members: members.length,
                    documents: totalDocs,
                    folders: totalFolders
                }
            }
        });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener equipo', message: error.message });
    }
});

/**
 * POST /api/teams
 * Crear nuevo equipo (solo Superadmin)
 * Body: { team_name, team_description?, team_color? }
 */
router.post('/', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const { team_name, team_description = '', team_color = '#2a0d31' } = req.body;

    if (!team_name || !team_name.trim()) {
        return res.status(400).json({ ok: false, error: 'El nombre del equipo es requerido' });
    }

    try {
        // Solo Superadmin puede crear equipos
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        if (!userRole || userRole.role_name !== 'Superadministrador') {
            return res.status(403).json({ ok: false, error: 'Solo el Superadministrador puede crear equipos' });
        }

        // Crear equipo
        const result = await dbQuery(db,
            'INSERT INTO teams (team_name, team_description, team_color, owner_id) VALUES (?, ?, ?, ?)',
            [team_name.trim(), team_description, team_color, req.userId]
        );

        const teamId = result.insertId;

        // El superadministrador NO se agrega como miembro del equipo ni comparte sus documentos.
        // El equipo es para los inquilinos — el superadmin solo lo administra externamente.

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
 * Actualizar equipo (Superadmin o owner)
 */
router.put('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const { team_name, team_description, team_color } = req.body;

    try {
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        const isSuperAdmin = userRole && userRole.role_name === 'Superadministrador';

        if (!isSuperAdmin) {
            const membership = await dbQuery(db,
                'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
                [teamId, req.userId]
            );
            if (membership.length === 0 || !['owner', 'admin'].includes(membership[0].role)) {
                return res.status(403).json({ ok: false, error: 'No tienes permisos para editar este equipo' });
            }
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
 * Eliminar equipo (solo Superadmin)
 */
router.delete('/:id', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);

    try {
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        if (!userRole || userRole.role_name !== 'Superadministrador') {
            return res.status(403).json({ ok: false, error: 'Solo el Superadministrador puede eliminar equipos' });
        }

        // Desasociar carpetas y documentos del equipo
        await dbQuery(db, 'UPDATE folders SET team_id = NULL WHERE team_id = ?', [teamId]);
        await dbQuery(db, 'UPDATE documents SET team_id = NULL WHERE team_id = ?', [teamId]);

        // Eliminar todos los miembros del equipo para que queden libres
        await dbQuery(db, 'DELETE FROM team_members WHERE team_id = ?', [teamId]);

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
 * Agregar inquilino (miembro) al equipo — auto-comparte sus documentos y carpetas
 * Body: { user_id, role? }  (acepta user_id directo para el buscador)
 */
router.post('/:id/members', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const { user_id, email, role = 'member' } = req.body;

    try {
        // Solo Superadmin puede agregar inquilinos
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        if (!userRole || userRole.role_name !== 'Superadministrador') {
            return res.status(403).json({ ok: false, error: 'Solo el Superadministrador puede agregar inquilinos' });
        }

        // Verificar que el equipo existe
        const [team] = await dbQuery(db, 'SELECT team_id, team_name FROM teams WHERE team_id = ? AND is_active = TRUE', [teamId]);
        if (!team) {
            return res.status(404).json({ ok: false, error: 'Equipo no encontrado' });
        }

        // Buscar usuario por user_id o email
        let targetUser;
        if (user_id) {
            const users = await dbQuery(db, 'SELECT user_id, first_name, last_name, email FROM users WHERE user_id = ? AND is_active = 1', [user_id]);
            targetUser = users[0];
        } else if (email) {
            const users = await dbQuery(db, 'SELECT user_id, first_name, last_name, email FROM users WHERE email = ? AND is_active = 1', [email]);
            targetUser = users[0];
        }

        if (!targetUser) {
            return res.status(404).json({ ok: false, error: 'No se encontró el usuario' });
        }

        // El superadministrador no puede ser agregado como inquilino de un equipo
        const [targetRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [targetUser.user_id]
        );
        if (targetRole && targetRole.role_name === 'Superadministrador') {
            return res.status(400).json({ ok: false, error: 'El Superadministrador no puede ser agregado como inquilino de un equipo' });
        }

        // Verificar que no sea ya miembro de ALGÚN equipo
        const existingTeam = await dbQuery(db,
            'SELECT tm.team_id, t.team_name FROM team_members tm INNER JOIN teams t ON t.team_id = tm.team_id WHERE tm.user_id = ? AND t.is_active = TRUE',
            [targetUser.user_id]
        );
        if (existingTeam.length > 0) {
            return res.status(409).json({
                ok: false,
                error: `El usuario ya pertenece al equipo "${existingTeam[0].team_name}". Un usuario solo puede pertenecer a un equipo.`
            });
        }

        // Agregar miembro
        await dbQuery(db,
            'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
            [teamId, targetUser.user_id, role]
        );

        // AUTO-SHARE: asignar team_id a todos los folders y documents del nuevo inquilino
        await dbQuery(db,
            'UPDATE folders SET team_id = ? WHERE user_id = ? AND team_id IS NULL AND is_active = TRUE',
            [teamId, targetUser.user_id]
        );
        await dbQuery(db,
            'UPDATE documents SET team_id = ? WHERE owner_id = ? AND team_id IS NULL AND status = "active"',
            [teamId, targetUser.user_id]
        );

        await logActivity(db, {
            userId: req.userId,
            action: 'add_team_member',
            entityType: 'team',
            entityId: teamId,
            details: { added_user_id: targetUser.user_id, email: targetUser.email, role },
            req
        });

        res.status(201).json({
            ok: true,
            success: true,
            message: `${targetUser.first_name} ${targetUser.last_name} agregado como inquilino del equipo`,
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
        res.status(500).json({ ok: false, error: 'Error al agregar inquilino', message: error.message });
    }
});

/**
 * DELETE /api/teams/:id/members/:userId
 * Remover inquilino del equipo — quita team_id de sus folders/docs
 */
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);

    try {
        // Solo Superadmin puede remover inquilinos
        const [userRole] = await dbQuery(db,
            'SELECT r.role_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?',
            [req.userId]
        );
        if (!userRole || userRole.role_name !== 'Superadministrador') {
            return res.status(403).json({ ok: false, error: 'Solo el Superadministrador puede remover inquilinos' });
        }

        // Verificar que el miembro existe
        const target = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, targetUserId]
        );
        if (target.length === 0) {
            return res.status(404).json({ ok: false, error: 'Inquilino no encontrado en este equipo' });
        }

        // Eliminar miembro
        await dbQuery(db,
            'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, targetUserId]
        );

        // Remover team_id de sus folders y documents
        await dbQuery(db,
            'UPDATE folders SET team_id = NULL WHERE user_id = ? AND team_id = ?',
            [targetUserId, teamId]
        );
        await dbQuery(db,
            'UPDATE documents SET team_id = NULL WHERE owner_id = ? AND team_id = ?',
            [targetUserId, teamId]
        );

        await logActivity(db, {
            userId: req.userId,
            action: 'remove_team_member',
            entityType: 'team',
            entityId: teamId,
            details: { removed_user_id: targetUserId },
            req
        });

        res.json({ ok: true, success: true, message: 'Inquilino removido del equipo' });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al remover inquilino', message: error.message });
    }
});

/**
 * GET /api/teams/:id/documents
 * Obtener documentos del equipo
 */
router.get('/:id/documents', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    const teamId = parseInt(req.params.id);

    try {
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
        }

        // Obtener miembros del equipo para buscar por owner_id
        const teamMembers = await dbQuery(db,
            'SELECT user_id FROM team_members WHERE team_id = ?', [teamId]
        );
        const memberIds = teamMembers.map(m => m.user_id);
        if (memberIds.length === 0) {
            return res.json({ ok: true, success: true, data: [] });
        }
        const memberPlaceholders = memberIds.map(() => '?').join(',');

        const documents = await dbQuery(db, `
            SELECT d.document_id, d.title, d.file_name, d.document_type, d.status,
                   d.is_template, d.created_at, d.folder_id,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   f.folder_name
            FROM documents d
            LEFT JOIN users u ON d.owner_id = u.user_id
            LEFT JOIN folders f ON d.folder_id = f.folder_id
            WHERE d.owner_id IN (${memberPlaceholders}) AND d.status = 'active'
            ORDER BY d.created_at DESC
        `, memberIds);

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
        const membership = await dbQuery(db,
            'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
            [teamId, req.userId]
        );
        if (membership.length === 0) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este equipo' });
        }

        // Obtener miembros del equipo para buscar por user_id
        const teamMembersF = await dbQuery(db,
            'SELECT user_id FROM team_members WHERE team_id = ?', [teamId]
        );
        const memberIdsF = teamMembersF.map(m => m.user_id);
        if (memberIdsF.length === 0) {
            return res.json({ ok: true, success: true, data: [] });
        }
        const memberPlaceholdersF = memberIdsF.map(() => '?').join(',');

        const folders = await dbQuery(db, `
            SELECT f.folder_id, f.folder_name, f.folder_slug, f.folder_description, f.folder_color,
                   f.parent_id, f.folder_level, f.created_at,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   COUNT(DISTINCT d.document_id) AS doc_count
            FROM folders f
            LEFT JOIN users u ON f.user_id = u.user_id
            LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
            WHERE f.user_id IN (${memberPlaceholdersF}) AND f.is_active = TRUE AND f.folder_level = 0
            GROUP BY f.folder_id
            ORDER BY f.created_at ASC
        `, memberIdsF);

        const data = folders.map(f => ({
            id: f.folder_id, name: f.folder_name, slug: f.folder_slug,
            description: f.folder_description, color: f.folder_color,
            parent_id: f.parent_id, level: f.folder_level,
            doc_count: f.doc_count || 0, owner_name: f.owner_name, created_at: f.created_at
        }));

        res.json({ ok: true, success: true, data });
    } catch (error) {
        console.error('[TEAMS] Error:', error);
        res.status(500).json({ ok: false, error: 'Error al obtener carpetas del equipo', message: error.message });
    }
});

/**
 * GET /api/teams/shared-with-me/documents  (legacy — mantenido por compatibilidad)
 */
router.get('/shared-with-me/documents', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const companionRows = await dbQuery(db, `
            SELECT DISTINCT tm2.user_id FROM team_members tm1
            JOIN team_members tm2 ON tm2.team_id = tm1.team_id
            WHERE tm1.user_id = ? AND tm2.user_id != ?
        `, [req.userId, req.userId]);
        if (companionRows.length === 0) return res.json({ ok: true, success: true, data: [] });

        const memberIds = companionRows.map(r => r.user_id);
        const placeholders = memberIds.map(() => '?').join(',');

        const documents = await dbQuery(db, `
            SELECT d.document_id, d.title, d.file_name, d.document_type, d.status,
                   d.is_template, d.created_at, d.folder_id,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   f.folder_name,
                   (SELECT t2.team_name FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = d.owner_id AND t2.is_active = TRUE LIMIT 1) AS team_name,
                   (SELECT t2.team_color FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = d.owner_id AND t2.is_active = TRUE LIMIT 1) AS team_color
            FROM documents d
            LEFT JOIN users u ON d.owner_id = u.user_id
            LEFT JOIN folders f ON d.folder_id = f.folder_id
            WHERE d.owner_id IN (${placeholders}) AND d.status = 'active'
            ORDER BY d.created_at DESC
        `, memberIds);

        res.json({ ok: true, success: true, data: documents });
    } catch (error) {
        res.status(500).json({ ok: false, error: 'Error', message: error.message });
    }
});

/**
 * GET /api/teams/shared-with-me/folders  (legacy — mantenido por compatibilidad)
 */
router.get('/shared-with-me/folders', requireAuth, async (req, res) => {
    const db = req.app.locals.db;
    try {
        const companionRows = await dbQuery(db, `
            SELECT DISTINCT tm2.user_id FROM team_members tm1
            JOIN team_members tm2 ON tm2.team_id = tm1.team_id
            WHERE tm1.user_id = ? AND tm2.user_id != ?
        `, [req.userId, req.userId]);
        if (companionRows.length === 0) return res.json({ ok: true, success: true, data: [] });

        const memberIds = companionRows.map(r => r.user_id);
        const placeholders = memberIds.map(() => '?').join(',');

        const folders = await dbQuery(db, `
            SELECT f.folder_id, f.folder_name, f.folder_slug, f.folder_description, f.folder_color,
                   f.parent_id, f.folder_level, f.created_at,
                   CONCAT(u.first_name, ' ', u.last_name) AS owner_name,
                   COUNT(DISTINCT d.document_id) AS doc_count,
                   (SELECT t2.team_name FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = f.user_id AND t2.is_active = TRUE LIMIT 1) AS team_name,
                   (SELECT t2.team_color FROM team_members tm3 JOIN teams t2 ON t2.team_id = tm3.team_id WHERE tm3.user_id = f.user_id AND t2.is_active = TRUE LIMIT 1) AS team_color
            FROM folders f
            LEFT JOIN users u ON f.user_id = u.user_id
            LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
            WHERE f.user_id IN (${placeholders}) AND f.is_active = TRUE AND f.folder_level = 0
            GROUP BY f.folder_id
            ORDER BY f.created_at ASC
        `, memberIds);

        const data = folders.map(f => ({
            id: f.folder_id, name: f.folder_name, slug: f.folder_slug,
            description: f.folder_description, color: f.folder_color,
            parent_id: f.parent_id, level: f.folder_level,
            doc_count: f.doc_count || 0, owner_name: f.owner_name,
            team_name: f.team_name, team_color: f.team_color, created_at: f.created_at
        }));

        res.json({ ok: true, success: true, data });
    } catch (error) {
        res.status(500).json({ ok: false, error: 'Error', message: error.message });
    }
});

module.exports = router;
