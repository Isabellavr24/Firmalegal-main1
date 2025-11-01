const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// =============================================
// IMPORTAR NUEVOS CONTROLADORES Y MIDDLEWARE
// =============================================
const foldersController = require('./controllers/folders-controller');
const documentsController = require('./controllers/documents-controller');
const signaturesController = require('./controllers/signatures-controller');
const { requestLogger } = require('./middleware/auth');
const { embedValuesInPdf } = require('./lib/pdf/embed-values');

const app = express();
const port = 3000;

// Configurar multer para subir avatares
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'frontend', 'avatar-pht');
        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generar nombre único: userId_timestamp.extension
        const userId = req.body.userId || 'temp';
        const ext = path.extname(file.originalname);
        cb(null, `avatar_${userId}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: function (req, file, cb) {
        // Solo permitir imágenes
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png, gif, webp)'));
        }
    }
});

app.use(express.json());
// Servir carpeta frontend completa para acceder a script.js e img
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// Servir carpeta de uploads para acceder a documentos y firmas
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// =============================================
// RUTAS DE FIRMAS
// =============================================
app.use('/api/signatures', signaturesController);

// Rutas para las páginas HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'login.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'login.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'index.html'));
});

app.get('/config.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'config.html'));
});

app.get('/sign.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'sign.html'));
});

app.get('/folder.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'folder.html'));
});

app.get('/tracking.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'tracking.html'));
});

app.get('/public-sign.html', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'public-sign.html'));
});

const db = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '', 
    database: 'firmalegalonline'
});

db.connect(err => {
    if (err) {
        console.error('🔴 Error al conectar a MySQL:', err);
        return;
    }
    console.log("🟢 Conectado a MariaDB");
});

// =============================================
// COMPARTIR CONEXIÓN DB CON CONTROLADORES
// =============================================
app.locals.db = db;

// =============================================
// MIDDLEWARE GLOBAL DE LOGGING
// =============================================
app.use(requestLogger);

// =============================================
// NUEVAS RUTAS DE CARPETAS Y DOCUMENTOS
// =============================================
console.log('📁 Registrando rutas de carpetas y documentos...');
app.use('/api/folders', foldersController);
app.use('/api/documents', documentsController);
app.use('/api/templates', documentsController); // Alias para compatibilidad
console.log('✅ Rutas registradas exitosamente');

// =============================================
// RUTAS DE CONFIGURACIÓN DE EMAIL POR USUARIO
// =============================================
const emailConfigController = require('./controllers/email-config-controller');
console.log('📧 Registrando rutas de configuración de email...');
app.use('/api/email-config', emailConfigController);
console.log('✅ Rutas de configuración de email registradas');

// =============================================
// RUTAS DE EMAIL (SENDGRID)
// =============================================
const mailer = require('./lib/email/mailer');

// Endpoint para verificar estado de configuración de email
app.get('/api/email/status', (req, res) => {
    console.log('\n📧 [EMAIL] GET /api/email/status');
    const status = mailer.getStatus();
    res.json({
        success: true,
        data: status
    });
});

// Endpoint para enviar email de prueba
app.post('/api/email/test', async (req, res) => {
    console.log('\n📧 [EMAIL] POST /api/email/test');
    const { to } = req.body;

    if (!to) {
        return res.status(400).json({
            success: false,
            error: 'El campo "to" (email destino) es requerido'
        });
    }

    try {
        const result = await mailer.sendTestEmail(to);

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
        console.error('❌ [EMAIL] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno al enviar email',
            message: error.message
        });
    }
});

// Endpoint para enviar solicitud de firma
app.post('/api/email/signature-request', async (req, res) => {
    console.log('\n📧 [EMAIL] POST /api/email/signature-request');
    const { to, recipientName, documentTitle, senderName, documentId } = req.body;

    // Validaciones
    if (!to || !recipientName || !documentTitle || !senderName || !documentId) {
        return res.status(400).json({
            success: false,
            error: 'Faltan campos requeridos',
            required: ['to', 'recipientName', 'documentTitle', 'senderName', 'documentId']
        });
    }

    try {
        const result = await mailer.sendSignatureRequest({
            to,
            recipientName,
            documentTitle,
            senderName,
            documentId
        });

        if (result.success) {
            res.json({
                success: true,
                message: `Solicitud de firma enviada a ${to}`,
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error al enviar solicitud de firma',
                details: result.error
            });
        }
    } catch (error) {
        console.error('❌ [EMAIL] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno al enviar email',
            message: error.message
        });
    }
});

// Endpoint para notificar firma completada
app.post('/api/email/signature-completed', async (req, res) => {
    console.log('\n📧 [EMAIL] POST /api/email/signature-completed');
    const { to, recipientName, documentTitle, signerName, documentId } = req.body;

    // Validaciones
    if (!to || !recipientName || !documentTitle || !signerName || !documentId) {
        return res.status(400).json({
            success: false,
            error: 'Faltan campos requeridos',
            required: ['to', 'recipientName', 'documentTitle', 'signerName', 'documentId']
        });
    }

    try {
        const result = await mailer.sendSignatureCompleted({
            to,
            recipientName,
            documentTitle,
            signerName,
            documentId
        });

        if (result.success) {
            res.json({
                success: true,
                message: `Notificación de firma completada enviada a ${to}`,
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error al enviar notificación',
                details: result.error
            });
        }
    } catch (error) {
        console.error('❌ [EMAIL] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno al enviar email',
            message: error.message
        });
    }
});

console.log('✅ Rutas de email registradas exitosamente');

// =========================================
// MIDDLEWARE DE PERMISOS
// =========================================

// Función helper para verificar permisos basados en rol
function canManageUsers(roleName) {
    return roleName === 'Superadministrador';
}

function canEditUsers(roleName) {
    return roleName === 'Superadministrador';
}

function canAccessConfig(roleName) {
    return ['Superadministrador', 'Tenant Admin', 'Admin'].includes(roleName);
}

// =========================================
// RUTAS DE API
// =========================================

// Endpoint para obtener todos los roles
app.get('/api/roles', (req, res) => {
    console.log('📋 Solicitando roles disponibles');
    
    db.query('SELECT role_id, role_name, role_description FROM roles ORDER BY role_id ASC', (err, results) => {
        if (err) {
            console.error('❌ Error al obtener roles:', err);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener roles'
            });
        }
        
        console.log(`✅ Roles obtenidos: ${results.length}`);
        
        res.json({
            success: true,
            roles: results
        });
    });
});

// Endpoint para autenticación (login)
app.post('/api/login', (req, res) => {
    console.log('📩 Recibida petición de login:', req.body);
    const { email, password } = req.body;

    // Validar que vengan los datos
    if (!email || !password) {
        console.log('❌ Faltan datos');
        return res.status(400).json({ 
            success: false, 
            message: 'Email y contraseña son requeridos' 
        });
    }

    // Buscar usuario en la base de datos
    const query = `
        SELECT u.user_id, u.first_name, u.last_name, u.email, u.password_hash, 
               u.is_active, u.role_id, u.avatar_url, r.role_name, r.role_description
        FROM users u
        INNER JOIN roles r ON u.role_id = r.role_id
        WHERE u.email = ?
    `;

    console.log('🔍 Buscando usuario:', email);

    db.query(query, [email], async (err, results) => {
        if (err) {
            console.error('❌ Error en la consulta:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Error del servidor' 
            });
        }

        console.log('📊 Resultados de la consulta:', results.length);

        // Verificar si existe el usuario
        if (results.length === 0) {
            console.log('⚠️ Usuario no encontrado');
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas' 
            });
        }

        const user = results[0];

        // Verificar si el usuario está activo
        if (!user.is_active) {
            console.log('⚠️ Usuario desactivado');
            return res.status(403).json({ 
                success: false, 
                message: 'Usuario desactivado. Contacta al administrador.' 
            });
        }

        // Comparar contraseña
        try {
            const passwordMatch = await bcrypt.compare(password, user.password_hash);

            if (!passwordMatch) {
                console.log('❌ Contraseña incorrecta');
                return res.status(401).json({ 
                    success: false, 
                    message: 'Credenciales inválidas' 
                });
            }

            // Actualizar último login
            db.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?',
                [user.user_id]
            );

            console.log('✅ Login exitoso para:', email);

            // Login exitoso
            res.json({
                success: true,
                message: 'Login exitoso',
                user: {
                    user_id: user.user_id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    role_id: user.role_id,
                    role_name: user.role_name,
                    role_description: user.role_description,
                    avatar_url: user.avatar_url
                }
            });
        } catch (bcryptError) {
            console.error('❌ Error en bcrypt:', bcryptError);
            return res.status(500).json({ 
                success: false, 
                message: 'Error al verificar contraseña' 
            });
        }
    });
});

// =============================================
// API DE USUARIOS
// =============================================

// Obtener todos los usuarios
app.get('/api/users', (req, res) => {
    console.log('📋 Solicitando lista de usuarios');
    console.log('🔍 Base de datos actual:', db.config.database);
    console.log('🔍 Host:', db.config.host);
    console.log('🔍 Puerto:', db.config.port);
    
    const query = `
        SELECT u.user_id, u.first_name, u.last_name, u.email, 
               u.is_active, u.last_login, u.created_at,
               r.role_name, r.role_description,
               DATABASE() as current_db
        FROM users u
        INNER JOIN roles r ON u.role_id = r.role_id
        ORDER BY u.created_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error al obtener usuarios:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Error al obtener usuarios' 
            });
        }

        console.log(`✅ ${results.length} usuarios encontrados`);
        if (results.length > 0) {
            console.log('📊 Base de datos real:', results[0].current_db);
            console.log('👥 Usuarios:', results.map(u => `${u.first_name} ${u.last_name} (${u.email})`));
        }
        
        res.json({
            success: true,
            users: results
        });
    });
});

// Obtener roles disponibles
app.get('/api/roles', (req, res) => {
    console.log('📋 Solicitando lista de roles');
    
    const query = 'SELECT role_id, role_name, role_description FROM roles ORDER BY role_id';

    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error al obtener roles:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Error al obtener roles' 
            });
        }

        console.log(`✅ ${results.length} roles encontrados`);
        
        res.json({
            success: true,
            roles: results
        });
    });
});

// Crear nuevo usuario
app.post('/api/users', async (req, res) => {
    console.log('➕ Creando nuevo usuario');
    console.log('📦 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    const { firstName, lastName, email, password, roleId, requestingUserId, requestingUserRole } = req.body;

    // VERIFICAR PERMISOS: Solo Superadministrador puede crear usuarios
    if (!requestingUserRole || !canManageUsers(requestingUserRole)) {
        console.warn('⛔ Intento de crear usuario sin permisos:', requestingUserRole);
        return res.status(403).json({ 
            success: false, 
            message: 'No tienes permisos para crear usuarios' 
        });
    }

    // Validaciones
    if (!firstName || !lastName || !email || !password || !roleId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Todos los campos son requeridos' 
        });
    }

    try {
        // Verificar si el email ya existe
        const [existing] = await new Promise((resolve, reject) => {
            db.query('SELECT email FROM users WHERE email = ?', [email], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'El email ya está registrado' 
            });
        }

        // Verificar que el rol existe
        const [roleResult] = await new Promise((resolve, reject) => {
            db.query('SELECT role_id FROM roles WHERE role_id = ?', [roleId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (roleResult.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Rol no válido' 
            });
        }

        // Hashear contraseña
        const passwordHash = await bcrypt.hash(password, 10);

        // Insertar usuario
        await new Promise((resolve, reject) => {
            db.query(
                'INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, ?, ?)',
                [firstName, lastName, email, passwordHash, roleId, true],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Usuario creado exitosamente');
        res.json({ success: true, message: 'Usuario creado exitosamente' });

    } catch (error) {
        console.error('❌ Error al crear usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al crear usuario' 
        });
    }
});

// Obtener perfil de un usuario específico
app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    console.log('👤 Obteniendo perfil del usuario:', userId);

    if (!userId || userId === 'undefined') {
        console.error('❌ ID de usuario inválido:', userId);
        return res.status(400).json({ 
            success: false, 
            message: 'ID de usuario inválido' 
        });
    }

    try {
        const query = `
            SELECT u.user_id, u.first_name, u.last_name, u.email, 
                   u.is_active, u.last_login, u.created_at, u.avatar_url,
                   r.role_id, r.role_name, r.role_description
            FROM users u
            INNER JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = ?
        `;

        db.query(query, [userId], (err, results) => {
            if (err) {
                console.error('❌ Error al obtener perfil:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al obtener perfil' 
                });
            }

            if (results.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Usuario no encontrado' 
                });
            }

            console.log('✅ Perfil obtenido:', results[0].email);
            res.json({
                success: true,
                user: results[0]
            });
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener perfil' 
        });
    }
});

// Editar usuario existente
app.put('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    console.log('✏️ Editando usuario:', userId);
    console.log('📦 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    const { firstName, lastName, email, password, roleId, requestingUserId, requestingUserRole } = req.body;

    // VERIFICAR PERMISOS
    const isSuperAdmin = canEditUsers(requestingUserRole);
    const isOwnProfile = parseInt(requestingUserId) === parseInt(userId);
    const canEditOwnProfile = ['Admin', 'Tenant Admin'].includes(requestingUserRole) && isOwnProfile;

    if (!isSuperAdmin && !canEditOwnProfile) {
        console.warn('⛔ Intento de editar usuario sin permisos:', { requestingUserRole, userId, requestingUserId });
        return res.status(403).json({ 
            success: false, 
            message: 'No tienes permisos para editar este usuario' 
        });
    }

    // Admin y Tenant Admin solo pueden editar ciertos campos de su propio perfil
    if (canEditOwnProfile && !isSuperAdmin) {
        // No pueden cambiar su propio rol
        const [currentUser] = await new Promise((resolve, reject) => {
            db.query('SELECT role_id FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (currentUser.length > 0 && currentUser[0].role_id !== parseInt(roleId)) {
            return res.status(403).json({ 
                success: false, 
                message: 'No puedes cambiar tu propio rol' 
            });
        }
    }

    // Validaciones
    if (!firstName || !lastName || !email || !roleId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nombre, apellido, email y rol son requeridos' 
        });
    }

    try {
        // Verificar si el usuario existe
        const [userCheck] = await new Promise((resolve, reject) => {
            db.query('SELECT user_id FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (userCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }

        // Verificar si el email ya existe (excepto el usuario actual)
        const [existing] = await new Promise((resolve, reject) => {
            db.query('SELECT email FROM users WHERE email = ? AND user_id != ?', [email, userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'El email ya está registrado por otro usuario' 
            });
        }

        // Verificar que el rol existe
        const [roleResult] = await new Promise((resolve, reject) => {
            db.query('SELECT role_id FROM roles WHERE role_id = ?', [roleId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (roleResult.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Rol no válido' 
            });
        }

        // Actualizar usuario
        if (password) {
            // Si se proporciona contraseña, actualizarla también
            const passwordHash = await bcrypt.hash(password, 10);
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE users SET first_name = ?, last_name = ?, email = ?, password_hash = ?, role_id = ? WHERE user_id = ?',
                    [firstName, lastName, email, passwordHash, roleId, userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
            });
        } else {
            // Sin cambiar contraseña
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE users SET first_name = ?, last_name = ?, email = ?, role_id = ? WHERE user_id = ?',
                    [firstName, lastName, email, roleId, userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
            });
        }

        console.log('✅ Usuario actualizado exitosamente');
        res.json({ success: true, message: 'Usuario actualizado exitosamente' });

    } catch (error) {
        console.error('❌ Error al actualizar usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al actualizar usuario' 
        });
    }
});

// =============================================
// API DE AVATARES
// =============================================

// Subir avatar de usuario
app.post('/api/users/:id/avatar', upload.single('avatar'), async (req, res) => {
    const userId = req.params.id;
    console.log('📤 Subiendo avatar para usuario:', userId);

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No se proporcionó ningún archivo'
        });
    }

    try {
        // Obtener avatar anterior para eliminarlo
        const [oldUser] = await new Promise((resolve, reject) => {
            db.query('SELECT avatar_url FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // Eliminar avatar anterior si existe
        if (oldUser.length > 0 && oldUser[0].avatar_url) {
            const oldAvatarPath = path.join(__dirname, '..', 'frontend', oldUser[0].avatar_url);
            if (fs.existsSync(oldAvatarPath)) {
                fs.unlinkSync(oldAvatarPath);
                console.log('🗑️ Avatar anterior eliminado');
            }
        }

        // Guardar ruta relativa del nuevo avatar en la BD
        const avatarUrl = `/avatar-pht/${req.file.filename}`;
        
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE users SET avatar_url = ? WHERE user_id = ?',
                [avatarUrl, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Avatar subido:', avatarUrl);

        res.json({
            success: true,
            message: 'Avatar subido exitosamente',
            avatarUrl: avatarUrl
        });

    } catch (error) {
        console.error('❌ Error al subir avatar:', error);
        
        // Eliminar archivo subido si hubo error
        if (req.file) {
            const filePath = path.join(__dirname, '..', 'frontend', 'avatar-pht', req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al subir avatar'
        });
    }
});

// Eliminar avatar de usuario
app.delete('/api/users/:id/avatar', async (req, res) => {
    const userId = req.params.id;
    console.log('🗑️ Eliminando avatar del usuario:', userId);

    try {
        // Obtener avatar actual
        const [user] = await new Promise((resolve, reject) => {
            db.query('SELECT avatar_url FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Eliminar archivo físico si existe
        if (user[0].avatar_url) {
            const avatarPath = path.join(__dirname, '..', 'frontend', user[0].avatar_url);
            if (fs.existsSync(avatarPath)) {
                fs.unlinkSync(avatarPath);
                console.log('✅ Archivo de avatar eliminado');
            }
        }

        // Actualizar BD
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE users SET avatar_url = NULL WHERE user_id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Avatar eliminado de la BD');

        res.json({
            success: true,
            message: 'Avatar eliminado exitosamente'
        });

    } catch (error) {
        console.error('❌ Error al eliminar avatar:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar avatar'
        });
    }
});

// =============================================
// ENDPOINTS PÚBLICOS PARA FIRMA DE DOCUMENTOS
// =============================================

// GET /api/public/document/:token - Obtener información del documento por token
app.get('/api/public/document/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        console.log(`📄 Solicitando documento con token: ${token}`);

        // Buscar el destinatario por token
        const recipientQuery = `
            SELECT 
                dr.recipient_id,
                dr.document_id,
                dr.email,
                dr.name,
                dr.status,
                dr.sent_at,
                dr.opened_at,
                dr.completed_at,
                d.title as document_title,
                d.file_path,
                d.owner_id,
                u.first_name,
                u.last_name,
                u.email as sender_email
            FROM document_recipients dr
            INNER JOIN documents d ON dr.document_id = d.document_id
            INNER JOIN users u ON d.owner_id = u.user_id
            WHERE dr.token = ?
        `;

        const [recipients] = await new Promise((resolve, reject) => {
            db.query(recipientQuery, [token], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (recipients.length === 0) {
            console.log('❌ Token no encontrado');
            return res.status(404).json({
                success: false,
                message: 'Token inválido o documento no encontrado'
            });
        }

        const recipient = recipients[0];

        // Si el documento aún no se ha abierto, actualizar estado a opened
        if (recipient.status === 'sent' && !recipient.opened_at) {
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE document_recipients SET status = ?, opened_at = NOW() WHERE token = ?',
                    ['opened', token],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
            });
            console.log('✅ Estado actualizado a opened');
        }

        // Obtener los campos del documento
        const fieldsQuery = `
            SELECT 
                field_id, 
                field_type as type, 
                page_number as page, 
                x_position as x, 
                y_position as y, 
                width, 
                height, 
                field_label as label, 
                required
            FROM document_fields
            WHERE document_id = ?
            ORDER BY field_id ASC
        `;

        const [fields] = await new Promise((resolve, reject) => {
            db.query(fieldsQuery, [recipient.document_id], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        console.log(`✅ ${fields.length} campo(s) encontrado(s) para el documento`);

        // Construir ruta del PDF correctamente (evitar doble barra)
        let pdfPath = recipient.file_path.replace(/\\/g, '/'); // Convertir barras invertidas
        if (!pdfPath.startsWith('/')) {
            pdfPath = '/' + pdfPath; // Agregar barra inicial solo si no existe
        }

        // Responder con la información del documento
        res.json({
            success: true,
            document: {
                id: recipient.document_id,
                title: recipient.document_title,
                pdfPath: pdfPath,
                senderName: `${recipient.first_name} ${recipient.last_name}`,
                senderEmail: recipient.sender_email,
                recipientEmail: recipient.email,
                recipientName: recipient.name,
                sentAt: recipient.sent_at,
                openedAt: recipient.opened_at,
                status: recipient.status,
                fields: fields || [] // ✅ Incluir campos en la respuesta
            }
        });

    } catch (error) {
        console.error('❌ Error al obtener documento público:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar el documento'
        });
    }
});

// POST /api/public/sign/:token - Guardar firma del documento
app.post('/api/public/sign/:token', async (req, res) => {
    const { token } = req.params;
    const { fields, timestamp } = req.body;

    try {
        console.log(`✍️ Procesando firma para token: ${token}`);
        console.log(`📝 Campos recibidos: ${fields ? fields.length : 0}`);

        // Verificar que el token existe y no ha sido completado
        const recipientQuery = `
            SELECT 
                dr.recipient_id,
                dr.document_id,
                dr.status,
                d.file_path,
                d.title
            FROM document_recipients dr
            INNER JOIN documents d ON dr.document_id = d.document_id
            WHERE dr.token = ?
        `;

        const [recipients] = await new Promise((resolve, reject) => {
            db.query(recipientQuery, [token], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (recipients.length === 0) {
            console.log('❌ Token no encontrado');
            return res.status(404).json({
                success: false,
                message: 'Token inválido'
            });
        }

        const recipient = recipients[0];

        if (recipient.status === 'completed') {
            console.log('⚠️ Documento ya fue firmado anteriormente');
            return res.status(400).json({
                success: false,
                message: 'Este documento ya ha sido firmado'
            });
        }

        // Guardar los valores de los campos en la base de datos
        if (fields && fields.length > 0) {
            console.log('💾 Guardando valores de campos en field_values...');
            console.log(`📊 Total de campos recibidos: ${fields.length}`);
            
            for (const field of fields) {
                console.log(`\n🔍 Procesando campo:`, {
                    field_id: field.field_id,
                    type: field.type,
                    signed: field.signed,
                    has_dataUrl: !!field.dataUrl,
                    has_textValue: !!field.textValue,
                    has_dateValue: !!field.dateValue
                });
                
                if (field.signed && field.field_id) {
                    let valueType = null;
                    let textValue = null;
                    let signaturePath = null;
                    let dateValue = null;
                    
                    // Extraer el valor según el tipo de campo
                    if (field.type === 'signature' && field.dataUrl) {
                        valueType = 'signature_image';
                        signaturePath = field.dataUrl; // Base64 de la imagen de firma
                        console.log(`   ✅ Firma detectada con dataUrl de ${field.dataUrl.length} caracteres`);
                    } else if (field.type === 'text' && field.textValue) {
                        valueType = 'text';
                        textValue = JSON.stringify({
                            text: field.textValue,
                            style: field.textStyle
                        });
                        console.log(`   ✅ Texto detectado: "${field.textValue}"`);
                    } else if (field.type === 'date' && field.dateValue) {
                        valueType = 'date';
                        dateValue = field.dateValue;
                        console.log(`   ✅ Fecha detectada: ${field.dateValue}`);
                    }
                    
                    if (valueType) {
                        // Insertar en tabla field_values
                        try {
                            await new Promise((resolve, reject) => {
                                db.query(
                                    `INSERT INTO field_values 
                                    (field_id, recipient_id, value_type, text_value, signature_path, date_value) 
                                    VALUES (?, ?, ?, ?, ?, ?)
                                    ON DUPLICATE KEY UPDATE 
                                    value_type = VALUES(value_type),
                                    text_value = VALUES(text_value),
                                    signature_path = VALUES(signature_path),
                                    date_value = VALUES(date_value),
                                    created_at = NOW()`,
                                    [field.field_id, recipient.recipient_id, valueType, textValue, signaturePath, dateValue],
                                    (err, results) => {
                                        if (err) reject(err);
                                        else resolve(results);
                                    }
                                );
                            });
                            console.log(`   ✓ Campo ${field.type} (field_id: ${field.field_id}) guardado en BD`);
                        } catch (err) {
                            console.error(`   ❌ Error guardando campo ${field.field_id}:`, err.message);
                        }
                    }
                }
            }
        }

        // Actualizar el estado del recipient a 'completed'
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE document_recipients SET status = ?, completed_at = NOW() WHERE token = ?',
                ['completed', token],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Documento firmado exitosamente');
        console.log('📊 Estado actualizado a completed');

        // TODO: Aquí se puede agregar lógica para:
        // 1. Guardar las imágenes de firma en el sistema de archivos
        // 3. Generar PDF firmado con todos los campos incrustados
        // 4. Enviar notificación por email al remitente

        res.json({
            success: true,
            message: 'Documento firmado exitosamente',
            data: {
                documentId: recipient.document_id,
                documentTitle: recipient.title,
                completedAt: new Date().toISOString(),
                fieldsProcessed: fields ? fields.filter(f => f.signed).length : 0
            }
        });

    } catch (error) {
        console.error('❌ Error al procesar firma:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar la firma',
            error: error.message
        });
    }
});

// GET /api/documents/:docId/recipients/:recipientId/values - Obtener valores completados
app.get('/api/documents/:docId/recipients/:recipientId/values', async (req, res) => {
    const { docId, recipientId } = req.params;
    const userId = req.query.user_id;

    try {
        console.log(`📥 Obteniendo valores completados para doc: ${docId}, recipient: ${recipientId}`);

        // Verificar que el usuario sea el propietario del documento
        const ownerCheck = await new Promise((resolve, reject) => {
            db.query(
                'SELECT owner_id FROM documents WHERE document_id = ?',
                [docId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (ownerCheck.length === 0 || ownerCheck[0].owner_id != userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para ver este documento'
            });
        }

        // Obtener los valores completados
        const valuesQuery = `
            SELECT 
                fv.value_id,
                fv.field_id,
                fv.value_type,
                fv.text_value,
                fv.signature_path,
                fv.date_value,
                fv.created_at,
                df.field_type,
                df.field_label
            FROM field_values fv
            INNER JOIN document_fields df ON fv.field_id = df.field_id
            WHERE fv.recipient_id = ?
            ORDER BY fv.field_id ASC
        `;

        const [values] = await new Promise((resolve, reject) => {
            db.query(valuesQuery, [recipientId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        console.log(`✅ ${values.length} valor(es) encontrado(s)`);

        res.json({
            success: true,
            values: values
        });

    } catch (error) {
        console.error('❌ Error obteniendo valores completados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener los valores',
            error: error.message
        });
    }
});

// GET /api/documents/:docId/recipients/:recipientId/download - Descargar PDF completado
app.get('/api/documents/:docId/recipients/:recipientId/download', async (req, res) => {
    const { docId, recipientId } = req.params;
    const userId = req.query.user_id;

    try {
        console.log(`📥 Descargando PDF para doc: ${docId}, recipient: ${recipientId}`);

        // Verificar que el usuario sea el propietario del documento
        const [documentInfo] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.document_id, d.title, d.file_path, d.owner_id, 
                        dr.email, dr.completed_at, dr.status as recipient_status
                 FROM documents d 
                 INNER JOIN document_recipients dr ON d.document_id = dr.document_id 
                 WHERE d.document_id = ? AND dr.recipient_id = ?`,
                [docId, recipientId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (documentInfo.length === 0) {
            return res.status(404).json({ success: false, message: 'Documento no encontrado' });
        }

        const document = documentInfo[0];
        
        console.log(`📋 Documento: ${document.title}, Status recipient: ${document.recipient_status}`);

        if (document.owner_id != userId) {
            return res.status(403).json({ success: false, message: 'No tienes permiso para descargar este documento' });
        }

        // Obtener la ruta del archivo original
        // Eliminar la barra inicial si existe para que path.resolve funcione correctamente
        let relativePath = document.file_path;
        if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }
        const filePath = path.resolve(__dirname, '..', relativePath);
        
        console.log(`📁 Ruta del archivo: ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Archivo no encontrado en: ${filePath}`);
            return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
        }

        // Definir nombre del archivo
        const fileName = document.recipient_status === 'completed'
            ? `${document.title}_completado_${document.email}.pdf`
            : `${document.title}_${document.email}.pdf`;

        // Si el documento NO está completado, enviar el PDF original
        if (document.recipient_status !== 'completed') {
            console.log('📄 Documento sin completar, enviando PDF original');
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            
            console.log(`✅ PDF original enviado: ${fileName}`);
            return;
        }

        // Si está completado, obtener campos y valores para embeber
        console.log('✅ Documento completado, embebiendo valores...');

        // Obtener campos del documento
        const [fields] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT field_id, field_type as type, page_number as page, 
                        x_position as x, y_position as y, width as w, height as h, field_label
                 FROM document_fields 
                 WHERE document_id = ? 
                 ORDER BY field_id ASC`,
                [docId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        // Obtener valores completados
        const [values] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT fv.field_id, fv.value_type, fv.text_value, fv.signature_path, fv.date_value
                 FROM field_values fv
                 WHERE fv.recipient_id = ?`,
                [recipientId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        console.log(`📊 Campos: ${fields.length}, Valores: ${values.length}`);

        // Embeber valores en el PDF
        const pdfBytes = await embedValuesInPdf(filePath, fields, values);

        // Enviar el PDF modificado
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.setHeader('Content-Length', pdfBytes.length);
        
        res.send(Buffer.from(pdfBytes));

        console.log(`✅ PDF completado enviado: ${fileName} (${pdfBytes.length} bytes)`);

    } catch (error) {
        console.error('❌ Error descargando PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error al descargar el PDF',
            error: error.message
        });
    }
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});