// profile.js - Gestión del perfil de usuario

document.addEventListener('DOMContentLoaded', () => {
    console.log('👤 Módulo de perfil cargado');
    
    // Verificar permisos primero
    if (!window.permissions) {
        console.error('❌ window.permissions no está disponible');
        showProfileError('Error al cargar el sistema de permisos');
        return;
    }

    if (!window.permissions.requireLogin()) {
        return;
    }

    // Cargar datos del perfil
    loadUserProfile();

    // Configurar formulario de perfil
    setupProfileForm();
    
    // Configurar upload de avatar
    setupAvatarUpload();
});

// Cargar datos del perfil desde la API
async function loadUserProfile() {
    console.log('📡 Cargando perfil del usuario...');
    
    const currentUser = window.permissions.getCurrentUser();
    if (!currentUser || !currentUser.user_id) {
        console.error('❌ No se encontró usuario actual');
        showProfileError('No se encontró sesión de usuario');
        return;
    }

    console.log('👤 Usuario actual:', currentUser);
    console.log('🔑 User ID:', currentUser.user_id);

    try {
        const url = `/api/users/${currentUser.user_id}`;
        console.log('📤 Solicitando perfil desde:', url);
        
        const response = await fetch(url);
        console.log('📥 Respuesta recibida:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📦 Datos recibidos:', data);

        if (data.success && data.user) {
            console.log('✅ Perfil cargado:', data.user);
            populateProfileForm(data.user);
        } else {
            console.error('❌ Error al cargar perfil:', data.message);
            showProfileError('No se pudo cargar el perfil');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showProfileError('Error de conexión al cargar perfil');
    }
}

// Rellenar el formulario de perfil con los datos del usuario
function populateProfileForm(user) {
    // Campos básicos
    const firstNameInput = document.getElementById('pf-nombre');
    const lastNameInput = document.getElementById('pf-apellido');
    const emailInput = document.getElementById('pf-email');

    if (firstNameInput) firstNameInput.value = user.first_name || '';
    if (lastNameInput) lastNameInput.value = user.last_name || '';
    if (emailInput) emailInput.value = user.email || '';

    console.log('✅ Formulario de perfil rellenado');
}

// Configurar el formulario de perfil
function setupProfileForm() {
    const form = document.getElementById('perfilForm');
    if (!form) {
        console.warn('⚠️ No se encontró el formulario de perfil');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleProfileUpdate();
    });
}

// Manejar actualización del perfil
async function handleProfileUpdate() {
    const currentUser = window.permissions.getCurrentUser();
    if (!currentUser) return;

    const firstName = document.getElementById('pf-nombre').value.trim();
    const lastName = document.getElementById('pf-apellido').value.trim();
    const email = document.getElementById('pf-email').value.trim();

    // Validaciones básicas
    if (!firstName || !lastName || !email) {
        alert('Por favor completa todos los campos');
        return;
    }

    const submitBtn = document.querySelector('#perfilForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'ACTUALIZANDO...';

    try {
        // Obtener role_id desde la respuesta actualizada del perfil o usar el del localStorage
        const roleId = currentUser.role_id;
        
        if (!roleId) {
            console.error('❌ No se encontró role_id');
            alert('Error: No se pudo determinar el rol del usuario');
            return;
        }

        const userData = {
            firstName,
            lastName,
            email,
            roleId: roleId,
            requestingUserId: currentUser.user_id,
            requestingUserRole: currentUser.role_name
        };

        console.log('📤 Actualizando perfil:', userData);

        const response = await fetch(`/api/users/${currentUser.user_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Perfil actualizado exitosamente');
            
            // Actualizar localStorage con los nuevos datos
            const updatedUser = {
                ...currentUser,
                first_name: firstName,
                last_name: lastName,
                email: email,
                role_id: roleId
            };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            
            alert('Perfil actualizado correctamente');
            
            // Recargar datos
            await loadUserProfile();
        } else {
            alert(data.message || 'Error al actualizar perfil');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Error de conexión al actualizar perfil');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'ACTUALIZAR';
    }
}

// Mostrar error en el perfil
function showProfileError(message) {
    const form = document.getElementById('perfilForm');
    if (form) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = 'padding: 12px; background: #fee; border: 1px solid #fcc; border-radius: 8px; color: #c00; margin-bottom: 16px;';
        errorDiv.textContent = message;
        form.insertBefore(errorDiv, form.firstChild);
    }
}

// =============================================
// FUNCIONES PARA AVATAR
// =============================================

function setupAvatarUpload() {
    const fileInput = document.getElementById('sigFile');
    const removeBtn = document.getElementById('sigRemove');
    const previewWrap = document.getElementById('sigPreviewWrap');
    const previewImg = document.getElementById('sigPreview');

    if (!fileInput) {
        console.warn('⚠️ No se encontró el input de archivo para avatar');
        return;
    }

    // Evento de cambio de archivo
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        console.log('📤 Archivo seleccionado:', file.name);

        // Validar tipo de archivo
        if (!file.type.startsWith('image/')) {
            alert('Por favor selecciona un archivo de imagen válido');
            return;
        }

        // Validar tamaño (5MB máximo)
        if (file.size > 5 * 1024 * 1024) {
            alert('La imagen es demasiado grande. Máximo 5MB');
            return;
        }

        // Mostrar preview local
        const reader = new FileReader();
        reader.onload = (e) => {
            if (previewImg) {
                previewImg.src = e.target.result;
                previewWrap.hidden = false;
                if (removeBtn) removeBtn.disabled = false;
            }
        };
        reader.readAsDataURL(file);

        // Subir al servidor
        await uploadAvatar(file);
    });

    // Evento de eliminar avatar
    if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
            if (confirm('¿Estás seguro de que deseas eliminar tu avatar?')) {
                await deleteAvatar();
            }
        });
    }

    // Cargar avatar existente si hay
    loadExistingAvatar();
}

async function uploadAvatar(file) {
    const currentUser = window.permissions.getCurrentUser();
    if (!currentUser) return;

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('userId', currentUser.user_id);

    try {
        console.log('📤 Subiendo avatar al servidor...');

        const response = await fetch(`/api/users/${currentUser.user_id}/avatar`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Avatar subido exitosamente:', data.avatarUrl);
            
            // Actualizar localStorage
            currentUser.avatar_url = data.avatarUrl;
            localStorage.setItem('user', JSON.stringify(currentUser));
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Actualizar todos los avatares en la página
            window.permissions.updateAllAvatars();
            
            alert('Avatar actualizado correctamente');
        } else {
            console.error('❌ Error al subir avatar:', data.message);
            alert(data.message || 'Error al subir avatar');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        alert('Error de conexión al subir avatar');
    }
}

async function deleteAvatar() {
    const currentUser = window.permissions.getCurrentUser();
    if (!currentUser) return;

    try {
        console.log('🗑️ Eliminando avatar...');

        const response = await fetch(`/api/users/${currentUser.user_id}/avatar`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Avatar eliminado exitosamente');
            
            // Actualizar localStorage
            currentUser.avatar_url = null;
            localStorage.setItem('user', JSON.stringify(currentUser));
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // Limpiar preview
            const previewWrap = document.getElementById('sigPreviewWrap');
            const previewImg = document.getElementById('sigPreview');
            const removeBtn = document.getElementById('sigRemove');
            const fileInput = document.getElementById('sigFile');
            
            if (previewImg) previewImg.src = '';
            if (previewWrap) previewWrap.hidden = true;
            if (removeBtn) removeBtn.disabled = true;
            if (fileInput) fileInput.value = '';
            
            // Actualizar todos los avatares en la página
            window.permissions.updateAllAvatars();
            
            alert('Avatar eliminado correctamente');
        } else {
            console.error('❌ Error al eliminar avatar:', data.message);
            alert(data.message || 'Error al eliminar avatar');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        alert('Error de conexión al eliminar avatar');
    }
}

function loadExistingAvatar() {
    const currentUser = window.permissions.getCurrentUser();
    if (!currentUser || !currentUser.avatar_url) return;

    const previewWrap = document.getElementById('sigPreviewWrap');
    const previewImg = document.getElementById('sigPreview');
    const removeBtn = document.getElementById('sigRemove');

    if (previewImg && currentUser.avatar_url) {
        previewImg.src = currentUser.avatar_url;
        if (previewWrap) previewWrap.hidden = false;
        if (removeBtn) removeBtn.disabled = false;
        console.log('✅ Avatar existente cargado');
    }
}
