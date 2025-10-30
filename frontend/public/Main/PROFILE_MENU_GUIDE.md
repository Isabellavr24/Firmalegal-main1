# Guía del Menú de Perfil Mejorado

## Vista Previa

El nuevo menú de perfil incluye:
- Avatar con iniciales o foto del usuario
- Nombre completo del usuario
- Correo electrónico
- Badge del rol (Administrador, Usuario, etc.)
- Opciones de menú con iconos
- Animaciones suaves
- Diseño moderno y profesional

## Archivos Creados

### 1. `M-styles/profile-menu.css`
Estilos completos para el menú de perfil mejorado.

**Características:**
- Diseño tipo dropdown moderno
- Animaciones suaves de entrada/salida
- Header con información del usuario
- Items de menú con iconos
- Soporte para modo oscuro
- Completamente responsive
- Gradientes en avatar y rol

## Cómo Aplicar a Otras Páginas

### Paso 1: Agregar el CSS

En tu archivo HTML, agrega el link al CSS:

```html
<link rel="stylesheet" href="/public/Main/M-styles/profile-menu.css?v=1">
```

### Paso 2: Reemplazar el HTML del Menú

Reemplaza tu menú actual con este código:

```html
<details class="user-menu" id="userMenu">
  <summary class="user-btn" aria-label="Menú de usuario">
    <div class="avatar" id="userAvatar">
      <img src="" alt="Avatar" id="avatarImg" style="display:none" />
      <span id="userInitials" class="initials" style="display:none;">PS</span>
    </div>
  </summary>
  <div class="user-dropdown">
    <!-- Profile Header -->
    <div class="profile-header">
      <div class="profile-avatar" id="profileAvatar">
        <img src="" alt="Avatar" id="profileAvatarImg" style="display:none" />
        <span id="profileInitials" style="display:inline-block;">PS</span>
      </div>
      <div class="profile-info">
        <h3 class="profile-name" id="profileName">Usuario</h3>
        <p class="profile-email" id="profileEmail">usuario@ejemplo.com</p>
        <span class="profile-role" id="profileRole">Administrador</span>
      </div>
    </div>

    <!-- Menu Items -->
    <div class="menu-section">
      <a href="./config.html" class="menu-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6m0-18a9 9 0 0 1 0 18 9 9 0 0 1 0-18z"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        Configuración
      </a>
      <a href="./index.html" class="menu-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.8a2 2 0 0 1-1.7-.9l-.8-1.1A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
        </svg>
        Mis Documentos
      </a>
    </div>

    <div class="menu-separator"></div>

    <div class="menu-section">
      <button id="logoutBtn" class="menu-item danger">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Cerrar Sesión
      </button>
    </div>
  </div>
</details>
```

### Paso 3: Agregar el JavaScript

Agrega estas funciones a tu archivo JS:

```javascript
// ====== CARGAR DATOS DEL USUARIO ======
function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (!userStr) {
      console.warn('⚠️ No hay usuario en localStorage');
      return null;
    }
    const user = JSON.parse(userStr);
    console.log('👤 Usuario actual:', user.first_name, user.last_name);
    return user;
  } catch (error) {
    console.error('❌ Error al obtener usuario:', error);
    return null;
  }
}

function updateUserProfile() {
  const user = getCurrentUser();

  if (!user) {
    // Datos demo si no hay usuario
    updateProfileUI({
      first_name: 'Usuario',
      last_name: 'Demo',
      email: 'usuario@ejemplo.com',
      role: 'Administrador'
    });
    return;
  }

  updateProfileUI(user);
}

function updateProfileUI(user) {
  const firstName = user.first_name || 'Usuario';
  const lastName = user.last_name || '';
  const email = user.email || 'usuario@ejemplo.com';
  const role = user.role || 'Usuario';
  const fullName = `${firstName} ${lastName}`.trim();

  // Generar iniciales
  const initials = (firstName.charAt(0) + (lastName.charAt(0) || '')).toUpperCase();

  // Actualizar avatar pequeño (header)
  const userInitials = document.getElementById('userInitials');
  if (userInitials) {
    userInitials.textContent = initials;
    userInitials.style.display = 'inline-block';
  }

  const avatarImg = document.getElementById('avatarImg');
  if (avatarImg && user.avatar_url) {
    avatarImg.src = user.avatar_url;
    avatarImg.style.display = 'block';
    if (userInitials) userInitials.style.display = 'none';
  }

  // Actualizar perfil en dropdown
  const profileInitials = document.getElementById('profileInitials');
  if (profileInitials) {
    profileInitials.textContent = initials;
  }

  const profileAvatarImg = document.getElementById('profileAvatarImg');
  if (profileAvatarImg && user.avatar_url) {
    profileAvatarImg.src = user.avatar_url;
    profileAvatarImg.style.display = 'block';
    if (profileInitials) profileInitials.style.display = 'none';
  }

  const profileName = document.getElementById('profileName');
  if (profileName) profileName.textContent = fullName;

  const profileEmail = document.getElementById('profileEmail');
  if (profileEmail) profileEmail.textContent = email;

  const profileRole = document.getElementById('profileRole');
  if (profileRole) profileRole.textContent = role;

  console.log('✅ Perfil de usuario actualizado:', fullName);
}

// ====== CERRAR MENÚ AL HACER CLIC FUERA ======
document.addEventListener('click', (e) => {
  const userMenu = document.getElementById('userMenu');
  if (userMenu && userMenu.hasAttribute('open')) {
    if (!userMenu.contains(e.target)) {
      userMenu.removeAttribute('open');
    }
  }
});

// ====== LLAMAR EN DOMContentLoaded ======
document.addEventListener('DOMContentLoaded', () => {
  updateUserProfile();
  // ... resto de tu código de inicialización
});
```

## Personalización

### Cambiar Colores del Avatar

En `profile-menu.css`, línea ~46:

```css
.avatar {
  background: linear-gradient(135deg, #2b0e31 0%, #4a1e5c 100%);
}
```

### Cambiar Colores del Badge de Rol

En `profile-menu.css`, línea ~105:

```css
.profile-role {
  background: linear-gradient(135deg, #2b0e31 0%, #4a1e5c 100%);
  color: white;
}
```

### Agregar Más Opciones de Menú

```html
<div class="menu-section">
  <a href="./nueva-pagina.html" class="menu-item">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <!-- Tu icono SVG -->
    </svg>
    Nueva Opción
  </a>
</div>
```

### Agregar Estadísticas (Opcional)

Antes del separador final, agrega:

```html
<div class="profile-stats">
  <div class="stat-item">
    <span class="stat-value">24</span>
    <span class="stat-label">Documentos</span>
  </div>
  <div class="stat-item">
    <span class="stat-value">12</span>
    <span class="stat-label">Firmados</span>
  </div>
  <div class="stat-item">
    <span class="stat-value">5</span>
    <span class="stat-label">Pendientes</span>
  </div>
</div>
```

## Iconos SVG Disponibles

### Configuración
```html
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="3"/>
  <path d="M12 1v6m0 6v6"/>
</svg>
```

### Perfil
```html
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
  <circle cx="12" cy="7" r="4"/>
</svg>
```

### Ayuda
```html
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="10"/>
  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</svg>
```

## Estructura de Datos del Usuario

El menú espera un objeto de usuario con esta estructura:

```javascript
{
  first_name: "Pedro",
  last_name: "Sánchez",
  email: "pedro.sanchez@ejemplo.com",
  role: "Administrador",
  avatar_url: "https://ejemplo.com/avatar.jpg" // Opcional
}
```

## Páginas Actualizadas

- ✅ `tracking.html` - Ya implementado
- ⏳ `index.html` - Por implementar
- ⏳ `folder.html` - Por implementar
- ⏳ `sign.html` - Por implementar
- ⏳ `config.html` - Por implementar

## Características

✨ **Diseño Moderno**
- Gradientes en avatar y badge de rol
- Sombras suaves y profundas
- Bordes redondeados
- Animaciones fluidas

🎨 **Visual**
- Avatar con iniciales o foto
- Colores del brand (morado oscuro)
- Iconos SVG en cada opción
- Separadores sutiles

📱 **Responsive**
- Funciona en móvil, tablet y desktop
- Ajustes automáticos de tamaño

🌙 **Dark Mode**
- Soporte automático para modo oscuro
- Se activa con `prefers-color-scheme: dark`

## Notas Técnicas

- Usa el elemento `<details>` nativo para mejor accesibilidad
- Cierra automáticamente al hacer clic fuera
- Animaciones CSS con `cubic-bezier` para efectos suaves
- Z-index: 1000 para aparecer sobre otros elementos
- Transform origin en esquina superior derecha

## Soporte

Para preguntas sobre implementación:
- CSS: `frontend/public/Main/M-styles/profile-menu.css`
- Ejemplo: `frontend/public/Main/tracking.html`
- JS: `frontend/public/Main/tracking.js` (líneas 352-443)
