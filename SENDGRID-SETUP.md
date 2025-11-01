# 📧 Configuración de SendGrid - FirmaLegal Online

## ✅ Estado de la Implementación

La integración con SendGrid está **completamente implementada** y lista para usar. Solo necesitas configurar tu API Key.

---

## 🚀 Paso 1: Obtener API Key de SendGrid

### 1.1 Crear Cuenta en SendGrid (Gratis)

1. Ve a [https://signup.sendgrid.com/](https://signup.sendgrid.com/)
2. Crea una cuenta gratuita (100 emails/día gratis para siempre)
3. Verifica tu email

### 1.2 Crear API Key

1. Inicia sesión en SendGrid
2. Ve a **Settings** → **API Keys**
   - URL directa: [https://app.sendgrid.com/settings/api_keys](https://app.sendgrid.com/settings/api_keys)
3. Click en **"Create API Key"**
4. Nombre: `FirmaLegal-Localhost` (o el que prefieras)
5. Permisos: Selecciona **"Full Access"** o al menos **"Mail Send"**
6. Click en **"Create & View"**
7. **¡IMPORTANTE!** Copia la API Key inmediatamente (solo se muestra una vez)

La API Key se ve así:
```
SG.xxxxxxxxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

---

## 🔧 Paso 2: Configurar el Archivo .env

### 2.1 Ubicación del archivo

El archivo `.env` está en: `backend/.env`

### 2.2 Editar la configuración

Abre `backend/.env` y **reemplaza** esta línea:

```env
SENDGRID_API_KEY=SG.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

Por tu API Key real:

```env
SENDGRID_API_KEY=SG.tu-api-key-real-aqui
```

### 2.3 Verificar la configuración del remitente

Asegúrate de que el email remitente esté correcto:

```env
EMAIL_FROM=firmalegalonline@pkiservices.co
EMAIL_FROM_NAME=FirmaLegal Online
```

⚠️ **IMPORTANTE**: El email `firmalegalonline@pkiservices.co` debe ser:
- Un email válido que controles
- Verificado en SendGrid (ver Paso 3)

---

## ✉️ Paso 3: Verificar Email Remitente en SendGrid

Para que SendGrid envíe emails desde tu dominio, debes verificar el remitente:

### 3.1 Single Sender Verification (Rápido - Para Testing)

1. Ve a **Settings** → **Sender Authentication** → **Single Sender Verification**
   - URL: [https://app.sendgrid.com/settings/sender_auth/senders](https://app.sendgrid.com/settings/sender_auth/senders)
2. Click en **"Create New Sender"**
3. Completa el formulario:
   - **From Name**: FirmaLegal Online
   - **From Email Address**: firmalegalonline@pkiservices.co
   - **Reply To**: (el mismo email)
   - **Company Address**: (tu dirección)
4. Click en **"Save"**
5. **Verifica el email**: Revisa la bandeja de entrada de `firmalegalonline@pkiservices.co`
6. Click en el enlace de verificación

✅ Una vez verificado, puedes enviar emails desde ese remitente.

### 3.2 Domain Authentication (Recomendado - Para Producción)

Esto requiere acceso al DNS de tu dominio `pkiservices.co`. Lo configuraremos después cuando tengas el dominio en producción.

---

## 🧪 Paso 4: Probar el Envío de Emails

### 4.1 Iniciar el servidor

```bash
cd backend
node server.js
```

Deberías ver:
```
✅ SendGrid configurado correctamente
✅ [MAILER] SendGrid inicializado
✅ Rutas de email registradas exitosamente
🟢 Conectado a MariaDB
🚀 Servidor escuchando en http://localhost:3000
```

### 4.2 Verificar Estado de Configuración

**Método 1: Navegador**
- Abre: http://localhost:3000/api/email/status

Deberías ver:
```json
{
  "success": true,
  "data": {
    "configured": true,
    "apiKey": "SG.xxxxxxxx...",
    "from": "firmalegalonline@pkiservices.co",
    "fromName": "FirmaLegal Online",
    "appUrl": "http://localhost:3000"
  }
}
```

**Método 2: Postman/Thunder Client**
```
GET http://localhost:3000/api/email/status
```

### 4.3 Enviar Email de Prueba

**Usando Postman/Thunder Client:**

```
POST http://localhost:3000/api/email/test
Content-Type: application/json

{
  "to": "tu-email@gmail.com"
}
```

**Usando curl:**

```bash
curl -X POST http://localhost:3000/api/email/test \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"tu-email@gmail.com\"}"
```

**Usando PowerShell:**

```powershell
$body = @{ to = "tu-email@gmail.com" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/email/test" -Method Post -Body $body -ContentType "application/json"
```

✅ **Resultado esperado:**
- Respuesta: `{ "success": true, "message": "Email de prueba enviado..." }`
- Revisa tu bandeja de entrada (puede tardar 1-2 minutos)
- Si no lo ves, revisa **Spam/Correo no deseado**

---

## 📋 Endpoints Disponibles

### 1. Verificar Estado
```
GET /api/email/status
```

### 2. Enviar Email de Prueba
```
POST /api/email/test
Body: { "to": "email@ejemplo.com" }
```

### 3. Enviar Solicitud de Firma
```
POST /api/email/signature-request
Body: {
  "to": "firmante@ejemplo.com",
  "recipientName": "Juan Pérez",
  "documentTitle": "Contrato de Servicios 2024",
  "senderName": "María García",
  "documentId": 123
}
```

### 4. Notificar Firma Completada
```
POST /api/email/signature-completed
Body: {
  "to": "propietario@ejemplo.com",
  "recipientName": "María García",
  "documentTitle": "Contrato de Servicios 2024",
  "signerName": "Juan Pérez",
  "documentId": 123
}
```

---

## 🎨 Templates de Email Incluidos

### 1. **Email de Prueba**
- ✅ Verifica configuración
- 🎨 Diseño profesional con gradientes
- 📊 Muestra configuración actual

### 2. **Solicitud de Firma** (`signature-request.js`)
- 📝 Notifica al firmante que tiene un documento pendiente
- 🔗 Incluye botón CTA para firmar
- 📋 Instrucciones paso a paso
- 🎨 Header con gradiente rosa/morado
- 📱 Responsive design

### 3. **Firma Completada** (`signature-completed.js`)
- ✅ Notifica que el documento fue firmado
- 📥 Botón para descargar documento
- 📊 Información de la firma
- 🎨 Header con gradiente verde
- 🔒 Detalles de seguridad

---

## 🔒 Seguridad

### ⚠️ IMPORTANTE - No Subir API Key a Git

El archivo `.env` está en `.gitignore` por seguridad. **NUNCA** subas tu API Key a GitHub/GitLab.

Si accidentalmente expones tu API Key:
1. Ve a SendGrid → Settings → API Keys
2. **Elimina** la API Key comprometida
3. Crea una nueva API Key
4. Actualiza tu archivo `.env`

---

## 🐛 Solución de Problemas

### Problema 1: "SendGrid API Key no configurada"

**Causa**: La API Key no está en el `.env` o está incorrecta.

**Solución**:
1. Verifica que `backend/.env` existe
2. Verifica que `SENDGRID_API_KEY` tiene tu API Key real
3. Reinicia el servidor

### Problema 2: "Error 401 Unauthorized"

**Causa**: API Key inválida o revocada.

**Solución**:
1. Crea una nueva API Key en SendGrid
2. Actualiza `backend/.env`
3. Reinicia el servidor

### Problema 3: "Error 403 Forbidden"

**Causa**: Remitente no verificado.

**Solución**:
1. Ve a SendGrid → Settings → Sender Authentication
2. Verifica el email remitente
3. Revisa la bandeja de entrada y haz click en el link

### Problema 4: "Email no llega"

**Posibles causas y soluciones**:

✅ **Revisa Spam/Correo no deseado**

✅ **Verifica el remitente en SendGrid**:
- El email `firmalegalonline@pkiservices.co` debe estar verificado

✅ **Revisa Activity en SendGrid**:
- Ve a: https://app.sendgrid.com/email_activity
- Busca el email por destinatario
- Verás si fue entregado, rebotado o bloqueado

✅ **Límite de cuenta gratuita**:
- Plan gratuito: 100 emails/día
- Verifica que no hayas alcanzado el límite

### Problema 5: El servidor no inicia

**Causa**: Falta instalar dependencias.

**Solución**:
```bash
cd Firmalegal-main1-main
npm install
```

---

## 📈 Próximos Pasos (Producción)

Cuando estés listo para producción:

### 1. ✅ Actualizar Variables de Entorno
```env
APP_URL=https://firmalegal.pkiservices.co
NODE_ENV=production
```

### 2. ✅ Configurar Domain Authentication
- Agrega registros DNS (SPF, DKIM, DMARC)
- Mejora la entregabilidad al 99%

### 3. ✅ Actualizar Plan de SendGrid (opcional)
- Si necesitas más de 100 emails/día
- Planes desde $15/mes (40,000 emails/mes)

### 4. ✅ Habilitar UI de Configuración
- Permitir cambiar configuración desde `config.html`
- Guardar en base de datos

### 5. ✅ Agregar Plantillas Personalizadas
- Logo de la empresa
- Colores corporativos
- Footer personalizado

---

## 📚 Recursos Útiles

- **Documentación SendGrid**: https://docs.sendgrid.com/
- **Dashboard SendGrid**: https://app.sendgrid.com/
- **Email Activity**: https://app.sendgrid.com/email_activity
- **API Keys**: https://app.sendgrid.com/settings/api_keys
- **Sender Authentication**: https://app.sendgrid.com/settings/sender_auth

---

## ✅ Checklist Final

Antes de pasar a producción, verifica:

- [ ] API Key de SendGrid configurada en `.env`
- [ ] Email remitente verificado en SendGrid
- [ ] Email de prueba enviado exitosamente
- [ ] Ambos templates (solicitud y completado) funcionan
- [ ] `.env` está en `.gitignore`
- [ ] Domain Authentication configurado (producción)
- [ ] Variables `APP_URL` actualizadas para producción

---

## 🎉 ¡Listo!

Tu sistema de emails con SendGrid está completamente configurado y listo para usar en localhost.

**Cualquier duda o problema, consulta este documento.**

---

**Creado para FirmaLegal Online**
*Sistema profesional de firma electrónica*
