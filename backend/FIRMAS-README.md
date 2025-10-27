# 🖊️ Sistema de Firmas Electrónicas - Firmalegal

Sistema de firmas basado en la arquitectura de **DocuSeal**, adaptado para Node.js + Express + MySQL.

---

## 📋 **Instalación**

### 1. Instalar dependencias

```bash
npm install
```

**Nota:** Se requiere **GraphicsMagick** instalado en el sistema para `pdf2pic`:

- **Windows:** Descargar desde [http://www.graphicsmagick.org/download.html](http://www.graphicsmagick.org/download.html)
- **Mac:** `brew install graphicsmagick`
- **Linux:** `apt-get install graphicsmagick`

### 2. Crear las tablas en la base de datos

Ejecutar el script SQL en MySQL:

```bash
mysql -u root -p firmalegalonline < backend/database/signatures-schema.sql
```

O importarlo manualmente desde phpMyAdmin o tu cliente MySQL favorito.

### 3. Crear carpetas de uploads

```bash
mkdir -p uploads/documents uploads/signatures uploads/signed uploads/previews
```

### 4. Iniciar el servidor

```bash
npm run dev
```

El servidor estará en: `http://localhost:3000`

---

## 🎯 **Endpoints de API**

### **1. Subir documento PDF**

```http
POST /api/signatures/upload-document
Content-Type: multipart/form-data

Campos:
- document (file): Archivo PDF
- userId (string): ID del usuario
```

**Respuesta:**
```json
{
  "success": true,
  "document": {
    "id": 1,
    "fileName": "contrato.pdf",
    "numPages": 3,
    "dimensions": { "width": 595, "height": 842 },
    "previewImages": [...]
  }
}
```

### **2. Guardar campos de firma**

```http
POST /api/signatures/save-fields
Content-Type: application/json

{
  "documentId": 1,
  "userId": 1,
  "fields": [
    {
      "id": "field-123",
      "type": "signature",
      "page": 1,
      "x": 434,
      "y": 131,
      "w": 123,
      "h": 37,
      "required": true
    }
  ]
}
```

### **3. Subir firma (base64)**

```http
POST /api/signatures/upload-signature
Content-Type: application/json

{
  "fieldId": "field-123",
  "userId": 1,
  "signatureData": "data:image/png;base64,iVBORw0KGgo..."
}
```

### **4. Generar PDF firmado**

```http
POST /api/signatures/generate-signed-pdf
Content-Type: application/json

{
  "documentId": 1,
  "userId": 1
}
```

**Respuesta:**
```json
{
  "success": true,
  "signedPdfUrl": "/uploads/signed/signed-123-contrato.pdf",
  "fileName": "contrato-firmado.pdf"
}
```

### **5. Obtener documento**

```http
GET /api/signatures/document/:id?userId=1
```

### **6. Listar mis documentos**

```http
GET /api/signatures/my-documents?userId=1
```

### **7. Eliminar documento**

```http
DELETE /api/signatures/document/:id?userId=1
```

---

## 🏗️ **Arquitectura**

### **Backend (Node.js + Express)**

```
backend/
├── server.js                         # Servidor principal
├── signatures-controller.js          # Controlador de firmas (endpoints)
└── lib/signatures/
    ├── process-pdf.js               # Procesar PDFs (extraer info, generar previews)
    ├── embed-signatures.js          # Incrustar firmas en PDF
    └── storage.js                   # Manejo de BD (guardar/obtener datos)
```

### **Frontend (HTML + Vanilla JS)**

```
frontend/public/Main/
├── sign.html                        # Interfaz de firma
├── sign.js                          # Lógica de cliente
└── M-styles/sign.css               # Estilos
```

### **Base de Datos (MySQL)**

- **signature_documents** - Documentos PDF subidos
- **signature_fields** - Campos de firma posicionados
- **signatures** - Firmas realizadas
- **saved_signatures** - Plantillas de firma guardadas
- **signature_audit_log** - Auditoría de acciones

---

## 🔄 **Flujo de Trabajo**

### **1. Usuario sube PDF**

```javascript
// Frontend
const formData = new FormData();
formData.append('document', pdfFile);
formData.append('userId', currentUserId);

const response = await fetch('/api/signatures/upload-document', {
  method: 'POST',
  body: formData
});
```

### **2. Usuario coloca campos de firma**

El usuario hace clic en el PDF para colocar campos. `sign.js` maneja esto y guarda las coordenadas.

```javascript
// Guardar campos en el backend
await fetch('/api/signatures/save-fields', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentId: docId,
    userId: currentUserId,
    fields: fieldsArray
  })
});
```

### **3. Usuario dibuja su firma**

Canvas signature pad (ya implementado en `sign.js`).

```javascript
// Subir firma
const signatureData = sigPad.toDataURL('image/png');

await fetch('/api/signatures/upload-signature', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fieldId: activeFieldId,
    userId: currentUserId,
    signatureData: signatureData
  })
});
```

### **4. Generar PDF firmado**

```javascript
// Generar PDF final
await fetch('/api/signatures/generate-signed-pdf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentId: docId,
    userId: currentUserId
  })
});
```

---

## 🎨 **Integración con sign.html**

Tu archivo `sign.html` ya está listo. Solo necesitas conectarlo con el backend:

### **Modificar sign.js (ejemplo)**

```javascript
// Al subir PDF
document.getElementById('pdfFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Subir a backend
  const formData = new FormData();
  formData.append('document', file);
  formData.append('userId', getCurrentUserId()); // Implementar esta función

  const response = await fetch('/api/signatures/upload-document', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  currentDocumentId = data.document.id;

  // Continuar con renderizado local...
  pdfBytes = await file.arrayBuffer();
  // ... resto del código original
});

// Al guardar campos
document.getElementById('saveBtn').addEventListener('click', async () => {
  // 1. Guardar campos en BD
  await fetch('/api/signatures/save-fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId: currentDocumentId,
      userId: getCurrentUserId(),
      fields: fields
    })
  });

  // 2. Subir firmas
  for (const field of fields.filter(f => f.signed)) {
    await fetch('/api/signatures/upload-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldId: field.id,
        userId: getCurrentUserId(),
        signatureData: field.dataUrl
      })
    });
  }

  // 3. Generar PDF firmado
  const response = await fetch('/api/signatures/generate-signed-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId: currentDocumentId,
      userId: getCurrentUserId()
    })
  });

  const data = await response.json();
  
  // 4. Descargar PDF
  window.location.href = data.signedPdfUrl;
});
```

---

## 📊 **Coordenadas: Relativas vs Absolutas**

El sistema soporta ambos formatos:

### **Relativas (0.0 - 1.0)** - Recomendado
```javascript
{
  x: 0.73,  // 73% del ancho
  y: 0.156, // 15.6% del alto
  w: 0.207, // 20.7% del ancho
  h: 0.044  // 4.4% del alto
}
```

### **Absolutas (puntos PDF)**
```javascript
{
  x: 434,  // Píxeles desde la izquierda
  y: 131,  // Píxeles desde arriba
  w: 123,  // Ancho en píxeles
  h: 37    // Alto en píxeles
}
```

El backend detecta automáticamente el tipo (si `x <= 1` es relativa).

---

## 🔐 **Seguridad**

### **Recomendaciones:**

1. **Validar userId** en cada request (usar sesiones o JWT)
2. **Verificar permisos** antes de acceder a documentos
3. **Sanitizar nombres** de archivo
4. **Limitar tamaño** de uploads
5. **Auditoría** en `signature_audit_log`

### **Ejemplo con middleware:**

```javascript
// Middleware de autenticación
function requireAuth(req, res, next) {
  const userId = req.session?.userId || req.body.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: 'No autenticado' });
  }
  req.userId = userId;
  next();
}

// Usar en rutas
app.use('/api/signatures', requireAuth, signaturesController);
```

---

## 🐛 **Troubleshooting**

### **Error: "pdf2pic no funciona"**
- Instalar GraphicsMagick: `brew install graphicsmagick`
- O usar alternativa: `npm install sharp` y modificar `process-pdf.js`

### **Error: "No se pueden generar previews"**
- El sistema continúa funcionando sin previews
- Verificar que GraphicsMagick está en el PATH

### **Error: "Cannot read properties of undefined"**
- Verificar que las tablas estén creadas en MySQL
- Ejecutar: `backend/database/signatures-schema.sql`

---

## 📚 **Basado en DocuSeal**

Este sistema replica la arquitectura de [DocuSeal](https://github.com/docusealco/docuseal):

- ✅ Template Builder (campos drag & drop)
- ✅ Signature Pad (dibujar firma)
- ✅ PDF Processing (pdf-lib)
- ✅ Coordinate System (relativas 0-1)
- ✅ Storage & Database
- ✅ Signed PDF Generation

### **Diferencias:**
- **Backend:** Ruby on Rails → Node.js + Express
- **BD:** PostgreSQL → MySQL
- **Frontend:** Vue.js → Vanilla JS (por ahora)

---

## 🚀 **Próximas Mejoras**

- [ ] Múltiples tipos de firma (dibujada, tipografiada, subida)
- [ ] Firma digital con certificados X.509
- [ ] Envío por email para firma remota
- [ ] Múltiples firmantes (flujo secuencial)
- [ ] Templates reutilizables
- [ ] API de webhooks
- [ ] Firma en masa (bulk signing)

---

## 📝 **Licencia**

MIT License - Uso libre para proyectos comerciales y personales.

---

**¿Necesitas ayuda?** Consulta el código fuente comentado o pregunta al equipo de desarrollo.
