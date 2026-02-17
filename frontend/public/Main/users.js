// users.js - Gestión de usuarios en config.html

let availableRoles = [];

// ─── Toast dinámico (reemplaza alert) ───────────────────────────────────────
function showToast(message, type = 'success') {
    // Eliminar toast anterior si existe
    const prev = document.getElementById('users-toast');
    if (prev) prev.remove();

    const icons = {
        success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        error:   `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        warn:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    };
    const colors = {
        success: { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: '#22c55e' },
        error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '#ef4444' },
        warn:    { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '#f59e0b' }
    };
    const c = colors[type] || colors.success;

    const toast = document.createElement('div');
    toast.id = 'users-toast';
    toast.style.cssText = `
        position: fixed; bottom: 28px; right: 28px; z-index: 9999;
        display: flex; align-items: flex-start; gap: 12px;
        background: ${c.bg}; border: 1.5px solid ${c.border}; border-radius: 14px;
        padding: 16px 20px; max-width: 380px; min-width: 260px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.10);
        animation: toastIn .25s cubic-bezier(.4,0,.2,1);
    `;
    toast.innerHTML = `
        <span style="color:${c.icon}; flex-shrink:0; margin-top:1px;">${icons[type] || icons.success}</span>
        <span style="font-size:14px; font-weight:500; color:${c.text}; line-height:1.5; flex:1;">${message}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:${c.text};opacity:.5;font-size:18px;line-height:1;padding:0;flex-shrink:0;margin-top:-1px;">×</button>
    `;

    // Inyectar animación si no existe
    if (!document.getElementById('toast-keyframes')) {
        const style = document.createElement('style');
        style.id = 'toast-keyframes';
        style.textContent = `@keyframes toastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast && toast.remove(), 4500);
}

// ─── Modal de validación inline (reemplaza alert de campos vacíos) ──────────
function showFieldError(message) {
    const existing = document.getElementById('um-field-error');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'um-field-error';
    el.style.cssText = `
        display:flex; align-items:center; gap:8px;
        background:#fef2f2; border:1.5px solid #fca5a5; border-radius:10px;
        padding:10px 14px; font-size:13px; font-weight:500; color:#991b1b;
        margin-bottom:12px;
    `;
    el.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        ${message}
    `;

    // Insertar al inicio del form body
    const formBody = document.querySelector('#userForm');
    if (formBody) formBody.prepend(el);
    setTimeout(() => el && el.remove(), 4000);
}

// ────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (!window.permissions.requireLogin()) return;
    if (!window.permissions.canAccessConfig()) {
        window.location.href = '/index.html';
        return;
    }

    loadRoles().then(() => loadUsers());
    setupUserModal();
    applyUIPermissions();
});

function applyUIPermissions() {
    const user = window.permissions.getCurrentUser();
    if (!user) return;

    if (!window.permissions.canManageUsers()) {
        const btn = document.getElementById('newUserBtn');
        if (btn) btn.style.display = 'none';
    }

    if (['Admin', 'Tenant Admin'].includes(user.role_name)) {
        const item = document.querySelector('[data-section="usuarios"]');
        if (item) item.style.display = 'none';
    }
}

async function loadRoles() {
    try {
        const response = await fetch('/api/roles');
        const data = await response.json();
        if (data.success) {
            availableRoles = data.roles;
            populateRoleSelect();
        }
    } catch (error) {
        console.error('❌ Error al cargar roles:', error);
    }
}

function populateRoleSelect() {
    const roleSelect = document.getElementById('um-role');
    if (!roleSelect) return;
    roleSelect.innerHTML = '';
    availableRoles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.role_id;
        option.textContent = role.role_name;
        option.title = role.role_description;
        roleSelect.appendChild(option);
    });
}

async function loadUsers() {
    const user = window.permissions.getCurrentUser();
    if (!user) return;

    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        if (data.success) {
            let usersToDisplay = data.users;
            if (['Admin', 'Tenant Admin'].includes(user.role_name)) {
                usersToDisplay = data.users.filter(u => u.user_id === user.user_id);
            }
            renderUsers(usersToDisplay);
        } else {
            showError('No se pudieron cargar los usuarios');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showError('Error de conexión al cargar usuarios');
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:20px;color:#999;">
                    No hay usuarios registrados
                </td>
            </tr>`;
        return;
    }

    users.forEach(user => tbody.appendChild(createUserRow(user)));
}

function createUserRow(user) {
    const tr = document.createElement('tr');
    tr.dataset.userId = user.user_id;

    const tdName = document.createElement('td');
    tdName.textContent = `${user.first_name} ${user.last_name}`;
    tr.appendChild(tdName);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = user.email;
    tr.appendChild(tdEmail);

    const tdRole = document.createElement('td');
    const rolePill = document.createElement('span');
    rolePill.className = `role-pill ${getRoleClass(user.role_name)}`;
    rolePill.textContent = user.role_name;
    tdRole.appendChild(rolePill);
    tr.appendChild(tdRole);

    const tdLastLogin = document.createElement('td');
    tdLastLogin.textContent = formatDate(user.last_login);
    tr.appendChild(tdLastLogin);

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
        tdActions.innerHTML = '<span style="color:#999;">Sin permisos</span>';
    }

    tr.appendChild(tdActions);
    return tr;
}

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

function setupUserModal() {
    const modal = document.getElementById('userModal');
    const closeBtn = document.getElementById('umClose');
    const cancelBtn = document.getElementById('umCancel');
    const form = document.getElementById('userForm');
    const newUserBtn = document.getElementById('btnNewUser');

    if (!modal || !form) return;

    newUserBtn?.addEventListener('click', () => openCreateModal());

    const closeModal = () => {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        form.reset();
        document.getElementById('um-id').value = '';
        // Limpiar error inline si existe
        const err = document.getElementById('um-field-error');
        if (err) err.remove();
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    form.addEventListener('submit', async e => { e.preventDefault(); await handleUserSubmit(); });
}

function openCreateModal() {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');

    form.reset();
    document.getElementById('um-id').value = '';
    document.getElementById('um-title').textContent = 'Nuevo usuario';

    const passRow = document.getElementById('um-pass-row');
    if (passRow) passRow.style.display = 'none';
    const passField = document.getElementById('um-pass');
    if (passField) { passField.required = false; passField.value = ''; }

    const passNote = document.getElementById('um-pass-note');
    if (passNote) passNote.style.display = '';

    const err = document.getElementById('um-field-error');
    if (err) err.remove();

    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
}

function openEditModal(user) {
    const modal = document.getElementById('userModal');

    document.getElementById('um-title').textContent = 'Editar usuario';
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

    const passRow = document.getElementById('um-pass-row');
    if (passRow) passRow.style.display = '';

    const passNote = document.getElementById('um-pass-note');
    if (passNote) passNote.style.display = 'none';

    const roleSelect = document.getElementById('um-role');
    const userRole = availableRoles.find(r => r.role_name === user.role_name);
    if (userRole) roleSelect.value = userRole.role_id;

    const err = document.getElementById('um-field-error');
    if (err) err.remove();

    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
}

async function handleUserSubmit() {
    const userId    = document.getElementById('um-id').value;
    const firstName = document.getElementById('um-first').value.trim();
    const lastName  = document.getElementById('um-last').value.trim();
    const email     = document.getElementById('um-email').value.trim();
    const password  = document.getElementById('um-pass').value;
    const roleId    = document.getElementById('um-role').value;

    if (!firstName || !lastName || !email || !roleId) {
        showFieldError('Por favor completa todos los campos requeridos.');
        return;
    }

    const submitBtn = document.getElementById('umSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
        const currentUser = window.permissions.getCurrentUser();
        const userData = {
            firstName, lastName, email,
            roleId: parseInt(roleId),
            requestingUserId: currentUser.user_id,
            requestingUserRole: currentUser.role_name
        };
        if (password) userData.password = password;

        const url    = userId ? `/api/users/${userId}` : '/api/users';
        const method = userId ? 'PUT' : 'POST';
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const data = await response.json();

        if (data.success) {
            // Cerrar modal
            document.getElementById('userModal').style.display = 'none';
            document.getElementById('userModal').setAttribute('aria-hidden', 'true');
            await loadUsers();

            const msg = userId
                ? 'Usuario actualizado correctamente.'
                : 'Usuario creado. Se ha enviado un correo con las credenciales de acceso.';
            showToast(msg, 'success');
        } else {
            showToast(data.message || 'Error al guardar usuario.', 'error');
        }
    } catch (error) {
        console.error('❌ Error:', error);
        showToast('Error de conexión al guardar usuario.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Nunca';

    let parsedDate = dateString;
    if (dateString.includes(' ') && !dateString.includes('T')) {
        parsedDate = dateString.replace(' ', 'T');
    }

    const date = new Date(parsedDate);
    if (isNaN(date.getTime())) return 'Fecha inválida';

    const now = new Date();
    const diffMs = now - date;
    if (diffMs < 0) return 'Ahora mismo';

    const diffSecs  = Math.floor(diffMs / 1000);
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays  = Math.floor(diffMs / 86400000);

    if (diffSecs < 10)  return 'Ahora mismo';
    if (diffSecs < 60)  return `Hace ${diffSecs} seg`;
    if (diffMins < 60)  return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7)   return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;

    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showError(message) {
    const tbody = document.getElementById('usersTbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center;padding:20px;color:#e74c3c;">
                    ⚠️ ${message}
                </td>
            </tr>`;
    }
}
