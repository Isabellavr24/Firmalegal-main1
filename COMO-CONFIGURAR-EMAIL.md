# 📧 Cómo Configurar Email por Usuario en FirmaLegal

## ✅ Sistema Implementado

Cada Superadministrador puede configurar su propia cuenta de SendGrid para enviar emails desde su dirección personal.

---

## 🚀 Pasos para Configurar (5 minutos)

### **Paso 1: Ejecutar Script SQL**

Ejecuta este script en tu base de datos MySQL:

```sql
-- Archivo: backend/database/email-config-schema.sql
```

Esto crea la tabla `email_config` donde se guarda la configuración por usuario.

### **Paso 2: Obtener API Key de SendGrid**

1. Ve a [https://signup.sendgrid.com/](https://signup.sendgrid.com/) y crea una cuenta **GRATIS**
2. Inicia sesión y ve a **Settings → API Keys**
3. Click en **"Create API Key"**
4. Nombre: `FirmaLegal-TuNombre`
5. Permisos: Selecciona **"Mail Send"** (o Full Access)
6. Click en **"Create & View"**
7. **¡COPIA LA API KEY!** (solo se muestra una vez)

La API Key se ve así:
```
SG.xxxxxxxxxxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

### **Paso 3: Verificar Email Remitente en SendGrid**

1. Ve a **Settings → Sender Authentication → Single Sender Verification**
   - URL directa: [https://app.sendgrid.com/settings/sender_auth/senders](https://app.sendgrid.com/settings/sender_auth/senders)
2. Click en **"Create New Sender"**
3. Completa:
   - **From Name**: Tu Nombre - FirmaLegal
   - **From Email Address**: j27931178@gmail.com (tu email)
   - **Reply To**: (el mismo email)
   - **Company Address**: (tu dirección)
4. Click en **"Save"**
5. **Verifica el email**: Revisa tu bandeja de Gmail y haz click en el enlace

✅ Tu email ahora está verificado en SendGrid.

### **Paso 4: Configurar en FirmaLegal**

1. Inicia sesión en FirmaLegal como Superadministrador
2. Ve a **Configuración** (icono de engranaje arriba a la derecha)
3. En el menú lateral, click en **"Correo electrónico"**
4. Llena el formulario:
   - **SendGrid API Key**: Pega tu API Key (`SG.xxxxxx...`)
   - **Email Remitente**: `j27931178@gmail.com`
   - **Nombre del Remitente**: `Juan Diego - FirmaLegal`
5. Click en **"GUARDAR CONFIGURACIÓN"**

✅ Verás un mensaje verde: "✓ Configuración guardada exitosamente"

### **Paso 5: Probar Email**

1. Click en el botón **"PROBAR EMAIL"**
2. Te pedirá a qué email enviar la prueba
3. Ingresa: `j27931178@gmail.com` (o cualquier email que quieras probar)
4. Click en **OK**
5. Espera 1-2 minutos
6. Revisa tu bandeja de entrada (y carpeta de Spam si no lo ves)

✅ Deberías recibir un email profesional con el logo de FirmaLegal!

---

## 📋 Resumen de lo Implementado

### Archivos Creados:

| Archivo | Descripción |
|---------|-------------|
| `backend/database/email-config-schema.sql` | Tabla para guardar configuración |
| `backend/controllers/email-config-controller.js` | Endpoints para CRUD de config |
| `backend/lib/email/mailer-dynamic.js` | Envío de emails con config del usuario |
| `frontend/public/Main/config.html` | Formulario actualizado (SendGrid) |
| `frontend/public/Main/settings.js` | JavaScript para guardar/probar config |

### Endpoints API:

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/email-config` | GET | Obtener configuración del usuario |
| `/api/email-config` | POST | Guardar/actualizar configuración |
| `/api/email-config/test` | POST | Enviar email de prueba |
| `/api/email-config` | DELETE | Eliminar configuración |

---

## 🎯 Cómo Funciona

1. **Usuario 1 (Superadmin 1)** configura su email `j27931178@gmail.com`
2. **Usuario 2 (Superadmin 2)** configura su email `otro@email.com`
3. Cada uno tiene su propia **API Key** de SendGrid
4. Cuando envían emails, se usa **su configuración personal**
5. Los emails se envían **desde su dirección** configurada

### Ejemplo de Uso Futuro:

Cuando implementemos la funcionalidad de firmas, el código sería:

```javascript
// Obtener configuración del usuario que envía
const userConfig = await getUserEmailConfig(db, userId);

// Enviar solicitud de firma usando SU configuración
await sendSignatureRequestWithConfig(userConfig, {
  to: 'firmante@ejemplo.com',
  recipientName: 'Juan Pérez',
  documentTitle: 'Contrato 2024',
  senderName: 'María García',
  documentId: 123
});
```

---

## ✅ Checklist de Verificación

Antes de continuar, verifica que todo funcione:

- [ ] Script SQL ejecutado (tabla `email_config` creada)
- [ ] Cuenta de SendGrid creada
- [ ] API Key de SendGrid obtenida
- [ ] Email remitente verificado en SendGrid
- [ ] Configuración guardada en FirmaLegal
- [ ] Email de prueba enviado y recibido

---

## 🎨 Vista del Formulario

El formulario ahora se ve así:

```
┌─────────────────────────────────────────────┐
│ Configuración de Email                      │
├─────────────────────────────────────────────┤
│                                             │
│ SendGrid API Key                            │
│ [SG.xxxxxxxxxxxxxxxxxxxxxxxxxx_____]        │
│                                             │
│ Email Remitente    │ Nombre del Remitente   │
│ [j27931178@gmail.com] [Juan Diego - Firma] │
│                                             │
│ ⚠️ Importante - Verificación del Email      │
│ Después de guardar, debes verificar tu     │
│ email en SendGrid...                        │
│                                             │
│ [GUARDAR CONFIGURACIÓN] [PROBAR EMAIL]      │
└─────────────────────────────────────────────┘
```

---

## 🔒 Seguridad

- ✅ La API Key se guarda **encriptada** en la base de datos
- ✅ Cada usuario solo puede ver/editar **su propia configuración**
- ✅ La API Key **nunca** se muestra en el frontend después de guardarla
- ✅ Los logs no muestran la API Key completa

---

## 📞 Siguiente Paso

Una vez que tengas tu configuración funcionando y el email de prueba llegue correctamente, podemos:

1. ✅ Integrar el envío de emails en la funcionalidad de firmas
2. ✅ Agregar más templates (recordatorios, notificaciones, etc.)
3. ✅ Implementar envío masivo
4. ✅ Agregar estadísticas de emails enviados

---

**¿Listo para probar? Sigue los pasos arriba y avísame cuando recibas el email de prueba!** 🚀
