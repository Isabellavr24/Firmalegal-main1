// profile.js - Gestión del perfil de usuario

// Modal de notificación (reemplaza alert())
function showNotify(title, message, isError) {
    const modal = document.getElementById('notify-modal');
    const iconEl = document.getElementById('notify-icon');
    const titleEl = document.getElementById('notify-title');
    const msgEl = document.getElementById('notify-msg');
    const okBtn = document.getElementById('notify-ok');
    if (!modal) { alert(message); return; }

    iconEl.textContent = isError ? '✕' : '✓';
    iconEl.style.color = isError ? '#c41e56' : '#2b9348';
    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.style.display = 'flex';

    const close = () => { modal.style.display = 'none'; okBtn.removeEventListener('click', close); };
    okBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
}

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

    // Configurar botón de vinculación con Validación de Identidad
    setupViLinkButton();
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
        showNotify('Campos requeridos', 'Por favor completa todos los campos.', true);
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
            showNotify('Error', 'No se pudo determinar el rol del usuario.', true);
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

            if (data.emailPending) {
                showNotify('Correo pendiente de verificación', data.message, false);
            } else {
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
                showNotify('Perfil actualizado', 'Tu perfil ha sido actualizado correctamente.', false);
            }

            // Recargar datos
            await loadUserProfile();
        } else {
            showNotify('Error', data.message || 'Error al actualizar perfil', true);
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showNotify('Error de conexión', 'No se pudo conectar con el servidor. Intenta de nuevo.', true);
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
            showNotify('Formato inválido', 'Por favor selecciona un archivo de imagen válido.', true);
            return;
        }

        // Validar tamaño (5MB máximo)
        if (file.size > 5 * 1024 * 1024) {
            showNotify('Imagen demasiado grande', 'El archivo supera el límite de 5MB.', true);
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
            if (window.confirm('¿Estás seguro de que deseas eliminar tu avatar?')) {
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

            showNotify('Foto actualizada', 'Tu foto de perfil ha sido actualizada correctamente.', false);
        } else {
            console.error('❌ Error al subir avatar:', data.message);
            showNotify('Error', data.message || 'No se pudo subir la imagen.', true);
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showNotify('Error de conexión', 'No se pudo conectar con el servidor. Intenta de nuevo.', true);
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

            showNotify('Foto eliminada', 'Tu foto de perfil ha sido eliminada correctamente.', false);
        } else {
            console.error('❌ Error al eliminar avatar:', data.message);
            showNotify('Error', data.message || 'No se pudo eliminar la foto.', true);
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showNotify('Error de conexión', 'No se pudo conectar con el servidor. Intenta de nuevo.', true);
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

// =============================================
// VINCULACIÓN CON VALIDACIÓN DE IDENTIDAD
// =============================================

function setupViLinkButton() {
    const btn = document.getElementById('vi-link-btn');
    const modal = document.getElementById('vi-confirm-modal');
    const cancelBtn = document.getElementById('vi-confirm-cancel');
    const okBtn = document.getElementById('vi-confirm-ok');
    if (!btn || !modal) return;

    // Consultar estado de vinculación al cargar
    (async () => {
        try {
            const resp = await fetch('/api/integration/vi-link-status', { credentials: 'include' });
            const data = await resp.json();
            const statusEl = document.getElementById('vi-link-status');
            if (data.vinculado) {
                // Mostrar badge de vinculado y ocultar botón de solicitud
                if (statusEl) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = '#e8f5e9';
                    statusEl.style.color = '#1b5e20';
                    statusEl.style.border = '1px solid #a5d6a7';
                    statusEl.style.borderRadius = '8px';
                    statusEl.style.padding = '12px 16px';
                    statusEl.style.fontSize = '14px';
                    statusEl.innerHTML = `<strong style="font-size:15px;">✓ Cuenta vinculada con Validación de Identidad</strong><br>
                        <span style="color:#2e7d32;font-size:13px;">Tu cuenta FirmaLegal está activa y conectada al sistema biométrico de PKI Services. Puedes iniciar procesos de firma con validación de identidad.</span>`;
                }
                btn.style.display = 'none';
            }
        } catch (_) { /* silenciar — si falla, se muestra el botón normal */ }
    })();

    // Abrir modal al pulsar el botón
    btn.addEventListener('click', () => {
        modal.style.display = 'flex';
    });

    // Cerrar modal con Cancelar o clic en backdrop
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // Confirmar y enviar solicitud
    okBtn.addEventListener('click', async () => {
        modal.style.display = 'none';

        const currentUser = window.permissions.getCurrentUser();
        if (!currentUser) return;

        const fullName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim();
        const email = currentUser.email;
        const userId = currentUser.user_id;
        const statusEl = document.getElementById('vi-link-status');

        btn.disabled = true;
        btn.textContent = 'Enviando solicitud...';
        if (statusEl) statusEl.style.display = 'none';

        try {
            const response = await fetch('/api/integration/request-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, fullName, email })
            });

            const data = await response.json();

            if (statusEl) {
                statusEl.style.display = 'block';
                if (data.success) {
                    statusEl.style.background = '#e8f5e9';
                    statusEl.style.color = '#1b5e20';
                    statusEl.style.border = '1px solid #a5d6a7';
                    statusEl.textContent = '✓ ' + data.message;
                    btn.textContent = 'Solicitud enviada';
                } else {
                    statusEl.style.background = '#fce4ec';
                    statusEl.style.color = '#b71c1c';
                    statusEl.style.border = '1px solid #ef9a9a';
                    statusEl.textContent = '✗ ' + (data.message || 'Error al enviar la solicitud');
                    btn.disabled = false;
                    btn.textContent = 'Solicitar vinculación';
                }
            }
        } catch (error) {
            console.error('❌ Error al solicitar vinculación:', error);
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.background = '#fce4ec';
                statusEl.style.color = '#b71c1c';
                statusEl.style.border = '1px solid #ef9a9a';
                statusEl.textContent = '✗ Error de conexión. Intenta de nuevo.';
            }
            btn.disabled = false;
            btn.textContent = 'Solicitar vinculación';
        }
    });
}
