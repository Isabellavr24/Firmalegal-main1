/*********************************************************
 * FirmaLegal — teams.js
 * Gestión de equipos y baúl compartido
 **********************************************************/

// ====== Auth fetch helper ======
if (typeof authFetch === 'undefined') {
  function authFetch(url, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = isFormData
      ? { ...options.headers }
      : { 'Content-Type': 'application/json', ...options.headers };
    return fetch(url, { ...options, credentials: 'include', headers });
  }
}

// ====== Toast Manager ======
const ToastManager = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show({ type = 'info', title, message, duration = 4000 }) {
    this.init();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    toast.innerHTML = `
      <div class="toast-icon">${icons[type] || icons.info}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Cerrar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;
    this.container.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', () => this.remove(toast));
    if (duration > 0) setTimeout(() => this.remove(toast), duration);
  },
  remove(toast) { toast.classList.add('removing'); setTimeout(() => toast.parentNode?.removeChild(toast), 300); },
  success(t, m) { this.show({ type: 'success', title: t, message: m }); },
  error(t, m) { this.show({ type: 'error', title: t, message: m }); },
  info(t, m) { this.show({ type: 'info', title: t, message: m }); }
};

// ====== State ======
let currentTeamId = null;
let currentTeam = null;
let selectedColor = '#7c3aed';
let editingTeamId = null;

// ====== DOM ======
const teamsGrid = document.getElementById('teamsGrid');
const emptyTeams = document.getElementById('emptyTeams');
const teamsListView = document.getElementById('teamsListView');
const teamDetailView = document.getElementById('teamDetailView');

// ====== Init ======
document.addEventListener('DOMContentLoaded', () => {
  loadTeams();
  setupEventListeners();
});

function setupEventListeners() {
  // Create team
  document.getElementById('newTeamBtn').addEventListener('click', () => openTeamModal());

  // Team modal
  document.getElementById('teamModalClose').addEventListener('click', closeTeamModal);
  document.getElementById('teamModalCancel').addEventListener('click', closeTeamModal);
  document.getElementById('teamModalSave').addEventListener('click', saveTeam);

  // Color picker
  document.querySelectorAll('.color-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-opt').forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = btn.dataset.color;
      selectedColor = btn.dataset.color;
    });
  });

  // Back to teams list
  document.getElementById('backToTeams').addEventListener('click', () => {
    teamDetailView.style.display = 'none';
    teamsListView.style.display = '';
    currentTeamId = null;
    loadTeams();
  });

  // Add member
  document.getElementById('addMemberBtn').addEventListener('click', addMember);
  document.getElementById('addMemberEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addMember();
  });

  // Edit team
  document.getElementById('editTeamBtn').addEventListener('click', () => {
    if (currentTeam) openTeamModal(currentTeam);
  });

  // Delete team
  document.getElementById('deleteTeamBtn').addEventListener('click', () => {
    if (currentTeam) showConfirm(
      'Eliminar equipo',
      `¿Estás seguro de que deseas eliminar el equipo "${currentTeam.team_name}"? Los documentos y carpetas no se eliminarán, solo se desasociarán del equipo.`,
      deleteTeam
    );
  });

  // Share content
  document.getElementById('shareContentBtn').addEventListener('click', openShareModal);
  document.getElementById('shareModalClose').addEventListener('click', closeShareModal);
  document.getElementById('shareModalCancel').addEventListener('click', closeShareModal);
  document.getElementById('shareModalSave').addEventListener('click', shareSelectedItems);

  // Share tabs
  document.getElementById('shareFoldersTab').addEventListener('click', () => {
    document.getElementById('shareFoldersTab').classList.add('is-active');
    document.getElementById('shareFoldersTab').style.background = '#f3f4f6';
    document.getElementById('shareDocsTab').classList.remove('is-active');
    document.getElementById('shareDocsTab').style.background = '#fff';
    loadShareItems('folders');
  });
  document.getElementById('shareDocsTab').addEventListener('click', () => {
    document.getElementById('shareDocsTab').classList.add('is-active');
    document.getElementById('shareDocsTab').style.background = '#f3f4f6';
    document.getElementById('shareFoldersTab').classList.remove('is-active');
    document.getElementById('shareFoldersTab').style.background = '#fff';
    loadShareItems('documents');
  });

  // Confirm modal
  document.getElementById('confirmClose').addEventListener('click', closeConfirm);
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
}

// ====== API Functions ======

async function loadTeams() {
  try {
    const res = await authFetch('/api/teams');
    const json = await res.json();

    if (json.ok && json.data) {
      renderTeams(json.data);
    }
  } catch (error) {
    console.error('Error loading teams:', error);
    ToastManager.error('Error', 'No se pudieron cargar los equipos');
  }
}

function renderTeams(teams) {
  teamsGrid.innerHTML = '';

  if (teams.length === 0) {
    emptyTeams.style.display = '';
    return;
  }

  emptyTeams.style.display = 'none';

  teams.forEach(team => {
    const card = document.createElement('div');
    card.className = 'team-card';
    card.dataset.teamId = team.team_id;

    const initials = (team.owner_first_name?.[0] || '') + (team.owner_last_name?.[0] || '');

    card.innerHTML = `
      <div class="team-card-header">
        <div class="team-color-dot" style="background:${team.team_color || '#7c3aed'}"></div>
        <h3>${escapeHtml(team.team_name)}</h3>
      </div>
      <div class="team-card-meta">
        ${team.team_description ? escapeHtml(team.team_description) : 'Sin descripción'}
      </div>
      <div class="team-members-row">
        <div class="member-avatar" style="background:${team.team_color || '#7c3aed'}; color:#fff;">${initials}</div>
        <span class="member-count">${team.member_count} miembro${team.member_count !== 1 ? 's' : ''}</span>
        <span class="member-role-badge ${team.my_role}" style="margin-left:auto;">${team.my_role}</span>
      </div>
    `;

    card.addEventListener('click', () => openTeamDetail(team.team_id));
    teamsGrid.appendChild(card);
  });
}

async function openTeamDetail(teamId) {
  try {
    const res = await authFetch(`/api/teams/${teamId}`);
    const json = await res.json();

    if (!json.ok) {
      ToastManager.error('Error', json.error || 'No se pudo cargar el equipo');
      return;
    }

    currentTeamId = teamId;
    currentTeam = json.data;

    // Show detail view
    teamsListView.style.display = 'none';
    teamDetailView.style.display = '';

    // Fill header
    document.getElementById('detailTeamName').textContent = currentTeam.team_name;
    document.getElementById('detailTeamColor').style.background = currentTeam.team_color || '#7c3aed';
    document.getElementById('detailTeamDesc').textContent = currentTeam.team_description || '';

    // Show/hide edit/delete buttons based on role
    const isOwnerOrAdmin = ['owner', 'admin'].includes(currentTeam.my_role);
    document.getElementById('editTeamBtn').style.display = isOwnerOrAdmin ? '' : 'none';
    document.getElementById('deleteTeamBtn').style.display = currentTeam.my_role === 'owner' ? '' : 'none';
    document.getElementById('addMemberBtn').parentElement.style.display = isOwnerOrAdmin ? '' : 'none';

    // Render members
    renderMembers(currentTeam.members);

    // Load team content
    loadTeamContent(teamId);

  } catch (error) {
    console.error('Error loading team:', error);
    ToastManager.error('Error', 'No se pudo cargar el equipo');
  }
}

function renderMembers(members) {
  const container = document.getElementById('membersList');
  container.innerHTML = '';

  const currentUser = getCurrentUser();
  const isOwnerOrAdmin = currentTeam && ['owner', 'admin'].includes(currentTeam.my_role);

  members.forEach(member => {
    const initials = (member.first_name?.[0] || '') + (member.last_name?.[0] || '');
    const row = document.createElement('div');
    row.className = 'member-row';

    const canRemove = isOwnerOrAdmin && member.role !== 'owner';

    row.innerHTML = `
      <div class="member-avatar" style="width:36px; height:36px; font-size:13px; background:${currentTeam.team_color || '#7c3aed'}; color:#fff;">${initials}</div>
      <div class="member-info">
        <div class="member-name">${escapeHtml(member.first_name)} ${escapeHtml(member.last_name)}</div>
        <div class="member-email">${escapeHtml(member.email)}</div>
      </div>
      <span class="member-role-badge ${member.role}">${member.role}</span>
      ${canRemove ? `
        <div class="member-actions">
          <button title="Remover del equipo" data-remove-user="${member.user_id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ` : ''}
    `;

    // Remove member event
    const removeBtn = row.querySelector('[data-remove-user]');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        showConfirm(
          'Remover miembro',
          `¿Deseas remover a ${member.first_name} ${member.last_name} del equipo?`,
          () => removeMember(member.user_id)
        );
      });
    }

    container.appendChild(row);
  });
}

async function loadTeamContent(teamId) {
  const foldersContainer = document.getElementById('teamFolders');
  const docsContainer = document.getElementById('teamDocuments');
  const emptyContent = document.getElementById('emptyTeamContent');

  foldersContainer.innerHTML = '';
  docsContainer.innerHTML = '';

  try {
    const [foldersRes, docsRes] = await Promise.all([
      authFetch(`/api/teams/${teamId}/folders`).then(r => r.json()),
      authFetch(`/api/teams/${teamId}/documents`).then(r => r.json())
    ]);

    const folders = foldersRes.ok ? foldersRes.data : [];
    const docs = docsRes.ok ? docsRes.data : [];

    if (folders.length === 0 && docs.length === 0) {
      emptyContent.style.display = '';
      return;
    }

    emptyContent.style.display = 'none';

    // Render folders
    folders.forEach(folder => {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; margin-bottom:8px; cursor:pointer;';
      el.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${currentTeam.team_color || '#7c3aed'}" stroke-width="2">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.8a2 2 0 0 1-1.7-.9l-.8-1.1A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
        </svg>
        <div style="flex:1;">
          <div style="font-size:14px; font-weight:600; color:#1f2937;">${escapeHtml(folder.name)}</div>
          <div style="font-size:12px; color:#9ca3af;">${folder.item_count} item${folder.item_count !== 1 ? 's' : ''} · ${folder.owner_name}</div>
        </div>
      `;
      el.addEventListener('click', () => {
        window.location.href = `/folder.html?id=${folder.id}&name=${encodeURIComponent(folder.name)}`;
      });
      foldersContainer.appendChild(el);
    });

    // Render docs
    docs.forEach(doc => {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; border:1px solid #e5e7eb; margin-bottom:8px; cursor:pointer;';
      const date = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      el.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <div style="flex:1;">
          <div style="font-size:14px; font-weight:600; color:#1f2937;">${escapeHtml(doc.title)}</div>
          <div style="font-size:12px; color:#9ca3af;">${doc.owner_name} · ${date}</div>
        </div>
      `;
      el.addEventListener('click', () => {
        window.location.href = `/tracking.html?id=${doc.document_id}&name=${encodeURIComponent(doc.title)}`;
      });
      docsContainer.appendChild(el);
    });

  } catch (error) {
    console.error('Error loading team content:', error);
  }
}

// ====== Team CRUD ======

function openTeamModal(team = null) {
  editingTeamId = team ? team.team_id : null;

  document.getElementById('teamModalTitle').textContent = team ? 'Editar equipo' : 'Crear nuevo equipo';
  document.getElementById('teamModalSave').textContent = team ? 'Guardar' : 'Crear';
  document.getElementById('teamNameInput').value = team ? team.team_name : '';
  document.getElementById('teamDescInput').value = team ? (team.team_description || '') : '';

  selectedColor = team ? (team.team_color || '#7c3aed') : '#7c3aed';
  document.querySelectorAll('.color-opt').forEach(b => {
    b.style.borderColor = b.dataset.color === selectedColor ? b.dataset.color : 'transparent';
  });

  document.getElementById('teamModal').style.display = 'flex';
}

function closeTeamModal() {
  document.getElementById('teamModal').style.display = 'none';
  editingTeamId = null;
}

async function saveTeam() {
  const name = document.getElementById('teamNameInput').value.trim();
  const desc = document.getElementById('teamDescInput').value.trim();

  if (!name) {
    ToastManager.error('Error', 'El nombre del equipo es requerido');
    return;
  }

  try {
    const url = editingTeamId ? `/api/teams/${editingTeamId}` : '/api/teams';
    const method = editingTeamId ? 'PUT' : 'POST';

    const res = await authFetch(url, {
      method,
      body: JSON.stringify({ team_name: name, team_description: desc, team_color: selectedColor })
    });

    const json = await res.json();

    if (json.ok) {
      ToastManager.success(editingTeamId ? 'Equipo actualizado' : 'Equipo creado', json.message);
      closeTeamModal();

      if (editingTeamId && currentTeamId) {
        openTeamDetail(currentTeamId);
      } else {
        loadTeams();
      }
    } else {
      ToastManager.error('Error', json.error || 'Error al guardar equipo');
    }
  } catch (error) {
    console.error('Error saving team:', error);
    ToastManager.error('Error', 'Error al guardar equipo');
  }
}

async function deleteTeam() {
  if (!currentTeamId) return;

  try {
    const res = await authFetch(`/api/teams/${currentTeamId}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.ok) {
      ToastManager.success('Equipo eliminado', json.message);
      closeConfirm();
      teamDetailView.style.display = 'none';
      teamsListView.style.display = '';
      currentTeamId = null;
      currentTeam = null;
      loadTeams();
    } else {
      ToastManager.error('Error', json.error);
    }
  } catch (error) {
    console.error('Error deleting team:', error);
    ToastManager.error('Error', 'Error al eliminar equipo');
  }
}

// ====== Members ======

async function addMember() {
  const emailInput = document.getElementById('addMemberEmail');
  const email = emailInput.value.trim();

  if (!email || !currentTeamId) return;

  try {
    const res = await authFetch(`/api/teams/${currentTeamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    const json = await res.json();

    if (json.ok) {
      ToastManager.success('Miembro agregado', json.message);
      emailInput.value = '';
      openTeamDetail(currentTeamId);
    } else {
      ToastManager.error('Error', json.error || 'No se pudo agregar al miembro');
    }
  } catch (error) {
    console.error('Error adding member:', error);
    ToastManager.error('Error', 'Error al agregar miembro');
  }
}

async function removeMember(userId) {
  if (!currentTeamId) return;

  try {
    const res = await authFetch(`/api/teams/${currentTeamId}/members/${userId}`, { method: 'DELETE' });
    const json = await res.json();

    if (json.ok) {
      ToastManager.success('Miembro removido', json.message);
      closeConfirm();
      openTeamDetail(currentTeamId);
    } else {
      ToastManager.error('Error', json.error);
    }
  } catch (error) {
    console.error('Error removing member:', error);
    ToastManager.error('Error', 'Error al remover miembro');
  }
}

// ====== Share Content ======

let shareMode = 'folders'; // 'folders' or 'documents'

async function openShareModal() {
  document.getElementById('shareModal').style.display = 'flex';
  shareMode = 'folders';
  document.getElementById('shareFoldersTab').classList.add('is-active');
  document.getElementById('shareFoldersTab').style.background = '#f3f4f6';
  document.getElementById('shareDocsTab').classList.remove('is-active');
  document.getElementById('shareDocsTab').style.background = '#fff';
  await loadShareItems('folders');
}

function closeShareModal() {
  document.getElementById('shareModal').style.display = 'none';
}

async function loadShareItems(type) {
  shareMode = type;
  const container = document.getElementById('shareItemsList');
  container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:20px;">Cargando...</p>';

  try {
    const user = getCurrentUser();
    if (!user) return;

    let items = [];

    if (type === 'folders') {
      const res = await authFetch(`/api/folders?user_id=${user.user_id}&level=0`);
      const json = await res.json();
      if (json.ok) items = json.data.filter(f => !f.team_id); // Only unshared folders
    } else {
      const res = await authFetch(`/api/documents?user_id=${user.user_id}&status=active`);
      const json = await res.json();
      if (json.success) items = json.data.filter(d => !d.team_id); // Only unshared docs
    }

    if (items.length === 0) {
      container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:20px;">No hay items disponibles para compartir.</p>';
      return;
    }

    container.innerHTML = '';
    items.forEach(item => {
      const id = type === 'folders' ? item.id : (item.document_id || item.id);
      const name = type === 'folders' ? item.name : item.title;

      const row = document.createElement('label');
      row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; cursor:pointer;';
      row.innerHTML = `
        <input type="checkbox" value="${id}" style="width:18px; height:18px; accent-color:#7c3aed;" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
          ${type === 'folders'
            ? '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.8a2 2 0 0 1-1.7-.9l-.8-1.1A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>'
            : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'}
        </svg>
        <span style="font-size:14px; color:#1f2937;">${escapeHtml(name)}</span>
      `;
      row.addEventListener('mouseenter', () => row.style.background = '#f9fafb');
      row.addEventListener('mouseleave', () => row.style.background = '');
      container.appendChild(row);
    });

  } catch (error) {
    console.error('Error loading share items:', error);
    container.innerHTML = '<p style="text-align:center; color:#dc2626; padding:20px;">Error al cargar items.</p>';
  }
}

async function shareSelectedItems() {
  const checkboxes = document.querySelectorAll('#shareItemsList input[type="checkbox"]:checked');
  if (checkboxes.length === 0) {
    ToastManager.error('Error', 'Selecciona al menos un item para compartir');
    return;
  }

  const endpoint = shareMode === 'folders' ? 'share-folder' : 'share-document';
  const idKey = shareMode === 'folders' ? 'folder_id' : 'document_id';

  let successCount = 0;
  let errorCount = 0;

  for (const cb of checkboxes) {
    try {
      const res = await authFetch(`/api/teams/${currentTeamId}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ [idKey]: parseInt(cb.value) })
      });
      const json = await res.json();
      if (json.ok) successCount++;
      else errorCount++;
    } catch {
      errorCount++;
    }
  }

  closeShareModal();

  if (successCount > 0) {
    ToastManager.success('Compartido', `${successCount} ${shareMode === 'folders' ? 'carpeta(s)' : 'documento(s)'} compartido(s) con el equipo`);
    loadTeamContent(currentTeamId);
  }
  if (errorCount > 0) {
    ToastManager.error('Error', `${errorCount} item(s) no se pudieron compartir`);
  }
}

// ====== Confirm Modal ======

let confirmCallback = null;

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').style.display = 'flex';
  confirmCallback = callback;

  document.getElementById('confirmOk').onclick = () => {
    if (confirmCallback) confirmCallback();
  };
}

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
  confirmCallback = null;
}

// ====== Helpers ======

function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch { return null; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
