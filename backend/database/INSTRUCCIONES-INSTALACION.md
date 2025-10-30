# 📋 INSTRUCCIONES DE INSTALACIÓN - SISTEMA DE CARPETAS Y DOCUMENTOS

## ✅ PASO 1: Crear las tablas en MySQL

### Opción A: Desde phpMyAdmin (Recomendado)
1. Abre phpMyAdmin: http://localhost/phpmyadmin
2. Selecciona la base de datos `firmalegalonline`
3. Ve a la pestaña "SQL"
4. Copia y pega el contenido completo de `folders-schema.sql`
5. Click en "Ejecutar"

### Opción B: Desde línea de comandos
```bash
# Windows (CMD)
cd "c:\Users\juand\Documents\JUAN DIEGO\Empresa\Firmalegal\27-10-2025\Firmalegal-main1\backend\database"
mysql -u root -p firmalegalonline < folders-schema.sql

# Te pedirá la contraseña (dejar vacío si no tiene contraseña)
```

## ✅ PASO 2: Verificar que las tablas se crearon

Ejecuta este query en phpMyAdmin o MySQL:

```sql
USE firmalegalonline;

-- Ver todas las tablas
SHOW TABLES;

-- Deberías ver:
-- folders
-- documents
-- shared_access
-- activity_log

-- Ver estructura de carpetas
DESC folders;

-- Ver datos de prueba
SELECT * FROM folders;
SELECT * FROM documents;
```

## ✅ PASO 3: Instalar dependencias adicionales de Node.js

```bash
cd "c:\Users\juand\Documents\JUAN DIEGO\Empresa\Firmalegal\27-10-2025\Firmalegal-main1"
npm install express-session
```

## ✅ PASO 4: Crear directorio para uploads (si no existe)

```bash
mkdir uploads
mkdir uploads\documents
mkdir uploads\signatures
mkdir uploads\signed
```

## 📊 ESTRUCTURA CREADA

### Tablas:

1. **folders** - Carpetas por usuario
   - folder_id (PK)
   - folder_name
   - folder_slug (URL amigable)
   - user_id (FK a users)
   - tag ('mine', 'shared', 'archived')
   - created_at, updated_at

2. **documents** - Documentos/plantillas
   - document_id (PK)
   - folder_id (FK a folders)
   - title
   - file_path
   - owner_id (FK a users)
   - is_template
   - created_at, updated_at

3. **shared_access** - Permisos compartidos
   - share_id (PK)
   - folder_id (FK a folders)
   - owner_id (FK a users)
   - shared_with_user_id (FK a users)
   - permission_level ('view', 'edit', 'admin')

4. **activity_log** - Trazabilidad
   - log_id (PK)
   - user_id (FK a users)
   - action
   - entity_type
   - entity_id
   - details (JSON)
   - ip_address
   - user_agent
   - created_at

### Datos de prueba insertados:

✅ 2 carpetas para usuario PKI Services (user_id=1):
   - "Contratos Legales"
   - "Documentos Corporativos"

✅ 2 carpetas para usuario ARRIETA HERRERA (user_id=2):
   - "Mis Proyectos"
   - "Archivados"

✅ 2 documentos de ejemplo en "Contratos Legales"

## 🔍 QUERIES ÚTILES PARA VERIFICAR

```sql
-- Ver carpetas de PKI Services
SELECT * FROM v_folders_with_counts WHERE user_id = 1;

-- Ver carpetas de ARRIETA HERRERA
SELECT * FROM v_folders_with_counts WHERE user_id = 2;

-- Ver todos los documentos con información completa
SELECT * FROM v_documents_full;

-- Ver logs de actividad
SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10;
```

## ⚠️ IMPORTANTE

- Cada usuario solo verá sus propias carpetas (filtrado por user_id)
- Las carpetas "shared" son aquellas compartidas con el usuario
- El sistema mantiene log completo de todas las acciones
- Los archivos físicos se guardan en `/uploads/documents/`

## 🚀 Siguiente paso

Una vez verificadas las tablas, ejecutar el servidor con los nuevos endpoints:

```bash
npm run dev
```

El servidor implementará automáticamente:
- GET /api/folders - Listar carpetas del usuario logueado
- POST /api/folders - Crear nueva carpeta
- GET /api/documents - Listar documentos de una carpeta
- POST /api/templates/upload - Subir documentos
