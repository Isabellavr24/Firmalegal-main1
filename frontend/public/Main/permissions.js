// permissions.js - Sistema de permisos basado en roles

// Definición de permisos por rol
const PERMISSIONS = {
    'Superadministrador': {
        canAccessConfig: true,
        canManageUsers: true,
        canEditUsers: true,
        canViewAllUsers: true,
        canManageTenants: true,
        canEditOwnProfile: true,
        canAccessDocuments: true,
        canCreateDocuments: true,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: true,
        canCreateFolders: true
    },
    'Tenant Admin': {
        canAccessConfig: true,
        canManageUsers: false,
        canEditUsers: false,
        canViewAllUsers: false,
        canManageTenants: true,
        canEditOwnProfile: true,
        canAccessDocuments: true,
        canCreateDocuments: true,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: true,
        canCreateFolders: true
    },
    'Admin': {
        canAccessConfig: true,
        canManageUsers: false,
        canEditUsers: false,
        canViewAllUsers: false,
        canManageTenants: true,
        canEditOwnProfile: true,
        canAccessDocuments: true,
        canCreateDocuments: true,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: true,
        canCreateFolders: true
    },
    'Editor': {
        canAccessConfig: false,
        canManageUsers: false,
        canEditUsers: false,
        canViewAllUsers: false,
        canManageTenants: false,
        canEditOwnProfile: false,
        canAccessDocuments: true,
        canCreateDocuments: true,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: false,
        canCreateFolders: true
    },
    'Member': {
        canAccessConfig: false,
        canManageUsers: false,
        canEditUsers: false,
        canViewAllUsers: false,
        canManageTenants: false,
        canEditOwnProfile: false,
        canAccessDocuments: true,
        canCreateDocuments: true,
        canUploadDocuments: true,
        canEditDocuments: true,
        canDeleteDocuments: false,
        canCreateFolders: true
    },
    'Agent': {
        canAccessConfig: false,
        canManageUsers: false,
        canEditUsers: false,
        canViewAllUsers: false,
        canManageTenants: false,
        canEditOwnProfile: false,
        canAccessDocuments: true,
        canCreateDocuments: false,
        canUploadDocuments: false,
        canEditDocuments: false,
        canDeleteDocuments: false,
        canCreateFolders: false
    },
    'Viewer': {
        canAccessConfig: false,
        canManageUsers: false,
        canEditUsers: false,
        canViewAllUsers: false,
        canManageTenants: false,
        canEditOwnProfile: false,
        canAccessDocuments: true,
        canCreateDocuments: false,
        canUploadDocuments: false,
        canEditDocuments: false,
        canDeleteDocuments: false,
        canCreateFolders: false
    }
};

// Obtener usuario actual
function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
}

// Verificar si el usuario tiene un permiso específico
function hasPermission(permission) {
    const user = getCurrentUser();
    if (!user || !user.role_name) return false;
    
    const rolePermissions = PERMISSIONS[user.role_name];
    if (!rolePermissions) return false;
    
    return rolePermissions[permission] === true;
}

// Verificar si el usuario puede acceder a configuración
function canAccessConfig() {
    return hasPermission('canAccessConfig');
}

// Verificar si el usuario puede gestionar usuarios
function canManageUsers() {
    return hasPermission('canManageUsers');
}

// Verificar si el usuario puede editar usuarios
function canEditUsers() {
    return hasPermission('canEditUsers');
}

// Verificar si el usuario puede ver todos los usuarios
function canViewAllUsers() {
    return hasPermission('canViewAllUsers');
}

// Verificar si el usuario puede gestionar inquilinos
function canManageTenants() {
    return hasPermission('canManageTenants');
}

// Verificar si el usuario puede editar su propio perfil
function canEditOwnProfile() {
    return hasPermission('canEditOwnProfile');
}

// Redirigir si no tiene permisos
function requirePermission(permission, redirectTo = '/index.html') {
    if (!hasPermission(permission)) {
        console.warn('⛔ Acceso denegado. Redirigiendo...');
        window.location.href = redirectTo;
        return false;
    }
    return true;
}

// Verificar si está logueado
function isLoggedIn() {
    const user = getCurrentUser();
    return user !== null;
}

// Requerir login
function requireLogin(redirectTo = '/login.html') {
    if (!isLoggedIn()) {
        console.warn('⛔ Debes iniciar sesión. Redirigiendo...');
        window.location.href = redirectTo;
        return false;
    }
    return true;
}

// Ocultar elementos según permisos
function applyPermissions() {
    const user = getCurrentUser();
    if (!user) return;

    console.log('🔐 Aplicando permisos para:', user.role_name);

    // Ocultar sección de usuarios si no tiene permiso
    if (!canManageUsers()) {
        const userSection = document.querySelector('[data-section="usuarios"]');
        const userMenuItem = document.querySelector('[onclick*="usuarios"]');
        
        if (userSection) userSection.style.display = 'none';
        if (userMenuItem) userMenuItem.style.display = 'none';
        
        console.log('🔒 Sección de usuarios oculta');
    }

    // Ocultar botón de nuevo usuario si no puede gestionar usuarios
    if (!canManageUsers()) {
        const newUserBtn = document.getElementById('newUserBtn');
        if (newUserBtn) {
            newUserBtn.style.display = 'none';
            console.log('🔒 Botón "Nuevo Usuario" oculto');
        }
    }

    // Ocultar botones de edición si no puede editar usuarios
    if (!canEditUsers()) {
        const editButtons = document.querySelectorAll('.edit-user-btn');
        editButtons.forEach(btn => {
            btn.style.display = 'none';
        });
        console.log('🔒 Botones de edición ocultos');
    }

    // Mostrar solo perfil propio para Admin y Tenant Admin
    if (['Admin', 'Tenant Admin'].includes(user.role_name)) {
        // En la sección de usuarios, solo mostrar el propio perfil
        const userRows = document.querySelectorAll('.user-row');
        userRows.forEach(row => {
            const rowUserId = row.getAttribute('data-user-id');
            if (rowUserId && parseInt(rowUserId) !== user.user_id) {
                row.style.display = 'none';
            }
        });
        console.log('👤 Mostrando solo perfil propio para Admin/Tenant Admin');
    }
}

// Actualizar avatar con iniciales del usuario o imagen
function updateAvatar(avatarElement) {
    const user = getCurrentUser();
    if (!user || !avatarElement) return;
    
    // Si hay imagen de avatar, mostrarla
    if (user.avatar_url) {
        // Limpiar contenido de texto
        avatarElement.textContent = '';
        
        // Crear o actualizar imagen
        let img = avatarElement.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 50%;';
            avatarElement.appendChild(img);
        }
        img.src = user.avatar_url;
        img.alt = `Avatar de ${user.first_name} ${user.last_name}`;
        
        avatarElement.setAttribute('aria-label', `Perfil de ${user.first_name} ${user.last_name}`);
        avatarElement.setAttribute('title', `${user.first_name} ${user.last_name}`);
        
        console.log('✅ Avatar actualizado con imagen:', user.avatar_url);
    } 
    // Si no hay imagen, mostrar iniciales
    else if (user.first_name && user.last_name) {
        // Remover imagen si existe
        const img = avatarElement.querySelector('img');
        if (img) img.remove();
        
        const firstInitial = user.first_name.charAt(0).toUpperCase();
        const lastInitial = user.last_name.charAt(0).toUpperCase();
        const initials = firstInitial + lastInitial;
        
        avatarElement.textContent = initials;
        avatarElement.setAttribute('aria-label', `Perfil de ${user.first_name} ${user.last_name}`);
        avatarElement.setAttribute('title', `${user.first_name} ${user.last_name}`);
        
        console.log('✅ Avatar actualizado con iniciales:', initials);
    }
}

// Actualizar todos los avatares en la página
function updateAllAvatars() {
    document.querySelectorAll('.avatar').forEach(avatar => {
        updateAvatar(avatar);
    });
}

// Exportar funciones
window.permissions = {
    getCurrentUser,
    hasPermission,
    canAccessConfig,
    canManageUsers,
    canEditUsers,
    canViewAllUsers,
    canManageTenants,
    canEditOwnProfile,
    requirePermission,
    isLoggedIn,
    requireLogin,
    applyPermissions,
    updateAvatar,
    updateAllAvatars
};

// Badge de saldo de firmas — aparece en todas las páginas autenticadas (excepto login, public-sign)
(function() {
    const skipPages = ['/login.html', '/public-sign.html', '/verify.html'];
    if (skipPages.some(p => window.location.pathname.endsWith(p))) return;

    function updateFirmaBadge() {
        const user = window.permissions?.getCurrentUser();
        if (!user || user.role_name === 'Superadministrador') return;

        fetch('/api/firmas/mi-balance', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (!data.success) return;
                let badge = document.getElementById('firma-balance-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'firma-balance-badge';
                    badge.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9000;border-radius:20px;padding:8px 16px;font-size:13px;font-weight:600;box-shadow:0 2px 12px rgba(0,0,0,0.12);font-family:inherit;pointer-events:none;transition:background .3s,color .3s;';
                    document.body.appendChild(badge);
                }
                let bg, color, border, texto;
                if (data.ilimitado) {
                    bg = '#ede8f0'; color = '#2b0e31'; border = '#c9b8d0'; texto = 'Firmas ilimitadas';
                } else if (data.balance === 0) {
                    bg = '#fce8f0'; color = '#7a0d3a'; border = '#e8b0cc'; texto = '<strong>0</strong> firmas disponibles';
                } else if (data.balance < 50) {
                    bg = '#fef3c7'; color = '#92400e'; border = '#fcd34d'; texto = `<strong>${data.balance}</strong> firmas disponibles`;
                } else {
                    bg = '#ede8f0'; color = '#2b0e31'; border = '#c9b8d0'; texto = `<strong>${data.balance}</strong> firmas disponibles`;
                }
                badge.style.background = bg;
                badge.style.color = color;
                badge.style.border = `1px solid ${border}`;
                badge.innerHTML = texto;
            }).catch(() => {});
    }

    // Carga inicial
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateFirmaBadge);
    } else {
        updateFirmaBadge();
    }

    // Actualizar cada 30 segundos y al volver a la pestaña
    setInterval(updateFirmaBadge, 30000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') updateFirmaBadge();
    });
})();
