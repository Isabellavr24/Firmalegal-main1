# 📋 SPRINT 3 - PLAN DE IMPLEMENTACIÓN
## Sistema de Envío y Firma de Documentos

---

## 🎯 VISIÓN GENERAL

Después de estudiar TODO el sistema, propongo el siguiente flujo mejorado:

### **FLUJO COMPLETO PROPUESTO:**

```
1. SUBIR (index.html / folder.html)
   ↓
2. TRACKING (sin campos asignados)
   ↓
3. EDITAR → Sign.html (Modo Preparación)
   ↓
4. GUARDAR CAMPOS → Volver a Tracking
   ↓
5. ENVIAR → Modal con emails
   ↓
6. DESTINATARIO → Recibe email con link público
   ↓
7. FIRMA → Public Sign Page (/s/:token)
   ↓
8. COMPLETAR → Status actualizado en Tracking
```

---

## 🎨 ESTÉTICA Y DISEÑO IDENTIFICADOS

### **Paleta de Colores:**
- **--brand-plum**: `#2b0e31` (morado oscuro principal)
- **--brand-purple**: `#4a1e5c` (morado secundario)
- **--brand-light**: `#f9f6f4` (crema claro)
- **--bg-crema**: `#f9f5f2` (fondo general)
- **--ink**: `#1a1a1a` (texto principal)
- **--accent**: `#2a0d31` (acentos)

### **Tipografía:**
- Fuente: **Inter** (system-ui, Segoe UI)
- Títulos: Font-weight 800 (extra-bold)
- Cuerpo: Font-weight 600-700
- Tamaños: 22-28px títulos, 13-15px cuerpo

### **Componentes UI Existentes:**
- **Botones**: `border-radius: 999px` (pill shape), 12-14px padding vertical
- **Cards**: `border-radius: 16-22px`, sombras suaves
- **Modales**: `border-radius: 16px`, backdrop blur
- **Badges**: `border-radius: 8px`, uppercase, letter-spacing: 0.5px
- **Inputs**: `border-radius: 10-12px`, borde 2px

---

## 🔍 ANÁLISIS DEL SISTEMA ACTUAL

### **✅ QUÉ TENEMOS:**

#### **Frontend:**
1. **index.html + script.js**
   - Botón SUBIR funcional
   - Botón CREAR funcional (FormData upload)
   - Grid de documentos con cards
   - Sistema de carpetas jerárquico

2. **sign.html + sign.js**
   - Visor de PDF multipágina
   - Colocación de campos (firma, texto, fecha)
   - Modales para firma digital, texto con formato, fecha
   - Sistema de overlay por página
   - **PROBLEMA**: Botón "ENVIAR" y "GUARDAR" no conectados

3. **tracking.html + tracking.js**
   - Header de documento con info básica
   - Sección "Envíos" con recipients cards
   - Status badges (completed, pending, rejected, viewed)
   - Empty state con botón "Agregar Destinatarios"
   - **PROBLEMA**: No hay modal de recipients, status es demo data

#### **Backend:**
1. **documents-controller.js**
   - `POST /api/documents/upload` ✅ Funcional
   - `GET /api/documents` ✅ Listar docs
   - `GET /api/documents/:id` ✅ Get doc específico
   - `GET /api/documents/:id/file` ✅ Servir PDF
   - `PUT /api/documents/:id` ✅ Update doc
   - `DELETE /api/documents/:id` ✅ Soft delete

2. **signatures-controller.js**
   - Sistema de campos de firma (no integrado con tracking)
   - Storage de firmas

3. **email/mailer.js + sendgrid.js**
   - SendGrid configurado
   - Admin: firmalegalonline@pkiservices.co
   - Templates: signature-request.js, signature-completed.js

#### **Database:**
- **documents table** ✅ Existe
- **folders table** ✅ Con jerarquía
- **signatures_documents table** ✅ Para campos de firma
- **recipients table** ❌ NO EXISTE (necesaria)
- **document_status table** ❌ NO EXISTE (necesaria)

---

## 📝 REQUERIMIENTOS ESPECÍFICOS (según tus screenshots)

### **1. Modal "Agregar Destinatarios"**
- ✅ Ya existe estructura en sign.html (líneas 300-375)
- Tiene 4 tabs: por Email, por Teléfono, Detallado, Subir lista
- Checkbox "Enviar correo electrónico"
- Link "Editar mensaje"
- Botón morado "AGREGAR DESTINATARIOS"

**ACCIÓN**: Mover este modal a tracking.html

### **2. Email con Link de Firma**
- ✅ Template existe: `lib/email/templates/signature-request.js`
- **PERO** usuario dice: "el mensaje bastante feo"

**ACCIÓN**: Rediseñar email con estética firmalegalonline.com

### **3. Página Pública de Firma**
- URL: `/s/:token` (sin autenticación)
- Debe mostrar PDF con campos pre-colocados
- Botones: RECHAZAR (top), DESCARGAR (top), COMPLETAR (bottom)
- **PROBLEMA**: sign.html actual requiere auth

**ACCIÓN**: Crear nuevo `sign-public.html` o modo público en sign.html

### **4. Sistema de Estados**
- ENVIADO (light blue)
- ABIERTO (yellow/orange)
- COMPLETADO (green)
- RECHAZADO (red)

**ACCIÓN**: Backend + DB para tracking en tiempo real

---

## 🏗️ ARQUITECTURA PROPUESTA

### **FASE 1: PREPARACIÓN DE DOCUMENTO (sign.html)**

#### **A. Modificar Flujo de Upload**
Actualmente: index.html → SUBIR → Documento en grid
**NUEVO**: index.html → SUBIR → **Tracking.html (sin campos)**

```javascript
// En script.js (index.html) - Botón SUBIR
after upload success:
  window.location.href = `/tracking.html?id=${docId}&name=${docName}&mode=prepare`;
```

#### **B. Tracking.html - Estado Inicial**

**HTML a agregar:**
```html
<!-- Banner de "No Asignado" -->
<div id="unassignedBanner" class="unassigned-banner">
  <div class="banner-icon">⚠️</div>
  <div class="banner-content">
    <h3>Documento sin campos asignados</h3>
    <p>Este documento aún no tiene campos de firma o texto configurados.</p>
  </div>
  <div class="banner-actions">
    <button class="action-btn primary" id="editFieldsBtn">
      <svg><!-- pencil icon --></svg>
      EDITAR Y ASIGNAR CAMPOS
    </button>
  </div>
</div>
```

**CSS a agregar (tracking.css):**
```css
.unassigned-banner {
  background: linear-gradient(135deg, #fff5e6 0%, #ffe8cc 100%);
  border: 2px solid #ff9800;
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  gap: 24px;
}

.banner-icon {
  font-size: 48px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
}

.banner-content h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--brand-plum);
}

.banner-content p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 14px;
}
```

**JavaScript (tracking.js):**
```javascript
// Detectar si el documento tiene campos asignados
async function checkDocumentStatus(docId) {
  const response = await fetch(`/api/documents/${docId}/fields`, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  
  const data = await response.json();
  
  if (!data.fields || data.fields.length === 0) {
    showUnassignedBanner(docId);
  } else {
    hideUnassignedBanner();
    renderRecipientsSection();
  }
}

function showUnassignedBanner(docId) {
  document.getElementById('unassignedBanner').style.display = 'flex';
  document.getElementById('recipientsSection').style.display = 'none';
  
  document.getElementById('editFieldsBtn').onclick = () => {
    const docName = getDocumentDataFromURL().name;
    window.location.href = `/sign.html?id=${docId}&name=${docName}&mode=prepare`;
  };
}
```

---

### **FASE 2: EDITAR CAMPOS (sign.html)**

#### **A. Detectar Modo**
```javascript
// sign.js - Al cargar
const urlParams = new URLSearchParams(window.location.search);
const currentMode = urlParams.get('mode'); // 'prepare' o 'sign'
const currentDocId = urlParams.get('id');

if (currentMode === 'prepare') {
  initPrepareMode();
} else if (currentMode === 'sign') {
  initSignMode();
}
```

#### **B. Modo Preparación**
**Cambios en sign.html:**
```html
<!-- Barra superior modificada -->
<div class="bar">
  <div class="doc-title">
    <strong id="docTitleText">Documento</strong>
    <span class="mode-badge">Modo: Preparación</span>
  </div>
  <div class="actions">
    <button id="cancelBtn" class="chip">CANCELAR</button>
    <button id="saveFieldsBtn" class="chip primary">💾 GUARDAR CAMPOS</button>
  </div>
</div>
```

**JavaScript:**
```javascript
function initPrepareMode() {
  console.log('🎨 Modo Preparación activado');
  
  // Cargar PDF del backend
  loadDocumentFromBackend(currentDocId);
  
  // Habilitar toolbox (firmas, texto, fecha)
  enableFieldPlacement();
  
  // Botón GUARDAR CAMPOS
  document.getElementById('saveFieldsBtn').onclick = async () => {
    if (fields.length === 0) {
      alert('Debes agregar al menos un campo antes de guardar.');
      return;
    }
    
    await saveFieldsToBackend();
    
    // Regresar a tracking
    window.location.href = `/tracking.html?id=${currentDocId}&name=${currentDocTitle}`;
  };
  
  // Botón CANCELAR
  document.getElementById('cancelBtn').onclick = () => {
    if (confirm('¿Descartar cambios y regresar?')) {
      window.location.href = `/tracking.html?id=${currentDocId}&name=${currentDocTitle}`;
    }
  };
}

async function saveFieldsToBackend() {
  const response = await fetch('/api/documents/fields', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({
      document_id: currentDocId,
      fields: fields.map(f => ({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.w,
        height: f.h,
        required: true
      }))
    })
  });
  
  if (!response.ok) throw new Error('Error al guardar campos');
  
  const data = await response.json();
  console.log('✅ Campos guardados:', data);
}
```

---

### **FASE 3: ENVIAR A DESTINATARIOS (tracking.html)**

#### **A. Mostrar Botón ENVIAR (cuando hay campos)**
```javascript
// tracking.js
async function renderDocumentActions(docId) {
  const fieldsResponse = await fetch(`/api/documents/${docId}/fields`);
  const fieldsData = await fieldsResponse.json();
  
  const actionsContainer = document.querySelector('.document-actions');
  
  if (fieldsData.fields && fieldsData.fields.length > 0) {
    // Tiene campos → Mostrar botón ENVIAR
    actionsContainer.innerHTML += `
      <button class="action-btn primary" id="sendDocBtn">
        <svg><!-- mail icon --></svg>
        ✉️ ENVIAR A DESTINATARIOS
      </button>
    `;
    
    document.getElementById('sendDocBtn').onclick = () => {
      openRecipientsModal(docId);
    };
  } else {
    // Sin campos → Mostrar botón EDITAR
    actionsContainer.innerHTML += `
      <button class="action-btn secondary" id="editFieldsBtn2">
        <svg><!-- edit icon --></svg>
        EDITAR CAMPOS
      </button>
    `;
  }
}
```

#### **B. Modal de Destinatarios**

**Mover de sign.html a tracking.html:**
```html
<!-- Modal ya existe en sign.html, copiar a tracking.html -->
<div id="recipientsModal" class="modal-back" aria-hidden="true">
  <!-- ... contenido existente ... -->
</div>
```

**JavaScript (tracking.js):**
```javascript
function openRecipientsModal(docId) {
  const modal = document.getElementById('recipientsModal');
  modal.classList.add('show');
  
  // Event listener para AGREGAR DESTINATARIOS
  document.getElementById('recipientsAdd').onclick = async () => {
    const emailInput = document.getElementById('emailInput');
    const emails = emailInput.value
      .split(/[\n,;]/)
      .map(e => e.trim())
      .filter(e => e.length > 0);
    
    if (emails.length === 0) {
      alert('Debes ingresar al menos un email');
      return;
    }
    
    // Validar emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(e => !emailRegex.test(e));
    
    if (invalidEmails.length > 0) {
      alert(`Emails inválidos: ${invalidEmails.join(', ')}`);
      return;
    }
    
    // Enviar al backend
    await sendDocumentToRecipients(docId, emails);
    
    // Cerrar modal y actualizar UI
    modal.classList.remove('show');
    location.reload();
  };
}

async function sendDocumentToRecipients(docId, emails) {
  const response = await fetch(`/api/documents/${docId}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({
      recipients: emails.map(email => ({
        email: email,
        name: email.split('@')[0] // fallback name
      }))
    })
  });
  
  if (!response.ok) throw new Error('Error al enviar documento');
  
  const data = await response.json();
  console.log('✅ Documento enviado a:', emails);
  
  // Mostrar toast
  ToastManager.success(`Documento enviado a ${emails.length} destinatario(s)`);
}
```

---

### **FASE 4: BACKEND - ENVÍO Y TOKENS**

#### **A. Nueva Tabla: recipients**
```sql
CREATE TABLE IF NOT EXISTS document_recipients (
  recipient_id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  token VARCHAR(255) UNIQUE NOT NULL,
  status ENUM('sent', 'opened', 'completed', 'rejected') DEFAULT 'sent',
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  opened_at DATETIME,
  completed_at DATETIME,
  rejected_at DATETIME,
  ip_address VARCHAR(45),
  user_agent TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
  INDEX idx_token (token),
  INDEX idx_document (document_id),
  INDEX idx_status (status)
);
```

#### **B. Endpoint: POST /api/documents/:id/send**
```javascript
// documents-controller.js

const crypto = require('crypto');

router.post('/:id/send', requireAuth, async (req, res) => {
  console.log(`\n📧 [DOCUMENTS] POST /api/documents/${req.params.id}/send`);
  
  const documentId = parseInt(req.params.id);
  const { recipients } = req.body; // [{ email, name }]
  
  if (!recipients || recipients.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'Se requiere al menos un destinatario'
    });
  }
  
  const db = req.app.locals.db;
  const createdRecipients = [];
  
  try {
    // Obtener info del documento
    const docResults = await new Promise((resolve, reject) => {
      db.query(
        'SELECT document_id, title, file_name FROM documents WHERE document_id = ?',
        [documentId],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });
    
    if (docResults.length === 0) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    }
    
    const document = docResults[0];
    
    // Crear recipients y enviar emails
    for (const recipient of recipients) {
      // Generar token único
      const token = crypto.randomBytes(16).toString('hex');
      
      // Insertar en BD
      const insertResult = await new Promise((resolve, reject) => {
        db.query(
          `INSERT INTO document_recipients (document_id, email, name, token, status)
           VALUES (?, ?, ?, ?, 'sent')`,
          [documentId, recipient.email, recipient.name, token],
          (err, result) => err ? reject(err) : resolve(result)
        );
      });
      
      const recipientId = insertResult.insertId;
      
      // Enviar email con link público
      const signUrl = `${process.env.APP_URL || 'http://localhost:3000'}/s/${token}`;
      
      await sendSignatureRequestEmail({
        to: recipient.email,
        recipientName: recipient.name,
        documentTitle: document.title,
        senderName: req.userName || 'FirmaLegalOnline',
        signUrl: signUrl
      });
      
      createdRecipients.push({
        id: recipientId,
        email: recipient.email,
        name: recipient.name,
        token: token,
        status: 'sent',
        signUrl: signUrl
      });
    }
    
    res.json({
      ok: true,
      success: true,
      message: `Documento enviado a ${recipients.length} destinatario(s)`,
      data: {
        document_id: documentId,
        recipients: createdRecipients
      }
    });
    
  } catch (error) {
    console.error('❌ [DOCUMENTS] Error:', error);
    res.status(500).json({
      ok: false,
      error: 'Error al enviar documento',
      message: error.message
    });
  }
});
```

#### **C. Función de Email Mejorada**
```javascript
// lib/email/templates/signature-request.js

function generateSignatureRequestEmail({ recipientName, documentTitle, senderName, signUrl }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a Firmar Documento</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #f9f5f2;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: white;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(42, 13, 49, 0.12);
    }
    .header {
      background: linear-gradient(135deg, #2b0e31 0%, #4a1e5c 100%);
      padding: 40px 32px;
      text-align: center;
    }
    .header img {
      height: 48px;
      margin-bottom: 16px;
    }
    .header h1 {
      color: white;
      margin: 0;
      font-size: 24px;
      font-weight: 800;
    }
    .content {
      padding: 40px 32px;
    }
    .content h2 {
      color: #2b0e31;
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 16px 0;
    }
    .content p {
      color: #6d6270;
      font-size: 15px;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .document-card {
      background: #f9f6f4;
      border: 2px solid #eadfd8;
      border-radius: 12px;
      padding: 20px;
      margin: 24px 0;
    }
    .document-card .doc-icon {
      font-size: 32px;
      margin-bottom: 12px;
    }
    .document-card .doc-title {
      color: #2b0e31;
      font-size: 18px;
      font-weight: 700;
      margin: 0;
    }
    .button {
      display: inline-block;
      background: #2b0e31;
      color: white;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 999px;
      font-size: 16px;
      font-weight: 700;
      text-align: center;
      transition: all 0.2s;
    }
    .button:hover {
      background: #4a1e5c;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(42, 13, 49, 0.3);
    }
    .footer {
      background: #f9f6f4;
      padding: 32px;
      text-align: center;
      border-top: 2px solid #eadfd8;
    }
    .footer p {
      color: #6d6270;
      font-size: 13px;
      margin: 0 0 8px 0;
    }
    .footer .logo-text {
      color: #2b0e31;
      font-weight: 700;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <!-- Logo de FirmaLegalOnline -->
      <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
        <path d="M9 2l7 7-7 7V2z"/>
        <path d="M9 12l7 7-7 7v-14z"/>
      </svg>
      <h1>Invitación a Firmar Documento</h1>
    </div>
    
    <div class="content">
      <h2>Hola ${recipientName},</h2>
      <p>
        ${senderName} te ha invitado a revisar y firmar el siguiente documento:
      </p>
      
      <div class="document-card">
        <div class="doc-icon">📄</div>
        <p class="doc-title">${documentTitle}</p>
      </div>
      
      <p>
        Haz clic en el botón de abajo para revisar el documento y completar tu firma electrónica.
        Este proceso es completamente seguro y tus datos están protegidos.
      </p>
      
      <center>
        <a href="${signUrl}" class="button">
          ✍️ Revisar y Firmar Documento
        </a>
      </center>
      
      <p style="margin-top: 32px; font-size: 13px; color: #999;">
        Si no puedes hacer clic en el botón, copia y pega este enlace en tu navegador:<br>
        <a href="${signUrl}" style="color: #2b0e31;">${signUrl}</a>
      </p>
    </div>
    
    <div class="footer">
      <p class="logo-text">FirmaLegalOnline</p>
      <p>© ${new Date().getFullYear()} PKI Services. Todos los derechos reservados.</p>
      <p>
        <a href="https://firmalegalonline.com" style="color: #2b0e31; text-decoration: none;">
          www.firmalegalonline.com
        </a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

module.exports = { generateSignatureRequestEmail };
```

---

### **FASE 5: PÁGINA PÚBLICA DE FIRMA (/s/:token)**

#### **A. Backend - Endpoint de Token**
```javascript
// server.js

app.get('/s/:token', async (req, res) => {
  console.log(`\n🔗 [PUBLIC] GET /s/${req.params.token}`);
  
  const { token } = req.params;
  const db = req.app.locals.db;
  
  try {
    // Buscar recipient por token
    const results = await new Promise((resolve, reject) => {
      db.query(
        `SELECT r.*, d.document_id, d.title, d.file_path
         FROM document_recipients r
         JOIN documents d ON r.document_id = d.document_id
         WHERE r.token = ?`,
        [token],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });
    
    if (results.length === 0) {
      return res.status(404).send(`
        <html>
          <body style="font-family: Inter, sans-serif; text-align: center; padding: 100px;">
            <h1>❌ Enlace Inválido</h1>
            <p>Este enlace no es válido o ha expirado.</p>
          </body>
        </html>
      `);
    }
    
    const recipient = results[0];
    
    // Actualizar status a 'opened' si es la primera vez
    if (recipient.status === 'sent') {
      await new Promise((resolve, reject) => {
        db.query(
          `UPDATE document_recipients
           SET status = 'opened', opened_at = NOW(), ip_address = ?, user_agent = ?
           WHERE recipient_id = ?`,
          [req.ip, req.get('user-agent'), recipient.recipient_id],
          (err) => err ? reject(err) : resolve()
        );
      });
    }
    
    // Servir página de firma pública
    res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'Main', 'sign-public.html'));
    
  } catch (error) {
    console.error('❌ [PUBLIC] Error:', error);
    res.status(500).send('Error al cargar documento');
  }
});

// API para obtener datos del documento público
app.get('/api/public/document/:token', async (req, res) => {
  const { token } = req.params;
  const db = req.app.locals.db;
  
  try {
    // Obtener recipient y documento
    const recipientResults = await new Promise((resolve, reject) => {
      db.query(
        `SELECT r.*, d.document_id, d.title, d.file_path, d.file_name
         FROM document_recipients r
         JOIN documents d ON r.document_id = d.document_id
         WHERE r.token = ?`,
        [token],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });
    
    if (recipientResults.length === 0) {
      return res.status(404).json({ ok: false, error: 'Token inválido' });
    }
    
    const recipient = recipientResults[0];
    
    // Obtener campos del documento
    const fieldsResults = await new Promise((resolve, reject) => {
      db.query(
        `SELECT field_id, field_type, page_number, x_position, y_position, width, height, required
         FROM document_fields
         WHERE document_id = ?`,
        [recipient.document_id],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });
    
    res.json({
      ok: true,
      data: {
        recipient: {
          id: recipient.recipient_id,
          email: recipient.email,
          name: recipient.name,
          status: recipient.status
        },
        document: {
          id: recipient.document_id,
          title: recipient.title,
          file_path: recipient.file_path,
          file_name: recipient.file_name
        },
        fields: fieldsResults.map(f => ({
          id: f.field_id,
          type: f.field_type,
          page: f.page_number,
          x: f.x_position,
          y: f.y_position,
          w: f.width,
          h: f.height,
          required: f.required === 1
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ [PUBLIC] Error:', error);
    res.status(500).json({ ok: false, error: 'Error al obtener documento' });
  }
});
```

#### **B. Frontend - sign-public.html**
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Firmar Documento</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="/public/Main/M-styles/sign.css">
  <style>
    /* Barra pública (sin edición) */
    .bar.public-mode {
      background: #f9f6f4;
      border-bottom: 2px solid #eadfd8;
    }
    .public-mode .doc-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .public-mode .doc-icon {
      font-size: 24px;
    }
    .public-mode strong {
      font-size: 18px;
      color: var(--brand-plum);
    }
  </style>
</head>
<body>

  <div id="initialLoader">
    <div class="spinner"></div>
    <p class="loader-text">Cargando documento...</p>
  </div>

  <!-- Barra superior (modo público) -->
  <div class="bar public-mode">
    <div class="doc-title">
      <span class="doc-icon">📄</span>
      <strong id="docTitleText">Documento</strong>
    </div>
    <div class="actions">
      <button id="rejectBtn" class="chip btn-secondary">❌ RECHAZAR</button>
      <button id="downloadBtn" class="chip btn-secondary">⬇️ DESCARGAR</button>
      <button id="completeBtn" class="chip primary">✓ COMPLETAR</button>
    </div>
  </div>

  <div class="layout">
    <!-- IZQUIERDA (thumbnails) -->
    <aside class="panel left">
      <div class="thumb"></div>
      <div id="docInfo" class="doc-info">
        <div class="doc-name">Cargando...</div>
        <div class="doc-meta">Por favor espera</div>
      </div>
    </aside>

    <!-- CENTRO (PDF viewer) -->
    <main class="panel" id="pdfViewer">
      <div id="pagesContainer"></div>
    </main>

    <!-- DERECHA (instrucciones) -->
    <aside class="panel">
      <h4 style="margin:6px 0 10px">Instrucciones</h4>
      <p style="font-size: 14px; line-height: 1.6; color: #6d6270;">
        1. Revisa el documento completo<br>
        2. Completa los campos requeridos<br>
        3. Haz clic en <strong>COMPLETAR</strong> cuando termines
      </p>
      
      <div id="fieldsProgress" style="margin-top: 20px;">
        <p style="font-size: 13px; color: #999;">
          Campos completados: <strong id="fieldsCount">0/0</strong>
        </p>
        <div style="background: #eee; height: 8px; border-radius: 4px; overflow: hidden;">
          <div id="fieldsBar" style="background: #10b981; height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
      </div>
    </aside>
  </div>

  <!-- Modales (firma, texto, fecha) - igual que sign.html -->

  <!-- Scripts -->
  <script src="https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.mjs" type="module"></script>
  <script type="module">
    import * as pdfjsLib from 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
    window.pdfjsLib = pdfjsLib;
  </script>
  <script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
  <script src="/public/Main/sign-public.js"></script>
</body>
</html>
```

#### **C. Frontend - sign-public.js**
```javascript
// ===== Estado =====
let token = null;
let recipientData = null;
let documentData = null;
let fields = [];
let pdfBytes = null;
let pdfDoc = null;
let allPages = [];

// ===== Inicialización =====
window.addEventListener('DOMContentLoaded', function() {
  // Extraer token de la URL
  const pathParts = window.location.pathname.split('/');
  token = pathParts[pathParts.length - 1];
  
  console.log('🔐 Token:', token);
  
  // Cargar documento
  loadPublicDocument();
});

async function loadPublicDocument() {
  try {
    // Obtener datos del documento
    const response = await fetch(`/api/public/document/${token}`);
    
    if (!response.ok) {
      throw new Error('Token inválido o documento no encontrado');
    }
    
    const data = await response.json();
    recipientData = data.data.recipient;
    documentData = data.data.document;
    fields = data.data.fields;
    
    console.log('📄 Documento cargado:', documentData);
    console.log('📋 Campos:', fields);
    
    // Actualizar UI
    document.getElementById('docTitleText').textContent = documentData.title;
    document.querySelector('.doc-name').textContent = documentData.file_name;
    document.querySelector('.doc-meta').textContent = `${fields.length} campo(s) a completar`;
    
    // Cargar PDF
    await loadPdfFromServer(documentData.file_path);
    
    // Renderizar campos pre-colocados
    renderPrePlacedFields();
    
    // Ocultar loader
    document.getElementById('initialLoader').classList.add('hidden');
    
    // Inicializar botones
    initPublicButtons();
    
  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error al cargar el documento. El enlace puede ser inválido o haber expirado.');
  }
}

async function loadPdfFromServer(filePath) {
  const response = await fetch(filePath);
  pdfBytes = await response.arrayBuffer();
  
  pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  
  const pagesContainer = document.getElementById('pagesContainer');
  pagesContainer.innerHTML = '';
  
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'canvas-wrap';
    canvasWrap.appendChild(canvas);
    canvasWrap.appendChild(overlay);
    
    pagesContainer.appendChild(canvasWrap);
    
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    
    allPages.push({ pageNum, canvas, overlay, viewport });
  }
}

function renderPrePlacedFields() {
  fields.forEach((field, index) => {
    const pageData = allPages.find(p => p.page === field.page);
    if (!pageData) return;
    
    const fieldEl = document.createElement('div');
    fieldEl.className = `field ${field.type}`;
    fieldEl.id = `field-${field.id}`;
    fieldEl.style.left = field.x + 'px';
    fieldEl.style.top = field.y + 'px';
    fieldEl.style.width = field.w + 'px';
    fieldEl.style.height = field.h + 'px';
    
    // Label
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = field.type === 'signature' ? '✍️ Firma aquí' :
                        field.type === 'text' ? '🔤 Texto' :
                        '📅 Fecha';
    fieldEl.appendChild(label);
    
    // Click handler para completar
    fieldEl.onclick = () => {
      if (field.type === 'signature') {
        openSignatureModal(field);
      } else if (field.type === 'text') {
        openTextModal(field);
      } else if (field.type === 'date') {
        openDateModal(field);
      }
    };
    
    pageData.overlay.appendChild(fieldEl);
  });
}

function initPublicButtons() {
  // RECHAZAR
  document.getElementById('rejectBtn').onclick = async () => {
    if (!confirm('¿Estás seguro de rechazar este documento?')) return;
    
    try {
      await fetch(`/api/public/reject/${token}`, { method: 'POST' });
      alert('Documento rechazado. Gracias por tu respuesta.');
      window.close();
    } catch (error) {
      alert('Error al rechazar documento');
    }
  };
  
  // DESCARGAR
  document.getElementById('downloadBtn').onclick = () => {
    window.open(documentData.file_path, '_blank');
  };
  
  // COMPLETAR
  document.getElementById('completeBtn').onclick = async () => {
    // Verificar que todos los campos estén completados
    const incompletedFields = fields.filter(f => !f.completed);
    
    if (incompletedFields.length > 0) {
      alert(`Debes completar ${incompletedFields.length} campo(s) antes de finalizar.`);
      return;
    }
    
    try {
      // Enviar datos al backend
      await fetch(`/api/public/complete/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: fields.map(f => ({
            id: f.id,
            type: f.type,
            value: f.value,
            dataUrl: f.dataUrl
          }))
        })
      });
      
      // Mostrar mensaje de éxito
      showCompletionMessage();
      
    } catch (error) {
      alert('Error al completar documento');
    }
  };
}

function showCompletionMessage() {
  document.body.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: linear-gradient(135deg, #f9f6f4 0%, #fff 100%);
      text-align: center;
      padding: 40px;
    ">
      <div style="
        background: white;
        padding: 60px;
        border-radius: 24px;
        box-shadow: 0 20px 60px rgba(42, 13, 49, 0.15);
        max-width: 600px;
      ">
        <div style="font-size: 80px; margin-bottom: 24px;">✅</div>
        <h1 style="
          font-size: 32px;
          font-weight: 800;
          color: #2b0e31;
          margin: 0 0 16px 0;
        ">¡Documento Completado!</h1>
        <p style="
          font-size: 16px;
          color: #6d6270;
          line-height: 1.6;
          margin: 0 0 32px 0;
        ">
          Tu firma ha sido guardada exitosamente.<br>
          El remitente será notificado de inmediato.
        </p>
        <div style="display: flex; gap: 16px; justify-content: center;">
          <button onclick="window.open('${documentData.file_path}', '_blank')" style="
            padding: 16px 32px;
            background: white;
            border: 2px solid #2b0e31;
            color: #2b0e31;
            border-radius: 999px;
            font-weight: 700;
            font-size: 15px;
            cursor: pointer;
          ">📧 ENVIAR COPIA POR EMAIL</button>
          <button onclick="window.open('${documentData.file_path}', '_blank')" style="
            padding: 16px 32px;
            background: #2b0e31;
            border: 2px solid #2b0e31;
            color: white;
            border-radius: 999px;
            font-weight: 700;
            font-size: 15px;
            cursor: pointer;
          ">⬇️ DESCARGAR</button>
        </div>
      </div>
    </div>
  `;
}

// TODO: Implementar modales de firma, texto, fecha (copiar de sign.js)
```

---

### **FASE 6: TRACKING EN TIEMPO REAL**

#### **A. Backend - Endpoint de Status**
```javascript
// documents-controller.js

router.get('/:id/recipients', requireAuth, async (req, res) => {
  console.log(`\n📊 [DOCUMENTS] GET /api/documents/${req.params.id}/recipients`);
  
  const documentId = parseInt(req.params.id);
  const db = req.app.locals.db;
  
  try {
    const results = await new Promise((resolve, reject) => {
      db.query(
        `SELECT recipient_id, email, name, token, status,
                sent_at, opened_at, completed_at, rejected_at,
                ip_address
         FROM document_recipients
         WHERE document_id = ?
         ORDER BY sent_at DESC`,
        [documentId],
        (err, results) => err ? reject(err) : resolve(results)
      );
    });
    
    const recipients = results.map(r => ({
      id: r.recipient_id,
      email: r.email,
      name: r.name,
      status: r.status,
      sent_at: r.sent_at,
      opened_at: r.opened_at,
      completed_at: r.completed_at,
      rejected_at: r.rejected_at,
      sign_url: `/s/${r.token}`
    }));
    
    res.json({
      ok: true,
      data: {
        recipients: recipients,
        stats: {
          total: recipients.length,
          sent: recipients.filter(r => r.status === 'sent').length,
          opened: recipients.filter(r => r.status === 'opened').length,
          completed: recipients.filter(r => r.status === 'completed').length,
          rejected: recipients.filter(r => r.status === 'rejected').length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ [DOCUMENTS] Error:', error);
    res.status(500).json({
      ok: false,
      error: 'Error al obtener destinatarios',
      message: error.message
    });
  }
});
```

#### **B. Frontend - tracking.js Actualización**
```javascript
// Polling cada 5 segundos para actualizar status
let pollingInterval = null;

function startStatusPolling(docId) {
  // Actualizar inmediatamente
  updateRecipientStatus(docId);
  
  // Polling cada 5 segundos
  pollingInterval = setInterval(() => {
    updateRecipientStatus(docId);
  }, 5000);
}

async function updateRecipientStatus(docId) {
  try {
    const response = await fetch(`/api/documents/${docId}/recipients`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    const data = await response.json();
    
    if (data.ok) {
      renderRecipients(data.data.recipients);
      updateStatsDisplay(data.data.stats);
    }
  } catch (error) {
    console.error('Error al actualizar status:', error);
  }
}

function renderRecipients(recipients) {
  const container = document.getElementById('recipientsContainer');
  
  if (recipients.length === 0) {
    container.innerHTML = '<div class="empty-state">...</div>';
    return;
  }
  
  container.innerHTML = recipients.map(recipient => {
    const statusClass = getStatusClass(recipient.status);
    const statusText = getStatusText(recipient.status);
    const statusIcon = getStatusIcon(recipient.status);
    
    return `
      <div class="recipient-card">
        <div class="recipient-info">
          <div class="status-badge ${statusClass}">
            ${statusIcon} ${statusText}
          </div>
          <div class="recipient-emails">
            <p class="recipient-email">${recipient.email}</p>
            ${recipient.name ? `<p class="recipient-name">${recipient.name}</p>` : ''}
          </div>
        </div>
        
        <div class="recipient-meta">
          <p class="timestamp">
            ${formatTimestamp(recipient)}
          </p>
        </div>
        
        <div class="recipient-actions">
          ${recipient.status === 'completed' ? `
            <button class="recipient-btn download" onclick="downloadSignedDoc(${recipient.id})">
              <svg>...</svg>
              DESCARGAR
            </button>
          ` : `
            <button class="recipient-btn view" onclick="copySignLink('${recipient.sign_url}')">
              <svg>...</svg>
              COPIAR ENLACE
            </button>
          `}
          <button class="recipient-btn delete" onclick="deleteRecipient(${recipient.id})">
            <svg>...</svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function getStatusIcon(status) {
  const icons = {
    sent: '📤',
    opened: '👁️',
    completed: '✅',
    rejected: '❌'
  };
  return icons[status] || '❓';
}

function formatTimestamp(recipient) {
  if (recipient.completed_at) {
    return `Completado: ${new Date(recipient.completed_at).toLocaleString()}`;
  } else if (recipient.rejected_at) {
    return `Rechazado: ${new Date(recipient.rejected_at).toLocaleString()}`;
  } else if (recipient.opened_at) {
    return `Abierto: ${new Date(recipient.opened_at).toLocaleString()}`;
  } else {
    return `Enviado: ${new Date(recipient.sent_at).toLocaleString()}`;
  }
}

// Detener polling al salir de la página
window.addEventListener('beforeunload', () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
});
```

---

## 📊 RESUMEN DE CAMBIOS

### **Archivos Nuevos:**
1. ✅ `sign-public.html` - Página pública de firma
2. ✅ `sign-public.js` - Lógica de firma pública
3. ✅ `SPRINT-3-PLAN.md` - Este documento

### **Archivos Modificados:**

#### **Frontend:**
1. ✅ `script.js` (index.html)
   - Cambiar redirección después de upload a tracking.html

2. ✅ `tracking.html`
   - Agregar banner "No Asignado"
   - Mover modal de destinatarios desde sign.html
   - Agregar botón "ENVIAR A DESTINATARIOS"

3. ✅ `tracking.css`
   - Estilos para banner unassigned
   - Animaciones de transición

4. ✅ `tracking.js`
   - Función `checkDocumentStatus()`
   - Modal de destinatarios
   - Polling de status
   - Renderizado dinámico de recipients

5. ✅ `sign.html`
   - Detectar modo (prepare vs sign)
   - Cambiar botones según modo
   - Remover modal de destinatarios (mover a tracking)

6. ✅ `sign.js`
   - Función `initPrepareMode()`
   - Función `saveFieldsToBackend()`
   - Desactivar toolbox en modo sign

#### **Backend:**
1. ✅ `documents-controller.js`
   - `POST /api/documents/:id/send` - Enviar a destinatarios
   - `GET /api/documents/:id/recipients` - Lista de recipients
   - `POST /api/documents/:id/fields` - Guardar campos (nuevo o mover de signatures)
   - `GET /api/documents/:id/fields` - Obtener campos

2. ✅ `server.js`
   - `GET /s/:token` - Ruta pública
   - `GET /api/public/document/:token` - Data pública
   - `POST /api/public/complete/:token` - Completar firma
   - `POST /api/public/reject/:token` - Rechazar documento

3. ✅ `lib/email/templates/signature-request.js`
   - Rediseñar email con estética firmalegalonline

#### **Database:**
1. ✅ Nueva tabla: `document_recipients`
2. ✅ Nueva tabla: `document_fields` (si no existe)

---

## 🎯 PRÓXIMOS PASOS

### **Orden de Implementación Sugerido:**

**SEMANA 1: Base de Datos y Backend**
- [ ] Día 1-2: Crear tablas SQL (`document_recipients`, `document_fields`)
- [ ] Día 3-4: Endpoints de campos (`POST /api/documents/:id/fields`, `GET /api/documents/:id/fields`)
- [ ] Día 5: Endpoint de envío (`POST /api/documents/:id/send`)

**SEMANA 2: Modo Preparación**
- [ ] Día 1-2: Modificar sign.html/sign.js para detectar modo
- [ ] Día 3: Función `saveFieldsToBackend()`
- [ ] Día 4: Tracking - Banner "No Asignado"
- [ ] Día 5: Testing completo del flujo preparación

**SEMANA 3: Envío y Email**
- [ ] Día 1-2: Modal de destinatarios en tracking.html
- [ ] Día 3: Función `sendDocumentToRecipients()`
- [ ] Día 4-5: Rediseñar email template

**SEMANA 4: Página Pública**
- [ ] Día 1-2: Crear sign-public.html + sign-public.js
- [ ] Día 3: Endpoints públicos (`/s/:token`, `/api/public/*`)
- [ ] Día 4: Integración de modales (firma, texto, fecha)
- [ ] Día 5: Completar y rechazar documento

**SEMANA 5: Tracking en Tiempo Real**
- [ ] Día 1-2: Endpoint `GET /api/documents/:id/recipients`
- [ ] Día 3: Polling en tracking.js
- [ ] Día 4: Renderizado dinámico de status
- [ ] Día 5: Testing end-to-end completo

**SEMANA 6: Pulido y Testing**
- [ ] Día 1-2: Mejorar UX (transiciones, loading states)
- [ ] Día 3: Validaciones y errores
- [ ] Día 4: Testing en diferentes navegadores
- [ ] Día 5: Documentación final

---

## ⚠️ CONSIDERACIONES IMPORTANTES

### **Seguridad:**
- [ ] Tokens deben expirar después de X días
- [ ] Rate limiting en endpoints públicos
- [ ] Validar que recipient solo puede ver/editar sus campos
- [ ] Sanitizar inputs de texto
- [ ] HTTPS obligatorio en producción

### **Performance:**
- [ ] Cachear PDFs en el lado del servidor
- [ ] Optimizar consultas SQL con índices
- [ ] Lazy loading de páginas de PDF
- [ ] Comprimir imágenes de firma

### **UX:**
- [ ] Mensajes de error claros
- [ ] Loading states en todas las acciones
- [ ] Confirmaciones antes de acciones destructivas
- [ ] Tooltips explicativos
- [ ] Responsive design (móvil)

### **Testing:**
- [ ] Unit tests para funciones críticas
- [ ] Tests E2E del flujo completo
- [ ] Tests de carga (múltiples recipients)
- [ ] Tests de compatibilidad de navegadores

---

## 💡 MEJORAS FUTURAS (Post-Sprint 3)

- [ ] Notificaciones push en tiempo real (WebSockets)
- [ ] Firma múltiple (varios firmantes en orden)
- [ ] Firma biométrica (móvil)
- [ ] Integración con Google Drive/Dropbox
- [ ] Templates de documentos
- [ ] Firma en lote (múltiples documentos)
- [ ] Recordatorios automáticos por email
- [ ] Exportar historial de firmas (PDF)
- [ ] API REST para integraciones externas
- [ ] Dashboard de analytics

---

## 📞 DUDAS Y DECISIONES PENDIENTES

1. **¿Los campos deben poder asignarse a destinatarios específicos?**
   - Ejemplo: Campo 1 para Juan, Campo 2 para María
   - O todos los campos para todos los destinatarios

2. **¿Permitir múltiples rondas de firma?**
   - Ejemplo: Primero firma Juan, luego María
   - O todos pueden firmar simultáneamente

3. **¿Expiración de tokens?**
   - Sugerir: 30 días por defecto
   - ¿Configurable por documento?

4. **¿Notificaciones?**
   - Email al completar cada firma
   - Email solo cuando todos completen
   - Notificaciones en la app

5. **¿PDF final?**
   - ¿Generar PDF con campos "aplanados" (no editables)?
   - ¿Certificado de firma digital?

---

**Creado por:** GitHub Copilot  
**Fecha:** 31 de Octubre, 2025  
**Versión:** 1.0  
**Estado:** 📋 En Discusión
