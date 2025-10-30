// ====== SISTEMA DE TOASTS ======
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
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
      error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
      info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type]}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Cerrar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    this.container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.remove(toast);
    });

    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }

    return toast;
  },

  remove(toast) {
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  },

  success(title, message, duration) {
    return this.show({ type: 'success', title, message, duration });
  },

  error(title, message, duration) {
    return this.show({ type: 'error', title, message, duration });
  },

  warning(title, message, duration) {
    return this.show({ type: 'warning', title, message, duration });
  },

  info(title, message, duration) {
    return this.show({ type: 'info', title, message, duration });
  }
};

// -------------------------
// Utilidades de formato
// -------------------------
const fmtDate = (d = new Date()) => {
  try {
    const f = new Date(d);
    const fecha = f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }).replace('.', '');
    const hora  = f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${fecha} ${hora}`;
  } catch {
    return '';
  }
};

// -------------------------
// Store PERSISTENTE (localStorage)
// -------------------------
const LS_KEY = 'firmalegal_store';

const Store = {
  _load() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const seed = {
        folders: [],
        docs: []
      };
      localStorage.setItem(LS_KEY, JSON.stringify(seed));
      return seed;
    }
    try { 
      return JSON.parse(raw); 
    } catch { 
      return { folders: [], docs: [] }; 
    }
  },
  
  _save(db) { 
    localStorage.setItem(LS_KEY, JSON.stringify(db)); 
    console.log('💾 Datos guardados en localStorage');
  },

  all() { 
    return this._load(); 
  },

  byParent(parentId) {
    const db = this._load();
    const folders = db.folders.filter(f => (f.parentId || '') === (parentId || ''));
    const docs    = db.docs.filter(d => (d.folderId || '') === (parentId || ''));
    return { folders, docs };
  },

  addFolder({ name, parentId }) {
    const db = this._load();
    const id = `f_${crypto.randomUUID?.() || (Date.now()+Math.random()).toString(36)}`;
    const folder = {
      id,
      name,
      parentId: parentId || '',
      createdAt: Date.now()
    };
    db.folders.push(folder);
    this._save(db);
    console.log('✅ Carpeta agregada al Store:', name, 'Parent:', parentId || '(raíz)', 'Datos:', folder);
    return id;
  },

  addDoc({ title, folderId }) {
    const db = this._load();
    const id = `d_${crypto.randomUUID?.() || (Date.now()+Math.random()).toString(36)}`;
    db.docs.push({ 
      id, 
      title, 
      owner: 'PKI SERVICES', 
      date: Date.now(), 
      folderId: folderId || '' 
    });
    this._save(db);
    console.log('✅ Documento agregado:', title);
    return id;
  },

  updateDoc(id, updates) {
    const db = this._load();
    const doc = db.docs.find(d => d.id === id);
    if (doc) {
      Object.assign(doc, updates);
      this._save(db);
      console.log('✅ Documento actualizado:', id);
      return true;
    }
    return false;
  },

  deleteDoc(id) {
    const db = this._load();
    const idx = db.docs.findIndex(d => d.id === id);
    if (idx >= 0) {
      db.docs.splice(idx, 1);
      this._save(db);
      console.log('✅ Documento eliminado:', id);
      return true;
    }
    return false;
  }
};

// -------------------------
// DOM refs
// -------------------------
const grid = document.getElementById('docsGrid');
const tplDoc = document.getElementById('doc-card-template');

const uploadBtn   = document.getElementById('uploadBtn');
const uploadPick  = document.getElementById('uploadPicker');
const createBtn   = document.getElementById('createBtn');

const modalCreate = document.getElementById('createTemplateModal');
const ctClose     = document.getElementById('ct-close');
const ctName      = document.getElementById('ct-name');
const ctFile      = document.getElementById('ct-file');
const ctFileText  = document.getElementById('ct-file-text');
const ctDrive     = document.getElementById('ct-gdrive');
const ctCreate    = document.getElementById('ct-create');
const segBtns     = modalCreate ? modalCreate.querySelectorAll('.segmented-btn') : null;
const tabUpload   = document.getElementById('ct-tab-upload');
const tabDrive    = document.getElementById('ct-tab-gdrive');

const newFolderModal = document.getElementById('newFolderModal');
const nfClose   = document.getElementById('nf-close');
const nfCancel  = document.getElementById('nf-cancel');
const nfForm    = document.getElementById('newFolderForm');
const nfName    = document.getElementById('nf-name');

const btnNewSub = document.getElementById('ct-new-folder');

// -------------------------
// Carpeta actual (desde URL)
// -------------------------
const params = new URLSearchParams(location.search);
const currentFolderId   = params.get('id') || '';
const currentFolderName = params.get('name') ? decodeURIComponent(params.get('name')) : 'Carpeta';

const titleEl = document.getElementById('folderTitle');
if (titleEl) titleEl.textContent = currentFolderName;
const cfEl = document.getElementById('ct-current-folder-name');
if (cfEl) cfEl.textContent = currentFolderName;

// -------------------------
// Render
// -------------------------
function clearGrid() {
  if (!grid) return;
  grid.innerHTML = '';
}

function renderEmpty() {
  if (!grid) return;
  grid.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-content">
        <div class="empty-state-icon">
          <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="7" height="7" rx="2"></rect>
            <rect x="14" y="3" width="7" height="7" rx="2"></rect>
            <rect x="14" y="14" width="7" height="7" rx="2"></rect>
            <rect x="3" y="14" width="7" height="7" rx="2"></rect>
          </svg>
        </div>
        <h2 class="empty-state-title">Esta carpeta está vacía</h2>
        <p class="empty-state-description">Sube documentos o crea una subcarpeta para empezar.</p>
        <button class="empty-state-btn" id="emptyCreateBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Crear documento
        </button>
      </div>
    </div>
  `;
  document.getElementById('emptyCreateBtn')?.addEventListener('click', openCreateModal);
}

function folderCard({ id, name, count }) {
  const art = document.createElement('article');
  art.className = 'card folder';
  art.innerHTML = `
    <a class="card-link" href="./folder.html?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}">
      <div class="folder-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.8a2 2 0 0 1-1.7-.9l-.8-1.1A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
        </svg>
      </div>
      <div class="meta">
        <h3 class="title">${name}</h3>
        <p class="sub">${count ?? 0} elementos</p>
      </div>
    </a>
  `;
  return art;
}

function docCard({ id, title, owner, date }) {
  if (!tplDoc) {
    console.error('Template #doc-card-template no encontrado');
    return document.createElement('div');
  }
  
  const node = tplDoc.content.firstElementChild.cloneNode(true);
  node.dataset.id = id;
  node.querySelector('.title').textContent = title;
  node.querySelector('.owner').textContent = owner || 'PKI SERVICES';
  node.querySelector('.date').textContent  = fmtDate(date);

  node.querySelectorAll('[data-action]').forEach(btn => {
    btn.dataset.id = id;
  });

  return node;
}

function render() {
  clearGrid();
  const { folders, docs } = Store.byParent(currentFolderId);

  console.log(`📂 Renderizando carpeta "${currentFolderName}":`, {
    folders: folders.length,
    docs: docs.length
  });

  if (!folders.length && !docs.length) {
    renderEmpty();
    return;
  }

  folders.forEach(f => {
    // Contar tanto subcarpetas como documentos dentro de esta carpeta
    const { folders: subfolders, docs: childs } = Store.byParent(f.id);
    const totalCount = (subfolders?.length || 0) + (childs?.length || 0);
    grid.appendChild(folderCard({ id: f.id, name: f.name, count: totalCount }));
  });

  docs.forEach(d => grid.appendChild(docCard(d)));
}

// -------------------------
// Subir / Crear / Modales
// -------------------------
function openCreateModal() {
  if (!modalCreate) return;
  modalCreate.style.display = 'flex';
  modalCreate.setAttribute('aria-hidden', 'false');
  ctName.value = '';
  ctFile.value = '';
  ctFileText.textContent = 'Selecciona un archivo…';
  ctDrive.value = '';
  refreshCreateBtn();
  setTab('upload');
}

function closeCreateModal() {
  if (!modalCreate) return;
  modalCreate.style.display = 'none';
  modalCreate.setAttribute('aria-hidden', 'true');
}

function setTab(which) {
  segBtns?.forEach(b => b.classList.toggle('is-active', b.dataset.tab === which));
  tabUpload?.classList.toggle('is-visible', which === 'upload');
  tabDrive?.classList.toggle('is-visible', which === 'gdrive');
  refreshCreateBtn();
}

function usingDrive() {
  return tabDrive?.classList.contains('is-visible');
}

function hasSource() {
  if (usingDrive()) return (ctDrive.value || '').trim().length > 0;
  return !!(ctFile.files && ctFile.files.length);
}

function refreshCreateBtn() {
  const hasName = (ctName.value || '').trim().length > 0;
  ctCreate.disabled = !(hasName && hasSource());
}

createBtn?.addEventListener('click', openCreateModal);
ctClose?.addEventListener('click', closeCreateModal);
modalCreate?.addEventListener('click', (e) => { if (e.target === modalCreate) closeCreateModal(); });
segBtns?.forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
ctFile?.addEventListener('change', () => {
  ctFileText.textContent = ctFile.files?.length
    ? (ctFile.files.length === 1 ? ctFile.files[0].name : `${ctFile.files.length} archivos`)
    : 'Selecciona un archivo…';
  refreshCreateBtn();
});
[ctName, ctDrive].forEach(el => el?.addEventListener('input', refreshCreateBtn));

ctCreate?.addEventListener('click', () => {
  const title = ctName.value.trim();
  if (!title) {
    ToastManager.warning('Campo requerido', 'Por favor ingresa un nombre para el documento');
    return;
  }
  Store.addDoc({ title, folderId: currentFolderId });
  closeCreateModal();
  render();
  ToastManager.success('Documento creado', `"${title}" se agregó a la carpeta`);
});

uploadBtn?.addEventListener('click', () => uploadPick?.click());
uploadPick?.addEventListener('change', () => {
  const files = Array.from(uploadPick.files || []);
  let added = 0;
  files.forEach(f => {
    const base = f.name.replace(/\.[^.]+$/, '');
    Store.addDoc({ title: base, folderId: currentFolderId });
    added++;
  });
  uploadPick.value = '';
  render();
  if (added > 0) {
    ToastManager.success('Documentos subidos', `Se agregaron ${added} documento${added > 1 ? 's' : ''}`);
  }
});

btnNewSub?.addEventListener('click', () => {
  openNewFolderModal();
});

// -------------------------
// Modal nueva carpeta
// -------------------------
function openNewFolderModal() {
  if (!newFolderModal) return;
  newFolderModal.style.display = 'flex';
  newFolderModal.setAttribute('aria-hidden', 'false');
  nfName.value = '';
  setTimeout(() => nfName.focus(), 0);
}

function closeNewFolderModal() {
  if (!newFolderModal) return;
  newFolderModal.style.display = 'none';
  newFolderModal.setAttribute('aria-hidden', 'true');
}

nfClose?.addEventListener('click', closeNewFolderModal);
nfCancel?.addEventListener('click', closeNewFolderModal);
newFolderModal?.addEventListener('click', (e) => { if (e.target === newFolderModal) closeNewFolderModal(); });

nfForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nfName.value.trim();
  if (!name) {
    ToastManager.warning('Campo requerido', 'Debes ingresar un nombre para la carpeta');
    return;
  }
  Store.addFolder({ name, parentId: currentFolderId });
  closeNewFolderModal();
  render();
  ToastManager.success('Subcarpeta creada', `"${name}" se creó exitosamente`);
});

// -------------------------
// EVENT DELEGATION: Acciones de documentos
// -------------------------
grid?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const db = Store.all();
  const doc = db.docs.find(d => d.id === id);
  
  if (!doc) {
    console.warn('⚠️ Documento no encontrado:', id);
    return;
  }
  
  try {
    switch(action) {
      case 'move':
        ToastManager.info('Próximamente', 'Esta funcionalidad abrirá un modal para seleccionar la carpeta destino');
        break;
        
      case 'edit':
        const newName = prompt('Nuevo nombre del documento:', doc.title);
        if (newName && newName.trim()) {
          Store.updateDoc(id, { title: newName.trim() });
          render();
          ToastManager.success('Documento renombrado', 'El nombre se actualizó correctamente');
        }
        break;
        
      case 'clone':
        Store.addDoc({ 
          title: `${doc.title} (copia)`, 
          folderId: currentFolderId 
        });
        render();
        ToastManager.success('Documento duplicado', 'Se creó una copia del documento');
        break;
        
      case 'archive':
        if (confirm(`¿Archivar el documento "${doc.title}"?`)) {
          Store.deleteDoc(id);
          render();
          ToastManager.info('Documento archivado', 'El documento se movió a archivados');
        }
        break;
    }
  } catch (err) {
    console.error('❌ Error en acción:', err);
    ToastManager.error('Error en la acción', err.message || 'Ocurrió un error inesperado');
  }
});

grid?.addEventListener('click', (e) => {
  if (e.target.closest('.doc-actions')) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// -------------------------
// Permisos + UX header
// -------------------------
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (window.permissions) {
      if (!window.permissions.canAccessConfig?.()) {
        const link = document.getElementById('configLink');
        if (link) link.style.display = 'none';
      }
      window.permissions.updateAllAvatars?.();
    }
    document.addEventListener('click', (e) => {
      const dd = document.getElementById('userMenu');
      if (dd && !dd.contains(e.target)) dd.removeAttribute('open');
    });
  } catch {}
  
  render();
});

console.log('📁 Folder.js iniciado - Carpeta:', currentFolderName);