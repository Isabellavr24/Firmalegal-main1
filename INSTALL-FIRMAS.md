# 🚀 GUÍA DE INSTALACIÓN - Sistema de Firmas

## 📋 Requisitos Previos

- ✅ Node.js v14+ instalado
- ✅ MySQL/MariaDB instalado y corriendo
- ✅ GraphicsMagick instalado (para generar previews)

---

## 📦 PASO 1: Instalar Dependencias

### 1.1 Instalar paquetes NPM

```bash
cd "c:\Users\juand\Documents\JUAN DIEGO\Empresa\Firmalegal\23-10-2025\Firmalegal-main1-main"
npm install
```

### 1.2 Instalar GraphicsMagick (Windows)

1. Descargar instalador desde: http://www.graphicsmagick.org/download.html
2. Elegir: **GraphicsMagick-X.X.X-Q16-win64-dll.exe**
3. Ejecutar instalador
4. ✅ Marcar: "Add to PATH"
5. Reiniciar terminal

**Verificar instalación:**
```bash
gm version
```

**Alternativa sin GraphicsMagick:**
Si no puedes instalar GM, el sistema seguirá funcionando pero sin imágenes de preview.

---

## 🗄️ PASO 2: Configurar Base de Datos

### 2.1 Crear las tablas

**Opción A: Desde terminal**
```bash
mysql -u root -p firmalegalonline < backend/database/signatures-schema.sql
```

**Opción B: Desde phpMyAdmin**
1. Abrir phpMyAdmin: http://localhost/phpmyadmin
2. Seleccionar base de datos: `firmalegalonline`
3. Ir a pestaña "SQL"
4. Copiar y pegar contenido de: `backend/database/signatures-schema.sql`
5. Click "Ejecutar"

### 2.2 Verificar tablas creadas

```sql
SHOW TABLES;
```

Deberías ver:
- ✅ signature_documents
- ✅ signature_fields
- ✅ signatures
- ✅ saved_signatures
- ✅ signature_audit_log

---

## 📁 PASO 3: Crear Carpetas de Uploads

### Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force -Path "uploads/documents"
New-Item -ItemType Directory -Force -Path "uploads/signatures"
New-Item -ItemType Directory -Force -Path "uploads/signed"
New-Item -ItemType Directory -Force -Path "uploads/previews"
```

### Windows CMD:
```cmd
mkdir uploads\documents
mkdir uploads\signatures
mkdir uploads\signed
mkdir uploads\previews
```

### Git Bash / Linux:
```bash
mkdir -p uploads/{documents,signatures,signed,previews}
```

---

## ⚙️ PASO 4: Configurar Credenciales de BD

Editar: `backend/lib/signatures/storage.js`

```javascript
// Línea 22-28
this.pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',           // ← Tu usuario
    password: '',           // ← Tu contraseña
    database: 'firmalegalonline',
    // ...
});
```

---

## 🚀 PASO 5: Iniciar Servidor

```bash
npm run dev
```

O:
```bash
node backend/server.js
```

Deberías ver:
```
🔗 Pool de conexiones MySQL inicializado
🟢 Conectado a MariaDB
🚀 Servidor escuchando en http://localhost:3000
```

---

## ✅ PASO 6: Verificar Instalación

### 6.1 Abrir en navegador:

```
http://localhost:3000/sign.html
```

### 6.2 Abrir consola del navegador (F12)

Pegar este script de prueba:

```javascript
// Test de API
fetch('/api/signatures/my-documents?userId=1')
  .then(r => r.json())
  .then(data => console.log('✅ API funcionando:', data))
  .catch(err => console.error('❌ Error:', err));
```

Si ves `✅ API funcionando:`, ¡todo está bien!

---

## 🧪 PASO 7: Probar el Sistema

### Opción A: Usar la interfaz web

1. Ir a: `http://localhost:3000/sign.html`
2. Click en "⬆️ SUBIR"
3. Seleccionar un PDF de prueba
4. Click en "✍️ Firma" en el panel derecho
5. Click en el PDF para colocar campo de firma
6. Click en el campo para dibujar firma
7. Click "GUARDAR"

### Opción B: Usar script de tests

1. Abrir: `http://localhost:3000/sign.html`
2. Abrir consola (F12)
3. Pegar contenido de: `backend/test-signatures.js`
4. Ejecutar:

```javascript
await signatureTests.testListDocuments();
```

---

## 🔧 TROUBLESHOOTING

### ❌ Error: "Cannot find module 'pdf-lib'"

**Solución:**
```bash
npm install
```

### ❌ Error: "ECONNREFUSED" al conectar MySQL

**Solución:**
1. Verificar que MySQL esté corriendo:
   ```bash
   mysql -u root -p
   ```
2. Verificar credenciales en `storage.js`

### ❌ Error: "pdf2pic" no funciona

**Causa:** GraphicsMagick no instalado

**Solución 1:** Instalar GraphicsMagick (ver Paso 1.2)

**Solución 2:** Deshabilitar previews
```javascript
// En process-pdf.js, línea 44:
// Comentar esta línea:
// const previewImages = await this.generatePreviewImages(pdfPath, numPages);

// Reemplazar con:
const previewImages = [];
```

### ❌ Error: "File too large"

**Solución:** Aumentar límite en `signatures-controller.js`:

```javascript
// Línea 23
limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
```

### ❌ Error: "Cannot read properties of undefined (reading 'signature')"

**Causa:** Tabla `signatures` no creada

**Solución:** Ejecutar SQL de nuevo (Paso 2)

### ⚠️ Warning: "⚠️ Continuando sin imágenes de preview"

**Es normal si no tienes GraphicsMagick.** El sistema funciona sin previews.

---

## 🎯 SIGUIENTES PASOS

### 1. Integrar con tu sign.html

Copiar funciones de: `frontend/public/Main/sign-backend-integration.js`

### 2. Agregar autenticación

Modificar controlador para usar sesiones:

```javascript
// En signatures-controller.js
const requireAuth = (req, res, next) => {
    if (!req.session?.userId) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
    }
    next();
};

router.use(requireAuth);
```

### 3. Agregar validación de permisos

Solo permitir acceso a documentos propios:

```javascript
// Ya está implementado en storage.js
const doc = await storage.getDocument(documentId, userId);
```

---

## 📚 Archivos Importantes

```
backend/
├── signatures-controller.js          ← Endpoints de API
├── lib/signatures/
│   ├── process-pdf.js               ← Procesar PDFs
│   ├── embed-signatures.js          ← Incrustar firmas
│   └── storage.js                   ← Base de datos
├── database/
│   └── signatures-schema.sql        ← Schema SQL
├── FIRMAS-README.md                 ← Documentación completa
└── test-signatures.js               ← Tests

frontend/public/Main/
├── sign.html                        ← Interfaz
├── sign.js                          ← Lógica original
└── sign-backend-integration.js      ← Integración con backend
```

---

## 📞 Soporte

Si tienes problemas:

1. ✅ Verificar logs del servidor (terminal donde corre `npm run dev`)
2. ✅ Verificar consola del navegador (F12)
3. ✅ Revisar que las tablas existen en MySQL
4. ✅ Verificar permisos de carpeta `uploads/`

---

## ✨ ¡Sistema Listo!

Ahora puedes:
- ✅ Subir PDFs
- ✅ Colocar campos de firma
- ✅ Dibujar firmas
- ✅ Generar PDFs firmados
- ✅ Descargar documentos firmados

**Siguiente:** Integrar con tu flujo de usuarios y permisos existente.
