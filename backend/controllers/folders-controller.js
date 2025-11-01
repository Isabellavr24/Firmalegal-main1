/**
 * =============================================
 * CONTROLADOR DE CARPETAS
 * API REST para gestión de carpetas multiusuario
 * =============================================
 */

const express = require('express');
const router = express.Router();
const { requireAuth, logActivity } = require('../middleware/auth');

/**
 * Helper: Generar slug único para carpeta
 */
function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * GET /api/folders
 * Obtener carpetas del usuario autenticado
 * Query params:
 *   - filter: 'mine', 'shared', 'archived', '*' (default: '*')
 *   - search: texto para buscar en nombre (opcional)
 *   - parent_id: ID de carpeta padre para obtener subcarpetas (opcional)
 *   - level: nivel de carpeta (0=raíz, 1=subcarpeta, etc.) (opcional)
 */
router.get('/', requireAuth, async (req, res) => {
    console.log('\n📂 [FOLDERS] GET /api/folders');
    console.log(`   Usuario: ${req.userId}`);

    const { filter = '*', search = '', parent_id, level } = req.query;
    console.log(`   Filtro: ${filter}`);
    console.log(`   Búsqueda: ${search || '(ninguna)'}`);
    console.log(`   Parent ID: ${parent_id || '(ninguno - solo raíz)'}`);
    console.log(`   Level: ${level !== undefined ? level : '(cualquiera)'}`);

    const db = req.app.locals.db;

    try {
        // Query base: carpetas propias del usuario
        let query = `
            SELECT
                f.folder_id,
                f.folder_name,
                f.folder_slug,
                f.user_id,
                f.parent_id,
                f.folder_level,
                f.folder_path,
                f.tag,
                f.folder_description,
                f.folder_color,
                f.created_at,
                f.updated_at,
                COUNT(DISTINCT d.document_id) as doc_count,
                (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.folder_id AND sf.is_active = TRUE) as subfolder_count,
                u.first_name,
                u.last_name,
                CONCAT(u.first_name, ' ', u.last_name) as owner_name
            FROM folders f
            LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
            LEFT JOIN users u ON f.user_id = u.user_id
            WHERE f.is_active = TRUE
        `;

        const params = [];

        // Filtrar por usuario o carpetas compartidas
        if (filter === 'shared') {
            // Carpetas compartidas CON el usuario actual
            query += ` AND f.folder_id IN (
                SELECT folder_id FROM shared_access WHERE shared_with_user_id = ?
            )`;
            params.push(req.userId);
        } else {
            // Carpetas propias del usuario
            query += ` AND f.user_id = ?`;
            params.push(req.userId);

            // Filtrar por tag si no es '*'
            if (filter !== '*') {
                query += ` AND f.tag = ?`;
                params.push(filter);
            }
        }

        // Búsqueda por nombre
        if (search.trim()) {
            query += ` AND f.folder_name LIKE ?`;
            params.push(`%${search.trim()}%`);
        }

        // Filtrar por parent_id (subcarpetas de una carpeta específica)
        if (parent_id !== undefined) {
            if (parent_id === 'null' || parent_id === '' || parent_id === null) {
                query += ` AND f.parent_id IS NULL`;
            } else {
                query += ` AND f.parent_id = ?`;
                params.push(parseInt(parent_id));
            }
        }

        // Filtrar por nivel (0=raíz, 1=subcarpeta, etc.)
        if (level !== undefined) {
            query += ` AND f.folder_level = ?`;
            params.push(parseInt(level));
        }

        // ✅ Ordenar por fecha de creación ASCENDENTE (más antiguas primero)
        query += ` GROUP BY f.folder_id ORDER BY f.created_at ASC`;

        console.log('   Query:', query);
        console.log('   Params:', params);

        const results = await new Promise((resolve, reject) => {
            db.query(query, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        console.log(`✅ [FOLDERS] ${results.length} carpetas encontradas`);

        // 🐛 DEBUG: Ver orden de carpetas desde la BD
        console.log('🔍 [DEBUG] Orden de carpetas desde BD:');
        results.forEach((f, index) => {
            console.log(`   ${index + 1}. ID:${f.folder_id} - ${f.folder_name} - parent_id:${f.parent_id} - level:${f.folder_level}`);
        });

        // Formatear respuesta para frontend
        const folders = results.map(f => ({
            id: f.folder_id,
            name: f.folder_name,
            slug: f.folder_slug,
            parent_id: f.parent_id, // ✅ AGREGADO: Incluir parent_id para jerarquía
            level: f.folder_level,  // ✅ AGREGADO: Incluir nivel
            path: f.folder_path,    // ✅ AGREGADO: Incluir path
            item_count: (f.doc_count || 0) + (f.subfolder_count || 0), // ✅ Suma documentos + subcarpetas
            doc_count: f.doc_count || 0,
            subfolder_count: f.subfolder_count || 0,
            tag: f.tag,
            description: f.folder_description,
            color: f.folder_color,
            owner_name: f.owner_name,
            created_at: f.created_at,
            updated_at: f.updated_at
        }));

        // 🐛 DEBUG: Ver datos mapeados
        console.log('🔍 [DEBUG] Datos mapeados para frontend:');
        folders.forEach((f, index) => {
            console.log(`   ${index + 1}. ID:${f.id} - ${f.name} - parent_id:${f.parent_id} - level:${f.level}`);
        });

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'list_folders',
            entityType: 'folder',
            entityId: null,
            details: { filter, search, count: folders.length },
            req
        });

        res.json({
            ok: true,
            success: true,
            data: folders,
            count: folders.length
        });

    } catch (error) {
        console.error('❌ [FOLDERS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener carpetas',
            message: error.message
        });
    }
});

/**
 * GET /api/folders/:id
 * Obtener información de una carpeta específica
 */
router.get('/:id', requireAuth, async (req, res) => {
    console.log(`\n📂 [FOLDERS] GET /api/folders/${req.params.id}`);
    console.log(`   Usuario: ${req.userId}`);

    const folderId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        const results = await new Promise((resolve, reject) => {
            db.query(
                `SELECT f.*,
                        COUNT(DISTINCT d.document_id) as doc_count,
                        (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.folder_id AND sf.is_active = TRUE) as subfolder_count,
                        u.first_name, u.last_name,
                        CONCAT(u.first_name, ' ', u.last_name) as owner_name
                 FROM folders f
                 LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
                 LEFT JOIN users u ON f.user_id = u.user_id
                 WHERE f.folder_id = ? AND f.is_active = TRUE
                 GROUP BY f.folder_id`,
                [folderId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (results.length === 0) {
            console.log('❌ [FOLDERS] Carpeta no encontrada');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Carpeta no encontrada'
            });
        }

        const folder = results[0];

        // Verificar permisos: debe ser el dueño o tener acceso compartido
        const hasAccess = folder.user_id === req.userId;

        if (!hasAccess) {
            // Verificar si tiene acceso compartido
            const [shared] = await new Promise((resolve, reject) => {
                db.query(
                    'SELECT * FROM shared_access WHERE folder_id = ? AND shared_with_user_id = ?',
                    [folderId, req.userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            if (shared.length === 0) {
                console.log('❌ [FOLDERS] Acceso denegado');
                return res.status(403).json({
                    ok: false,
                    success: false,
                    error: 'No tienes permiso para acceder a esta carpeta'
                });
            }
        }

        console.log(`✅ [FOLDERS] Carpeta encontrada: ${folder.folder_name}`);

        res.json({
            ok: true,
            success: true,
            data: {
                id: folder.folder_id,
                name: folder.folder_name,
                slug: folder.folder_slug,
                description: folder.folder_description,
                color: folder.folder_color,
                tag: folder.tag,
                item_count: (folder.doc_count || 0) + (folder.subfolder_count || 0), // ✅ Total items
                doc_count: folder.doc_count || 0,
                subfolder_count: folder.subfolder_count || 0,
                owner_name: folder.owner_name,
                created_at: folder.created_at,
                updated_at: folder.updated_at
            }
        });

    } catch (error) {
        console.error('❌ [FOLDERS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener carpeta',
            message: error.message
        });
    }
});

/**
 * POST /api/folders
 * Crear nueva carpeta
 * Body: { folder_name, parent_id?, tag?, folder_description?, folder_color? }
 */
router.post('/', requireAuth, async (req, res) => {
    console.log('\n📂 [FOLDERS] POST /api/folders');
    console.log(`   Usuario: ${req.userId}`);
    console.log('   Body:', JSON.stringify(req.body, null, 2));

    const {
        folder_name,
        parent_id = null,
        tag = 'mine',
        folder_description = '',
        folder_color = '#2b0e31'
    } = req.body;

    // Validaciones
    if (!folder_name || folder_name.trim().length === 0) {
        console.log('❌ [FOLDERS] Nombre de carpeta requerido');
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'El nombre de la carpeta es requerido'
        });
    }

    const db = req.app.locals.db;

    try {
        // Si tiene parent_id, verificar que existe y pertenece al usuario
        let folder_level = 0;
        let folder_path = null;
        let parent_folder_name = null;

        if (parent_id) {
            const [parentFolders] = await new Promise((resolve, reject) => {
                db.query(
                    'SELECT folder_id, folder_name, folder_level, folder_path, user_id FROM folders WHERE folder_id = ? AND is_active = TRUE',
                    [parent_id],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            if (parentFolders.length === 0) {
                console.log('❌ [FOLDERS] Carpeta padre no encontrada');
                return res.status(404).json({
                    ok: false,
                    success: false,
                    error: 'La carpeta padre no existe'
                });
            }

            const parentFolder = parentFolders[0];

            // Verificar que el parent pertenece al mismo usuario
            if (parentFolder.user_id !== req.userId) {
                console.log('❌ [FOLDERS] No tienes permisos sobre la carpeta padre');
                return res.status(403).json({
                    ok: false,
                    success: false,
                    error: 'No tienes permisos para crear carpetas aquí'
                });
            }

            folder_level = parentFolder.folder_level + 1;
            parent_folder_name = parentFolder.folder_name;
            console.log(`   Carpeta padre: ${parent_folder_name} (nivel ${parentFolder.folder_level})`);
            console.log(`   Nueva carpeta será nivel: ${folder_level}`);
        }

        // Generar slug único
        const baseSlug = slugify(folder_name);
        let folder_slug = baseSlug;
        let counter = 0;

        // Verificar si el slug ya existe para este usuario
        while (true) {
            const [existing] = await new Promise((resolve, reject) => {
                db.query(
                    'SELECT folder_id FROM folders WHERE folder_slug = ? AND user_id = ?',
                    [folder_slug, req.userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            if (existing.length === 0) break;

            counter++;
            folder_slug = `${baseSlug}-${counter}`;
        }

        console.log(`   Slug generado: ${folder_slug}`);

        // Insertar carpeta con jerarquía
        const result = await new Promise((resolve, reject) => {
            db.query(
                `INSERT INTO folders (folder_name, folder_slug, user_id, parent_id, folder_level, tag, folder_description, folder_color)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [folder_name.trim(), folder_slug, req.userId, parent_id, folder_level, tag, folder_description, folder_color],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        const folderId = result.insertId;

        // Calcular y actualizar el folder_path
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE folders SET folder_path = generate_folder_path(?, ?) WHERE folder_id = ?',
                [folderId, parent_id, folderId],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        // Obtener el nivel de carpeta para el mensaje
        const levelNames = ['Carpeta', 'Subcarpeta', 'Subcarpeta 2', 'Subcarpeta 3'];
        const levelName = levelNames[folder_level] || `Subcarpeta ${folder_level}`;

        console.log(`✅ [FOLDERS] ${levelName} creada: ${folder_name} (ID: ${folderId})`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'create_folder',
            entityType: 'folder',
            entityId: folderId,
            details: { folder_name, folder_slug, tag, parent_id, folder_level, level_name: levelName },
            req
        });

        res.status(201).json({
            ok: true,
            success: true,
            message: `${levelName} creada exitosamente`,
            data: {
                folder_id: folderId,
                folder_name,
                folder_slug,
                tag,
                folder_description,
                folder_color,
                parent_id,
                folder_level,
                level_name: levelName
            }
        });

    } catch (error) {
        console.error('❌ [FOLDERS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al crear carpeta',
            message: error.message
        });
    }
});

/**
 * PUT /api/folders/:id
 * Actualizar carpeta existente
 * Body: { folder_name?, tag?, folder_description?, folder_color? }
 */
router.put('/:id', requireAuth, async (req, res) => {
    console.log(`\n📂 [FOLDERS] PUT /api/folders/${req.params.id}`);
    console.log(`   Usuario: ${req.userId}`);
    console.log('   Body:', JSON.stringify(req.body, null, 2));

    const folderId = parseInt(req.params.id);
    const { folder_name, tag, folder_description, folder_color } = req.body;

    const db = req.app.locals.db;

    try {
        // Verificar que la carpeta existe y pertenece al usuario
        const [folders] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM folders WHERE folder_id = ? AND user_id = ? AND is_active = TRUE',
                [folderId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (folders.length === 0) {
            console.log('❌ [FOLDERS] Carpeta no encontrada o sin permisos');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Carpeta no encontrada o no tienes permisos para editarla'
            });
        }

        // Construir query de actualización dinámicamente
        const updates = [];
        const params = [];

        if (folder_name !== undefined) {
            updates.push('folder_name = ?');
            params.push(folder_name.trim());

            // Regenerar slug si cambió el nombre
            const newSlug = slugify(folder_name);
            updates.push('folder_slug = ?');
            params.push(newSlug);
        }

        if (tag !== undefined) {
            updates.push('tag = ?');
            params.push(tag);
        }

        if (folder_description !== undefined) {
            updates.push('folder_description = ?');
            params.push(folder_description);
        }

        if (folder_color !== undefined) {
            updates.push('folder_color = ?');
            params.push(folder_color);
        }

        if (updates.length === 0) {
            console.log('⚠️ [FOLDERS] No hay cambios para actualizar');
            return res.status(400).json({
                ok: false,
                success: false,
                error: 'No se proporcionaron campos para actualizar'
            });
        }

        params.push(folderId);

        const query = `UPDATE folders SET ${updates.join(', ')} WHERE folder_id = ?`;

        await new Promise((resolve, reject) => {
            db.query(query, params, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        console.log(`✅ [FOLDERS] Carpeta actualizada: ${folderId}`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'update_folder',
            entityType: 'folder',
            entityId: folderId,
            details: { changes: req.body },
            req
        });

        res.json({
            ok: true,
            success: true,
            message: 'Carpeta actualizada exitosamente'
        });

    } catch (error) {
        console.error('❌ [FOLDERS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al actualizar carpeta',
            message: error.message
        });
    }
});

/**
 * DELETE /api/folders/:id
 * Eliminar carpeta (soft delete)
 */
router.delete('/:id', requireAuth, async (req, res) => {
    console.log(`\n📂 [FOLDERS] DELETE /api/folders/${req.params.id}`);
    console.log(`   Usuario: ${req.userId}`);

    const folderId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        // Verificar que la carpeta existe y pertenece al usuario
        const [folders] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM folders WHERE folder_id = ? AND user_id = ? AND is_active = TRUE',
                [folderId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (folders.length === 0) {
            console.log('❌ [FOLDERS] Carpeta no encontrada o sin permisos');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Carpeta no encontrada o no tienes permisos para eliminarla'
            });
        }

        // Soft delete: marcar como inactiva
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE folders SET is_active = FALSE WHERE folder_id = ?',
                [folderId],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        console.log(`✅ [FOLDERS] Carpeta eliminada (soft delete): ${folderId}`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'delete_folder',
            entityType: 'folder',
            entityId: folderId,
            details: { folder_name: folders[0].folder_name },
            req
        });

        res.json({
            ok: true,
            success: true,
            message: 'Carpeta eliminada exitosamente'
        });

    } catch (error) {
        console.error('❌ [FOLDERS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al eliminar carpeta',
            message: error.message
        });
    }
});

module.exports = router;
