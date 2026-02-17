/**
 * =============================================
 * MIDDLEWARE DE AUTENTICACIÓN CON JWT EN COOKIES
 * Sistema de sesión persistente con HttpOnly cookies
 * =============================================
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware para requerir autenticación JWT
 * Lee el token desde la cookie HttpOnly
 */
function requireAuth(req, res, next) {
    // Leer JWT desde la cookie
    const token = req.cookies.auth_token;

    if (!token) {
        console.log('❌ [AUTH] No hay token en las cookies');
        return res.status(401).json({
            success: false,
            error: 'No autenticado - Token no encontrado'
        });
    }

    try {
        // Verificar y decodificar el token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Agregar información del usuario al request
        req.userId = decoded.userId;
        req.userEmail = decoded.email;

        console.log(`🔐 [AUTH] Usuario autenticado desde JWT cookie: ${req.userId} (${req.userEmail})`);
        next();

    } catch (error) {
        console.error('❌ [AUTH] Token inválido:', error.message);
        return res.status(401).json({
            success: false,
            error: 'Token inválido o expirado'
        });
    }
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
        const db = req.app.locals.db;

        try {
            const users = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT u.user_id, u.first_name, u.last_name, r.role_name
                     FROM users u
                     INNER JOIN roles r ON u.role_id = r.role_id
                     WHERE u.user_id = ?`,
                    [req.userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
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
 * Función para registrar actividad del usuario
 */
async function logActivity(db, options) {
    const { userId, action, entityType, entityId, details, req } = options;

    try {
        await new Promise((resolve, reject) => {
            db.query(
                `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    action,
                    entityType || null,
                    entityId || null,
                    details ? JSON.stringify(details) : null,
                    req.ip || req.connection.remoteAddress,
                    req.get('user-agent')
                ],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        console.log(`📝 [LOG] Actividad registrada: ${action} (user=${userId}, entity=${entityType}:${entityId})`);
    } catch (error) {
        console.error('❌ [LOG] Error al registrar actividad:', error);
    }
}

module.exports = { requireAuth, requireRole, requestLogger, logActivity };
