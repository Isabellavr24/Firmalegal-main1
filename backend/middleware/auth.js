/**
 * =============================================
 * MIDDLEWARE DE AUTENTICACIÓN Y SESIONES
 * Verifica que el usuario esté logueado antes de acceder a rutas protegidas
 * =============================================
 */

/**
 * Middleware: Obtener usuario actual desde localStorage simulado
 * En producción, esto vendría de JWT, express-session, o cookies
 */
function getCurrentUserFromRequest(req) {
    // OPCIÓN 1: Desde header Authorization (JWT)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        // TODO: Decodificar JWT aquí
        // const decoded = jwt.verify(token, SECRET_KEY);
        // return decoded.user_id;
    }

    // OPCIÓN 2: Desde body (temporal para desarrollo)
    if (req.body && req.body.user_id) {
        return parseInt(req.body.user_id);
    }

    // OPCIÓN 3: Desde query params (temporal)
    if (req.query && req.query.user_id) {
        return parseInt(req.query.user_id);
    }

    // OPCIÓN 4: Desde sesión (si usas express-session)
    if (req.session && req.session.user_id) {
        return parseInt(req.session.user_id);
    }

    return null;
}

/**
 * Middleware: Verificar autenticación
 * Uso: app.get('/api/folders', requireAuth, (req, res) => {...})
 */
function requireAuth(req, res, next) {
    console.log('\n🔐 [AUTH] Verificando autenticación...');
    console.log('   Headers:', JSON.stringify(req.headers, null, 2));
    console.log('   Body:', JSON.stringify(req.body, null, 2));
    console.log('   Query:', JSON.stringify(req.query, null, 2));

    const userId = getCurrentUserFromRequest(req);

    if (!userId) {
        console.log('❌ [AUTH] Usuario no autenticado');
        return res.status(401).json({
            success: false,
            error: 'No autenticado',
            message: 'Debes iniciar sesión para acceder a este recurso'
        });
    }

    console.log(`✅ [AUTH] Usuario autenticado: user_id=${userId}`);

    // Adjuntar userId al request para uso en handlers
    req.userId = userId;
    next();
}

/**
 * Middleware: Verificar permisos por rol
 * Uso: app.post('/api/folders', requireAuth, requireRole('Admin'), (req, res) => {...})
 */
function requireRole(...allowedRoles) {
    return async (req, res, next) => {
        console.log(`\n🔑 [ROLE] Verificando permisos: ${allowedRoles.join(', ')}`);

        if (!req.userId) {
            console.log('❌ [ROLE] No hay userId en request');
            return res.status(401).json({
                success: false,
                error: 'No autenticado'
            });
        }

        // Obtener rol del usuario desde BD
        const db = req.app.locals.db; // Conexión a MySQL

        try {
            const [users] = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT u.user_id, u.first_name, u.last_name, r.role_name
                     FROM users u
                     INNER JOIN roles r ON u.role_id = r.role_id
                     WHERE u.user_id = ?`,
                    [req.userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            if (!users || users.length === 0) {
                console.log('❌ [ROLE] Usuario no encontrado en BD');
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado'
                });
            }

            const user = users[0];
            const userRole = user.role_name;

            console.log(`   Usuario: ${user.first_name} ${user.last_name}`);
            console.log(`   Rol actual: ${userRole}`);
            console.log(`   Roles permitidos: ${allowedRoles.join(', ')}`);

            if (!allowedRoles.includes(userRole)) {
                console.log(`❌ [ROLE] Acceso denegado (rol: ${userRole})`);
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: `Necesitas uno de estos roles: ${allowedRoles.join(', ')}`
                });
            }

            console.log(`✅ [ROLE] Permiso concedido`);

            // Adjuntar info del usuario al request
            req.user = user;
            next();

        } catch (error) {
            console.error('❌ [ROLE] Error al verificar rol:', error);
            return res.status(500).json({
                success: false,
                error: 'Error al verificar permisos'
            });
        }
    };
}

/**
 * Middleware: Logging de todas las requests
 */
function requestLogger(req, res, next) {
    const timestamp = new Date().toISOString();
    console.log(`\n📥 [${timestamp}] ${req.method} ${req.url}`);
    console.log(`   IP: ${req.ip}`);
    console.log(`   User-Agent: ${req.get('user-agent')}`);

    // Log del body (solo si no es muy grande)
    if (req.body && Object.keys(req.body).length > 0) {
        const bodyStr = JSON.stringify(req.body);
        if (bodyStr.length < 500) {
            console.log(`   Body: ${bodyStr}`);
        } else {
            console.log(`   Body: [${bodyStr.length} caracteres]`);
        }
    }

    next();
}

/**
 * Helper: Registrar actividad en activity_log
 */
async function logActivity(db, { userId, action, entityType, entityId, details, req }) {
    try {
        const ip = req ? (req.ip || req.connection.remoteAddress) : null;
        const userAgent = req ? req.get('user-agent') : null;

        await new Promise((resolve, reject) => {
            db.query(
                `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    action,
                    entityType,
                    entityId,
                    JSON.stringify(details || {}),
                    ip,
                    userAgent
                ],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        console.log(`📝 [LOG] Actividad registrada: ${action} (user=${userId}, entity=${entityType}:${entityId})`);
    } catch (error) {
        console.error('❌ [LOG] Error al registrar actividad:', error);
        // No lanzar error para no interrumpir el flujo principal
    }
}

module.exports = {
    requireAuth,
    requireRole,
    requestLogger,
    getCurrentUserFromRequest,
    logActivity
};
