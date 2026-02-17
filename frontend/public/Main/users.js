// users.js - Gestión de usuarios en config.html

let availableRoles = []; // Almacenar roles disponibles

document.addEventListener('DOMContentLoaded', () => {
    console.log('👥 Módulo de usuarios cargado');
    
    // Verificar permisos primero
    if (!window.permissions.requireLogin()) {
        return; // Sale si no está logueado
    }

    // Verificar si puede acceder a configuración
    if (!window.permissions.canAccessConfig()) {
        console.warn('⛔ No tienes permisos para acceder a configuración');
        window.location.href = '/index.html';
        return;
    }
    
    // Cargar roles primero
    loadRoles().then(() => {
        // Luego cargar usuarios
        loadUsers();
    });
    
    // Configurar modal de usuarios
    setupUserModal();

    // Aplicar permisos a la interfaz
    applyUIPermissions();
});

// Aplicar permisos a la interfaz de usuario
function applyUIPermissions() {
    const user = window.permissions.getCurrentUser();
    if (!user) return;

    console.log('🔐 Aplicando permisos de UI para:', user.role_name);

    // Ocultar botón "Nuevo Usuario" si no puede gestionar usuarios
    if (!window.permissions.canManageUsers()) {
        const newUserBtn = document.getElementById('newUserBtn');
        if (newUserBtn) {
            newUserBtn.style.display = 'none';
            console.log('🔒 Botón "Nuevo Usuario" oculto');
        }
    }

    // Para Admin y Tenant Admin: ocultar menú de usuarios en sidebar
    if (['Admin', 'Tenant Admin'].includes(user.role_name)) {
        const userMenuItem = document.querySelector('[data-section="usuarios"]');
        if (userMenuItem) {
            userMenuItem.style.display = 'none';
            console.log('🔒 Menú de usuarios oculto para Admin/Tenant Admin');
        }
    }
}

// Función para cargar roles desde la API
async function loadRoles() {
    console.log('📋 Cargando roles...');
    
    try {
        const response = await fetch('/api/roles');
        const data = await response.json();

        if (data.success) {
            availableRoles = data.roles;
            console.log('✅ Roles cargados:', availableRoles.length);
            populateRoleSelect();
        } else {
            console.error('❌ Error al cargar roles:', data.message);
        }
    } catch (error) {
        console.error('❌ Error de conexión al cargar roles:', error);
    }
}

// Función para popular el select de roles
function populateRoleSelect() {
    const roleSelect = document.getElementById('um-role');
    if (!roleSelect) return;

    // Limpiar opciones existentes
    roleSelect.innerHTML = '';

    // Agregar roles desde la base de datos
    availableRoles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.role_id;
        option.textContent = role.role_name;
        option.title = role.role_description; // Tooltip con descripción
        roleSelect.appendChild(option);
    });
}

// Función para cargar usuarios desde la API
async function loadUsers() {
    console.log('📡 Cargando usuarios...');
    
    const user = window.permissions.getCurrentUser();
    if (!user) return;

    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        if (data.success) {
            let usersToDisplay = data.users;

            // Para Admin y Tenant Admin: solo mostrar su propio perfil
            if (['Admin', 'Tenant Admin'].includes(user.role_name)) {
                usersToDisplay = data.users.filter(u => u.user_id === user.user_id);
                console.log('👤 Filtrando para mostrar solo perfil propio');
            }

            console.log('✅ Usuarios cargados:', usersToDisplay.length);
            renderUsers(usersToDisplay);
        } else {
            console.error('❌ Error al cargar usuarios:', data.message);
            showError('No se pudieron cargar los usuarios');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showError('Error de conexión al cargar usuarios');
    }
}

// Función para renderizar la tabla de usuarios
function renderUsers(users) {
    const tbody = document.getElementById('usersTbody');
    
    if (!tbody) {
        console.error('❌ No se encontró el tbody con id "usersTbody"');
        return;
    }

    // Limpiar tabla
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: #999;">
                    No hay usuarios registrados
                </td>
            </tr>
        `;
        return;
    }

    // Renderizar cada usuario
    users.forEach(user => {
        const row = createUserRow(user);
        tbody.appendChild(row);
    });
}

// Función para crear una fila de usuario
function createUserRow(user) {
    const tr = document.createElement('tr');
    tr.dataset.userId = user.user_id;

    // Nombre completo
    const tdName = document.createElement('td');
    tdName.textContent = `${user.first_name} ${user.last_name}`;
    tr.appendChild(tdName);

    // Email
    const tdEmail = document.createElement('td');
    tdEmail.textContent = user.email;
    tr.appendChild(tdEmail);

    // Rol (con pill y clase específica)
    const tdRole = document.createElement('td');
    const rolePill = document.createElement('span');
    rolePill.className = `role-pill ${getRoleClass(user.role_name)}`;
    rolePill.textContent = user.role_name;
    tdRole.appendChild(rolePill);
    tr.appendChild(tdRole);

    // Última sesión
    const tdLastLogin = document.createElement('td');
    tdLastLogin.textContent = formatDate(user.last_login);
    tr.appendChild(tdLastLogin);

    // Acciones
    const tdActions = document.createElement('td');
    
    const currentUser = window.permissions.getCurrentUser();
    const canEdit = window.permissions.canEditUsers() || 
                   (window.permissions.canEditOwnProfile() && user.user_id === currentUser.user_id);

    if (canEdit) {
        const btnEdit = document.createElement('button');
        btnEdit.className = 'user-action js-edit';
        btnEdit.dataset.id = user.user_id;
        btnEdit.textContent = 'Editar';
        btnEdit.addEventListener('click', () => openEditModal(user));
        tdActions.appendChild(btnEdit);
    } else {
        tdActions.innerHTML = '<span style="color: #999;">Sin permisos</span>';
    }
    
    tr.appendChild(tdActions);

    return tr;
}

// Función para obtener la clase CSS del rol
function getRoleClass(roleName) {
    const roleMap = {
        'Superadministrador': 'role-superadmin',
        'Tenant Admin': 'role-admin',
        'Admin': 'role-admin',
        'Editor': 'role-editor',
        'Member': 'role-editor',
        'Agent': 'role-editor',
        'Viewer': 'role-viewer'
    };
    
    return roleMap[roleName] || '';
}

// Configurar el modal de usuarios
function setupUserModal() {
    const modal = document.getElementById('userModal');
    const closeBtn = document.getElementById('umClose');
    const cancelBtn = document.getElementById('umCancel');
    const submitBtn = document.getElementById('umSubmit');
    const form = document.getElementById('userForm');
    const newUserBtn = document.getElementById('btnNewUser');

    if (!modal || !form) {
        console.error('❌ No se encontró el modal o el formulario');
        return;
    }

    // Botón para crear nuevo usuario
    newUserBtn?.addEventListener('click', () => {
        openCreateModal();
    });

    // Cerrar modal
    const closeModal = () => {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        form.reset();
        document.getElementById('um-id').value = '';
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    // Click fuera del modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Submit del formulario
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleUserSubmit();
    });
}

// Abrir modal para crear usuario
function openCreateModal() {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('um-title');
    const form = document.getElementById('userForm');

    form.reset();
    document.getElementById('um-id').value = '';
    title.textContent = 'Nuevo usuario';

    // Ocultar campo contraseña — se genera automáticamente y llega por email
    const passRow = document.getElementById('um-pass-row');
    if (passRow) passRow.style.display = 'none';
    const passField = document.getElementById('um-pass');
    if (passField) { passField.required = false; passField.value = ''; }

    // Mostrar nota informativa
    const passNote = document.getElementById('um-pass-note');
    if (passNote) passNote.style.display = '';

    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
}

// Abrir modal para editar usuario
function openEditModal(user) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('um-title');

    title.textContent = 'Editar usuario';

    // Rellenar formulario
    document.getElementById('um-id').value = user.user_id;
    document.getElementById('um-first').value = user.first_name;
    document.getElementById('um-last').value = user.last_name;
    document.getElementById('um-email').value = user.email;

    const passField = document.getElementById('um-pass');
    if (passField) {
        passField.value = '';
        passField.required = false;
        passField.placeholder = 'Dejar vacío para mantener actual';
    }

    // Mostrar campo contraseña en modo edición (opcional)
    const passRow = document.getElementById('um-pass-row');
    if (passRow) passRow.style.display = '';

    // Ocultar nota informativa de contraseña automática
    const passNote = document.getElementById('um-pass-note');
    if (passNote) passNote.style.display = 'none';

    // Seleccionar rol por role_id
    const roleSelect = document.getElementById('um-role');
    const userRole = availableRoles.find(r => r.role_name === user.role_name);
    if (userRole) {
        roleSelect.value = userRole.role_id;
    }

    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
}

// Manejar submit del formulario (crear o editar)
async function handleUserSubmit() {
    const userId = document.getElementById('um-id').value;
    const firstName = document.getElementById('um-first').value.trim();
    const lastName = document.getElementById('um-last').value.trim();
    const email = document.getElementById('um-email').value.trim();
    const password = document.getElementById('um-pass').value;
    const roleId = document.getElementById('um-role').value;

    console.log('📝 Datos del formulario:', {
        userId,
        firstName,
        lastName,
        email,
        roleId,
        hasPassword: !!password
    });

    // Validaciones
    if (!firstName || !lastName || !email || !roleId) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }

    const submitBtn = document.getElementById('umSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
        // Obtener usuario actual para enviar permisos
        const currentUser = window.permissions.getCurrentUser();
        
        const userData = {
            firstName,
            lastName,
            email,
            roleId: parseInt(roleId),
            requestingUserId: currentUser.user_id,
            requestingUserRole: currentUser.role_name
        };

        if (password) {
            userData.password = password;
        }

        console.log('📤 Enviando datos al servidor:', userData);

        let response;
        if (userId) {
            // Editar usuario existente
            response = await fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
        } else {
            // Crear nuevo usuario
            response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
        }

        const data = await response.json();

        if (data.success) {
            console.log('✅ Usuario guardado exitosamente');
            
            // Cerrar modal
            document.getElementById('userModal').style.display = 'none';
            document.getElementById('userModal').setAttribute('aria-hidden', 'true');
            
            // Recargar usuarios
            await loadUsers();
            
            alert(userId ? 'Usuario actualizado correctamente' : '✅ Usuario creado. Se ha enviado un correo con sus credenciales de acceso.');
        } else {
            alert(data.message || 'Error al guardar usuario');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Error de conexión al guardar usuario');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar';
    }
}

// Función para formatear fecha
function formatDate(dateString) {
    if (!dateString) return 'Nunca';

    // Parsear la fecha directamente - MySQL envía en hora local del servidor
    // Convertir formato MySQL "YYYY-MM-DD HH:MM:SS" a formato ISO "YYYY-MM-DDTHH:MM:SS"
    let parsedDate = dateString;
    if (dateString.includes(' ') && !dateString.includes('T')) {
        parsedDate = dateString.replace(' ', 'T');
    }

    const date = new Date(parsedDate);

    // Validar que la fecha sea válida
    if (isNaN(date.getTime())) {
        console.warn('⚠️ Fecha inválida:', dateString);
        return 'Fecha inválida';
    }

    const now = new Date();
    const diffMs = now - date;

    // Si la diferencia es negativa (fecha en el futuro), mostrar "Ahora mismo"
    if (diffMs < 0) {
        console.warn('⚠️ Fecha en el futuro:', dateString, 'Diferencia:', diffMs);
        return 'Ahora mismo';
    }

    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Log para debugging
    console.log('📅 Cálculo de tiempo:', {
        fechaOriginal: dateString,
        fechaParseada: date.toISOString(),
        ahora: now.toISOString(),
        difSeg: diffSecs,
        difMin: diffMins,
        difHoras: diffHours
    });

    if (diffSecs < 10) return 'Ahora mismo';
    if (diffSecs < 60) return `Hace ${diffSecs} seg`;
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;

    // Formato: "20 de oct, 2025"
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('es-ES', options);
}

// Función para editar usuario (placeholder)
function editUser(user) {
    console.log('✏️ Editar usuario:', user);
    // TODO: Implementar modal de edición
    alert(`Editar usuario: ${user.first_name} ${user.last_name}\n\nEsta funcionalidad se implementará próximamente.`);
}

// Función para mostrar errores
function showError(message) {
    const tbody = document.getElementById('usersTbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: #e74c3c;">
                    ⚠️ ${message}
                </td>
            </tr>
        `;
    }
}
