# Vista de Seguimiento / Trazabilidad de Documentos

## Descripción

La vista de seguimiento (`tracking.html`) permite monitorear el estado de los documentos enviados a firma electrónica, mostrando información detallada sobre los destinatarios y el progreso del proceso de firma.

## Archivos Creados

### 1. `tracking.html`
Página principal con la estructura de la vista de seguimiento.

**Ubicación:** `frontend/public/Main/tracking.html`

**Características:**
- Header con navegación y perfil de usuario
- Información del documento (título y carpeta)
- Botones de acción del documento (enlace, archivar, clonar, editar)
- Sección de "Envíos" con lista de destinatarios
- Estado de cada envío (completado, pendiente, rechazado, visto)
- Acciones por destinatario (descargar, vista, eliminar)
- Estado vacío cuando no hay envíos

### 2. `M-styles/tracking.css`
Estilos específicos para la vista de seguimiento.

**Ubicación:** `frontend/public/Main/M-styles/tracking.css`

**Características:**
- Diseño responsivo
- Estilo minimalista y profesional
- Colores consistentes con el brand (morado oscuro, verde de estado)
- Animaciones suaves
- Badges de estado con colores específicos:
  - Verde: Completado
  - Amarillo: Pendiente
  - Rojo: Rechazado
  - Azul: Visto

### 3. `tracking.js`
Funcionalidad JavaScript para la vista de seguimiento.

**Ubicación:** `frontend/public/Main/tracking.js`

**Características:**
- Sistema de toasts para notificaciones
- Renderizado dinámico de destinatarios
- Gestión de estados de envío
- Event delegation para acciones
- Datos demo para pruebas
- Integración con URL parameters

## Uso

### Acceder a la Vista

```html
<!-- Desde el index o cualquier vista -->
<a href="./tracking.html?id=DOC_ID&name=NOMBRE_DOCUMENTO&folder=CARPETA">
  Ver seguimiento
</a>
```

**Parámetros URL:**
- `id`: ID del documento (obligatorio)
- `name`: Nombre del documento (opcional)
- `folder`: Nombre de la carpeta (opcional)

**Ejemplo:**
```
tracking.html?id=doc-123&name=contrato%20de%20arrendamiento&folder=Pki%20Services
```

### Estados de Envío

Los destinatarios pueden tener los siguientes estados:

```javascript
const estados = {
  completed: 'COMPLETADO',   // Verde - Firmado exitosamente
  pending: 'PENDIENTE',       // Amarillo - Esperando firma
  rejected: 'RECHAZADO',      // Rojo - Documento rechazado
  viewed: 'VISTO'             // Azul - Visto pero no firmado
};
```

### Estructura de Datos

```javascript
const recipient = {
  id: 'rec-1',
  emails: [
    'email1@example.com',
    'email2@example.com'
  ],
  status: 'completed',
  sentAt: new Date('2024-01-16'),
  completedAt: new Date('2024-01-20')
};
```

## Acciones Disponibles

### Acciones del Documento

1. **ENLACE** - Copiar enlace del documento al portapapeles
2. **ARCHIVAR** - Mover documento a archivados
3. **CLONAR** - Crear una copia del documento
4. **EDITAR** - Abrir en vista de edición/firma
5. **EXPORTAR** - Descargar lista de destinatarios
6. **AGREGAR** - Añadir nuevos destinatarios

### Acciones por Destinatario

1. **DESCARGAR** - Descargar documento firmado
2. **VISTA** - Ver detalles del envío
3. **ELIMINAR** - Remover destinatario de la lista

## Integración con el Sistema

### Desde script.js o index.html

```javascript
// Abrir tracking desde una tarjeta de documento
function openTracking(docId, docName, folderName) {
  const url = `./tracking.html?id=${docId}&name=${encodeURIComponent(docName)}&folder=${encodeURIComponent(folderName)}`;
  window.location.href = url;
}
```

### Desde folder.js

```javascript
// Agregar botón de tracking en las acciones de documento
<button onclick="openTracking('${doc.id}', '${doc.title}', '${currentFolderName}')">
  Ver seguimiento
</button>
```

## Personalización

### Cambiar Colores de Estado

Editar en `tracking.css`:

```css
.status-badge.completed {
  background: #d1fae5;  /* Color de fondo */
  color: #065f46;       /* Color de texto */
}
```

### Agregar Nuevos Estados

1. Agregar estilo en `tracking.css`:
```css
.status-badge.in-review {
  background: #e0e7ff;
  color: #3730a3;
}
```

2. Actualizar funciones en `tracking.js`:
```javascript
function getStatusClass(status) {
  // Agregar nuevo estado
  if (status === 'in-review') return 'in-review';
  // ... resto del código
}
```

## API Backend (Para Implementar)

### GET /api/documents/:id/tracking
Obtener información de tracking de un documento.

**Response:**
```json
{
  "ok": true,
  "data": {
    "document": {
      "id": "doc-123",
      "name": "contrato de arrendamiento",
      "folder": "Pki Services"
    },
    "recipients": [
      {
        "id": "rec-1",
        "emails": ["user@example.com"],
        "status": "completed",
        "sentAt": "2024-01-16T10:00:00Z",
        "completedAt": "2024-01-20T15:30:00Z"
      }
    ]
  }
}
```

### POST /api/documents/:id/recipients
Agregar destinatarios a un documento.

**Request:**
```json
{
  "emails": ["new@example.com", "another@example.com"]
}
```

### DELETE /api/documents/:id/recipients/:recipientId
Eliminar un destinatario.

## Notas de Desarrollo

- Los estilos de toast ya están en `Styles.css`
- El sistema de avatares usa el mismo código del index
- La vista es completamente responsiva
- Se incluyen datos demo para pruebas
- Todos los console.log tienen prefijos para facilitar debugging

## Próximas Mejoras

- [ ] Modal para agregar destinatarios
- [ ] Histórico de acciones por destinatario
- [ ] Exportación a CSV/Excel
- [ ] Filtros por estado
- [ ] Búsqueda de destinatarios
- [ ] Gráficas de progreso
- [ ] Notificaciones en tiempo real
- [ ] Vista previa del documento
- [ ] Recordatorios automáticos

## Soporte

Para preguntas o mejoras, revisar el código en:
- HTML: `frontend/public/Main/tracking.html`
- CSS: `frontend/public/Main/M-styles/tracking.css`
- JS: `frontend/public/Main/tracking.js`
