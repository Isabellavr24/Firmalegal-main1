const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Importar controlador de firmas
const signaturesController = require('./signatures-controller');

// =============================================
// IMPORTAR NUEVOS CONTROLADORES Y MIDDLEWARE
// =============================================
const foldersController = require('./controllers/folders-controller');
const documentsController = require('./controllers/documents-controller');
const { requestLogger } = require('./middleware/auth');

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

const db = mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: '1234', 
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

app.listen(port, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${port}`);
});