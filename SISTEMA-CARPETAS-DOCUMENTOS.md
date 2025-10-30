# 📁 SISTEMA DE CARPETAS Y DOCUMENTOS MULTIUSUARIO

## ✅ IMPLEMENTACIÓN COMPLETADA

Se ha implementado un sistema completo de carpetas y documentos con las siguientes características:

### 🎯 Características Principales

1. **Sesiones Individuales por Usuario**
   - Cada usuario solo ve sus propias carpetas y documentos
   - Filtrado automático por `user_id`
   - Sistema de autenticación con localStorage

2. **Gestión de Carpetas**
   - Crear carpetas personalizadas
   - Listar carpetas con contador de documentos
   - Filtrar por tags (mine, shared, archived)
   - Búsqueda en tiempo real
   - Soft delete (carpetas no se eliminan físicamente)

3. **Gestión de Documentos**
   - Upload de múltiples archivos simultáneos
   - Soporte para: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, PNG, JPG, JPEG, WEBP
   - Tamaño máximo: 50MB por archivo
   - Asociación a carpetas
   - Metadatos completos

4. **Trazabilidad Completa**
   - Tabla `activity_log` registra todas las acciones
   - IP address y user agent
   - Timestamps de todas las operaciones
   - Logs en consola con emojis 📝🔐📂📄✅❌

5. **Permisos (Futuro)**
   - Sistema de `shared_access` preparado
   - Compartir carpetas entre usuarios
   - Niveles de permiso: view, edit, admin

---

## 📊 ARCHIVOS CREADOS/MODIFICADOS

### Backend

#### Nuevos Archivos:
1. **`backend/database/folders-schema.sql`** (288 líneas)
   - Tablas: folders, documents, shared_access, activity_log
   - Vistas: v_folders_with_counts, v_documents_full
   - Función: generate_folder_slug()
   - Datos de prueba

2. **`backend/middleware/auth.js`** (200 líneas)
   - `requireAuth()` - Middleware de autenticación
   - `requireRole(...roles)` - Middleware de permisos por rol
   - `requestLogger()` - Log de todas las requests
   - `logActivity()` - Helper para registrar en activity_log

3. **`backend/controllers/folders-controller.js`** (500 líneas)
   - `GET /api/folders` - Listar carpetas
   - `GET /api/folders/:id` - Obtener carpeta específica
   - `POST /api/folders` - Crear carpeta
   - `PUT /api/folders/:id` - Actualizar carpeta
   - `DELETE /api/folders/:id` - Eliminar carpeta (soft delete)

4. **`backend/controllers/documents-controller.js`** (550 líneas)
   - `GET /api/documents` - Listar documentos
   - `GET /api/documents/:id` - Obtener documento específico
   - `POST /api/documents/upload` - Subir archivos (múltiples)
   - `PUT /api/documents/:id` - Actualizar documento
   - `DELETE /api/documents/:id` - Eliminar documento (soft delete)
   - Configuración de Multer para uploads

#### Archivos Modificados:
1. **`backend/server.js`**
   - Importación de nuevos controladores
   - Registro de rutas `/api/folders` y `/api/documents`
   - Compartir conexión DB con controladores
   - Middleware de logging global

### Frontend

#### Archivos Modificados:
1. **`frontend/script.js`** (index.html)
   - `USE_API = true` ✅ API habilitada
   - `getCurrentUser()` - Helper para obtener usuario de localStorage
   - `fetchFoldersAPI()` - Envía user_id en query params
   - Botón "Crear Folder" funcional (crea en BD)
   - Botón "SUBIR" funcional (sube archivos reales)
   - Logs de trazabilidad en consola

2. **`frontend/public/Main/folder.js`**
   - `fetchDocs()` - Carga documentos desde API real
   - `uploadFilesInFolder()` - Sube archivos con user_id
   - Logs de trazabilidad

---

## 🚀 INSTRUCCIONES DE INSTALACIÓN

### PASO 1: Crear las Tablas en MySQL

#### Opción A: phpMyAdmin (Recomendado)
1. Abre http://localhost/phpmyadmin
2. Selecciona la base de datos `firmalegalonline`
3. Ve a la pestaña "SQL"
4. Abre el archivo `backend/database/folders-schema.sql`
5. Copia TODO el contenido del archivo
6. Pégalo en el editor SQL de phpMyAdmin
7. Click en "Ejecutar" (botón azul abajo a la derecha)
8. Deberías ver mensajes de éxito

#### Opción B: Línea de comandos (MySQL CLI)
```bash
# Navegar al directorio del proyecto
cd "c:\Users\juand\Documents\JUAN DIEGO\Empresa\Firmalegal\27-10-2025\Firmalegal-main1"

# Ejecutar script SQL
mysql -u root -p firmalegalonline < backend\database\folders-schema.sql

# Presiona Enter (la contraseña está vacía)
```

### PASO 2: Verificar que las Tablas se Crearon

Ejecuta este query en phpMyAdmin o MySQL:

```sql
USE firmalegalonline;

-- Ver todas las tablas
SHOW TABLES;

-- Deberías ver:
-- activity_log
-- documents
-- folders
-- roles
-- shared_access
-- signature_audit_log
-- signature_documents
-- signature_fields
-- signatures
-- saved_signatures
-- users

-- Ver estructura de carpetas
DESC folders;

-- Ver datos de prueba insertados
SELECT * FROM folders;
SELECT * FROM documents;
```

**Resultado Esperado:**
- ✅ 2 carpetas para usuario PKI Services (user_id=1):
  - "Contratos Legales" (folder_id=1)
  - "Documentos Corporativos" (folder_id=2)
- ✅ 2 carpetas para usuario ARRIETA HERRERA (user_id=2):
  - "Mis Proyectos" (folder_id=3)
  - "Archivados" (folder_id=4)
- ✅ 2 documentos de ejemplo en "Contratos Legales"

### PASO 3: Crear Directorios de Upload (Si No Existen)

```bash
# Desde el directorio raíz del proyecto
mkdir uploads
mkdir uploads\documents
mkdir uploads\signatures
mkdir uploads\signed
```

O créalos manualmente en el explorador de Windows:
```
Firmalegal-main1/
  └── uploads/
      ├── documents/     ← Los PDFs y documentos se guardan aquí
      ├── signatures/    ← Firmas digitales (PNG)
      └── signed/        ← PDFs firmados
```

### PASO 4: Iniciar el Servidor

```bash
# Desde el directorio raíz
cd "c:\Users\juand\Documents\JUAN DIEGO\Empresa\Firmalegal\27-10-2025\Firmalegal-main1"

# Iniciar servidor
npm run dev

# O alternativamente:
node backend/server.js
```

**Deberías ver en consola:**
```
🟢 Conectado a MariaDB
📁 Registrando rutas de carpetas y documentos...
✅ Rutas registradas exitosamente
🚀 Servidor escuchando en http://localhost:3000
```

---

## 🧪 PRUEBAS PASO A PASO

### TEST 1: Verificar que el Sistema Funciona con Usuario PKI Services

1. **Abrir navegador**: http://localhost:3000/login.html

2. **Iniciar sesión con PKI Services:**
   - Email: `pkiservices@admin.com`
   - Contraseña: `123456` (o la que hayas configurado)

3. **Verificar Dashboard:**
   - Deberías ver automáticamente 2 carpetas:
     - "Contratos Legales" (12 ítems)
     - "Documentos Corporativos" (0 ítems)
   - ✅ **IMPORTANTE**: Estos son datos reales de la BD, NO estáticos

4. **Abrir Consola del Navegador** (F12 → Console):
   ```
   📡 [API] Solicitando carpetas: /api/folders?user_id=1&filter=*
   👤 Usuario actual: PKI Services (ID: 1)
   ✅ [API] Respuesta recibida: {ok: true, data: [...]}
   📂 [API] 2 carpetas cargadas
   ```

5. **Verificar Logs del Servidor** (Terminal donde corre Node):
   ```
   📥 [2025-01-XX...] GET /api/folders?user_id=1
      IP: ::1
      User-Agent: Mozilla/5.0...

   🔐 [AUTH] Verificando autenticación...
      Query: {"user_id":"1","filter":"*"}
   ✅ [AUTH] Usuario autenticado: user_id=1

   📂 [FOLDERS] GET /api/folders
      Usuario: 1
      Filtro: *
      Búsqueda: (ninguna)
   ✅ [FOLDERS] 2 carpetas encontradas

   📝 [LOG] Actividad registrada: list_folders (user=1, entity=folder:null)
   ```

### TEST 2: Crear una Nueva Carpeta

1. **En index.html, click botón "CREAR"**

2. **En el modal que abre:**
   - Ignora el nombre del documento (para después)
   - Scroll hasta abajo
   - Click en "Crear Folder"

3. **En el prompt que aparece:**
   - Escribe: `Proyectos 2025`
   - Click OK

4. **Verificar en consola del navegador:**
   ```
   📁 Creando nueva carpeta: Proyectos 2025
   ✅ Carpeta creada: {folder_id: 5, folder_name: "Proyectos 2025", ...}
   📡 [API] Solicitando carpetas: /api/folders?user_id=1&filter=*
   📂 [API] 3 carpetas cargadas
   ```

5. **Verificar en consola del servidor:**
   ```
   📂 [FOLDERS] POST /api/folders
      Usuario: 1
      Body: {
        "folder_name": "Proyectos 2025",
        "user_id": 1,
        "tag": "mine"
      }
      Slug generado: proyectos-2025
   ✅ [FOLDERS] Carpeta creada: Proyectos 2025 (ID: 5)
   📝 [LOG] Actividad registrada: create_folder (user=1, entity=folder:5)
   ```

6. **Verificar en BD (phpMyAdmin):**
   ```sql
   SELECT * FROM folders WHERE user_id = 1;
   ```
   Deberías ver 3 carpetas ahora (incluyendo "Proyectos 2025")

7. **Verificar en activity_log:**
   ```sql
   SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 5;
   ```
   Deberías ver el registro de `create_folder`

### TEST 3: Subir un Archivo a una Carpeta

1. **Click en la carpeta "Proyectos 2025"** (la recién creada)

2. **Se abre folder.html:**
   - URL: `folder.html?id=5&name=Proyectos%202025`
   - Título: "Proyectos 2025"
   - Mensaje: "No hay documentos en esta carpeta."

3. **Click en botón "SUBIR"**

4. **Selecciona un archivo PDF** (o cualquier documento permitido)

5. **Verificar en consola del navegador:**
   ```
   📤 [FOLDER] Subiendo 1 archivo(s) a carpeta "Proyectos 2025"...
   📤 FormData: {folder_id: "5", folder_name: "Proyectos 2025", user_id: 1, files_count: 1}
   ✅ Respuesta del servidor: {ok: true, data: [{document_id: 3, ...}]}
   📡 [FOLDER] Solicitando documentos: /api/documents?folder_id=5&is_template=1&user_id=1
   📄 [API] 1 documentos cargados
   ```

6. **Verificar en consola del servidor:**
   ```
   📄 [DOCUMENTS] POST /api/documents/upload
      Usuario: 1
      Archivos recibidos: 1
   📄 Archivo recibido: documento.pdf (application/pdf)
      📄 Procesando archivo 1/1: documento.pdf
         ✅ Documento guardado en BD: ID 3
   📝 [LOG] Actividad registrada: upload_document (user=1, entity=document:3)
   ✅ [DOCUMENTS] 1 documentos subidos exitosamente
   ```

7. **Verificar que el archivo aparece en la UI:**
   - Deberías ver una tarjeta con el nombre del documento
   - Con tu nombre completo (PKI SERVICES)
   - Con la fecha actual

8. **Verificar en el sistema de archivos:**
   ```
   c:\...\Firmalegal-main1\uploads\documents\
   ```
   Deberías ver un archivo con formato: `1234567890_documento.pdf`

9. **Verificar en BD:**
   ```sql
   SELECT * FROM documents WHERE owner_id = 1;
   SELECT * FROM activity_log WHERE action = 'upload_document';
   ```

### TEST 4: Verificar Separación de Sesiones (Multiusuario)

1. **Cerrar sesión** (botón avatar → Cerrar sesión)

2. **Iniciar sesión con ARRIETA HERRERA:**
   - Email: `juandiegoarrietaherrera@gmail.com`
   - Contraseña: (la que hayas configurado)

3. **Verificar que ve SOLO sus carpetas:**
   - Deberías ver 2 carpetas:
     - "Mis Proyectos"
     - "Archivados"
   - ❌ NO deberías ver las carpetas de PKI Services

4. **Verificar en consola del navegador:**
   ```
   👤 Usuario actual: ARRIETA HERRERA (ID: 2)
   📡 [API] Solicitando carpetas: /api/folders?user_id=2&filter=*
   📂 [API] 2 carpetas cargadas
   ```

5. **Crear una carpeta nueva:**
   - Nombre: `Mis Contratos`
   - Debería crearse con `user_id=2`

6. **Verificar en BD:**
   ```sql
   -- Carpetas de PKI Services (user_id=1)
   SELECT * FROM folders WHERE user_id = 1;
   -- Deberías ver: Contratos Legales, Documentos Corporativos, Proyectos 2025

   -- Carpetas de ARRIETA (user_id=2)
   SELECT * FROM folders WHERE user_id = 2;
   -- Deberías ver: Mis Proyectos, Archivados, Mis Contratos

   -- Confirmar separación total
   SELECT user_id, folder_name FROM folders ORDER BY user_id, folder_id;
   ```

---

## 📝 LOGS Y TRAZABILIDAD

### Dónde Ver los Logs

#### 1. Consola del Navegador (F12 → Console)
- Logs del frontend con emojis
- Requests/responses de API
- Errores de JavaScript

#### 2. Terminal del Servidor (donde corre `npm run dev`)
- Logs del backend con emojis
- Autenticación y permisos
- Queries SQL (si los activas)
- Activity log registrado

#### 3. Base de Datos (activity_log)
```sql
-- Ver últimas 20 actividades
SELECT
  log_id,
  user_id,
  action,
  entity_type,
  entity_id,
  details,
  ip_address,
  created_at
FROM activity_log
ORDER BY created_at DESC
LIMIT 20;

-- Ver actividades de un usuario específico
SELECT * FROM activity_log WHERE user_id = 1;

-- Ver actividades por tipo
SELECT action, COUNT(*) as count
FROM activity_log
GROUP BY action;
```

### Tipos de Acciones Registradas

| Acción | Descripción |
|--------|-------------|
| `list_folders` | Usuario listó sus carpetas |
| `create_folder` | Usuario creó una carpeta |
| `update_folder` | Usuario editó una carpeta |
| `delete_folder` | Usuario eliminó una carpeta |
| `view_document` | Usuario abrió un documento |
| `upload_document` | Usuario subió un archivo |
| `update_document` | Usuario editó metadata de documento |
| `delete_document` | Usuario eliminó un documento |

---

## 🎯 QUERIES ÚTILES PARA VERIFICACIÓN

```sql
-- 1. Ver resumen de carpetas por usuario
SELECT
  u.first_name,
  u.last_name,
  COUNT(f.folder_id) as total_folders
FROM users u
LEFT JOIN folders f ON u.user_id = f.user_id AND f.is_active = TRUE
GROUP BY u.user_id;

-- 2. Ver carpetas con contador de documentos (usa la vista)
SELECT * FROM v_folders_with_counts;

-- 3. Ver documentos con información completa (usa la vista)
SELECT * FROM v_documents_full;

-- 4. Ver actividad reciente
SELECT
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as fecha,
  CONCAT(u.first_name, ' ', u.last_name) as usuario,
  action as accion,
  entity_type as tipo,
  entity_id as id
FROM activity_log al
LEFT JOIN users u ON al.user_id = u.user_id
ORDER BY al.created_at DESC
LIMIT 10;

-- 5. Verificar integridad referencial
SELECT
  'Folders sin owner' as tipo,
  COUNT(*) as count
FROM folders f
LEFT JOIN users u ON f.user_id = u.user_id
WHERE u.user_id IS NULL

UNION ALL

SELECT
  'Documentos sin owner',
  COUNT(*)
FROM documents d
LEFT JOIN users u ON d.owner_id = u.user_id
WHERE u.user_id IS NULL;

-- 6. Ver estadísticas por usuario
SELECT
  u.user_id,
  CONCAT(u.first_name, ' ', u.last_name) as usuario,
  COUNT(DISTINCT f.folder_id) as carpetas,
  COUNT(DISTINCT d.document_id) as documentos,
  SUM(d.file_size) / 1024 / 1024 as mb_usados
FROM users u
LEFT JOIN folders f ON u.user_id = f.user_id AND f.is_active = TRUE
LEFT JOIN documents d ON u.user_id = d.owner_id AND d.status = 'active'
GROUP BY u.user_id;
```

---

## ⚠️ TROUBLESHOOTING

### Problema: "Usuario no autenticado"

**Síntoma:**
- Consola del navegador: `❌ Usuario no autenticado, redirigiendo a login...`
- Redirige automáticamente a login.html

**Causa:**
- No hay datos en `localStorage.getItem('currentUser')`
- El usuario no ha iniciado sesión correctamente

**Solución:**
1. Asegúrate de iniciar sesión desde `/login.html`
2. Verifica en consola del navegador:
   ```javascript
   localStorage.getItem('currentUser')
   // Debería retornar un JSON con user_id, first_name, etc.
   ```
3. Si está vacío, el endpoint `/api/login` no está guardando el usuario
4. Verifica que [auth.js](frontend/public/Main/auth.js) o [login.js](frontend/public/Main/M-styles/login.js) guarde el usuario tras login exitoso

### Problema: "Error HTTP 401"

**Síntoma:**
- API responde con status 401
- Consola del servidor: `❌ [AUTH] Usuario no autenticado`

**Causa:**
- El `user_id` no se está enviando en la request
- O el middleware `requireAuth` no lo encuentra

**Solución:**
1. Verifica en consola del navegador que se envía `user_id`:
   ```
   📡 [API] Solicitando carpetas: /api/folders?user_id=1&filter=*
   ```
2. Si falta, verifica que `getCurrentUser()` retorne el usuario
3. Verifica en consola del servidor que llegue:
   ```
   🔐 [AUTH] Verificando autenticación...
      Query: {"user_id":"1"}
   ```

### Problema: "No se ven las carpetas"

**Síntoma:**
- La página carga pero no muestra carpetas
- Consola: `📂 [API] 0 carpetas cargadas`

**Causa:**
- No hay carpetas en BD para ese usuario
- O la query filtra mal

**Solución:**
1. Verifica en BD:
   ```sql
   SELECT * FROM folders WHERE user_id = 1 AND is_active = TRUE;
   ```
2. Si no hay datos, ejecuta los INSERT de `folders-schema.sql`:
   ```sql
   INSERT INTO folders (folder_name, folder_slug, user_id, tag, folder_description) VALUES
   ('Contratos Legales', 'contratos-legales', 1, 'mine', 'Plantillas de contratos'),
   ('Documentos Corporativos', 'documentos-corporativos', 1, 'mine', 'Docs oficiales');
   ```

### Problema: "Error al subir archivos"

**Síntoma:**
- Upload falla con error HTTP 500
- Consola del servidor: `❌ [DOCUMENTS] Error: ENOENT: no such file or directory`

**Causa:**
- El directorio `/uploads/documents/` no existe

**Solución:**
```bash
mkdir uploads
mkdir uploads\documents
```

### Problema: "Las carpetas son siempre las mismas (datos demo)"

**Síntoma:**
- Siempre ves "Pki Services" y "Proyecto Yakitori" sin importar el usuario
- Crear carpetas no hace nada

**Causa:**
- `USE_API` está en `false` (modo demo)
- O la API falla y usa fallback

**Solución:**
1. Verifica en [script.js:8](frontend/script.js#L8):
   ```javascript
   const USE_API = true; // ✅ Debe estar en true
   ```
2. Si está en true pero usa fallback, revisa errores en consola

---

## 🎉 ÉXITO - CÓMO SABER QUE TODO FUNCIONA

### ✅ Checklist de Validación

- [ ] Al hacer login con PKI Services veo 2 carpetas reales de BD
- [ ] Al hacer login con ARRIETA veo carpetas diferentes
- [ ] Puedo crear una carpeta nueva y aparece inmediatamente
- [ ] Puedo subir un archivo PDF y se guarda en `/uploads/documents/`
- [ ] El archivo aparece listado en la carpeta correspondiente
- [ ] Los logs aparecen en consola del navegador con emojis
- [ ] Los logs aparecen en consola del servidor con emojis
- [ ] La tabla `activity_log` tiene registros nuevos
- [ ] Los contadores de ítems en carpetas son correctos
- [ ] Al cerrar sesión y volver a entrar, los datos persisten

---

## 📞 PRÓXIMOS PASOS

1. **Implementar botón "Crear" del modal completo**
   - Actualmente solo crea carpetas
   - Falta integrar la creación de plantillas con archivos

2. **Implementar vista de documentos**
   - Al hacer click en un documento, abrirlo o descargarlo
   - Integrar con el módulo de firmas existente

3. **Implementar compartir carpetas**
   - Usar tabla `shared_access`
   - Agregar UI para compartir con otros usuarios

4. **Mejorar autenticación**
   - Implementar JWT en lugar de query params
   - Usar headers `Authorization: Bearer <token>`
   - Implementar express-session

5. **Implementar búsqueda full-text**
   - Activar índices FULLTEXT en MySQL
   - Buscar en títulos y contenidos de documentos

6. **Dashboard con estadísticas**
   - Total de carpetas por usuario
   - Total de documentos
   - Espacio usado
   - Actividad reciente

---

## 📚 REFERENCIAS

- Documentación de Express.js: https://expressjs.com/
- Documentación de Multer: https://github.com/expressjs/multer
- Documentación de MySQL2: https://github.com/sidorares/node-mysql2
- Documentación de bcrypt: https://github.com/kelektiv/node.bcrypt.js

---

**¡Sistema implementado exitosamente! 🎉**

Cualquier duda, revisa los logs en consola del navegador y del servidor.
Todos los mensajes tienen emojis para facilitar el debugging visual.
