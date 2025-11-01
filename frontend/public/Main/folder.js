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
// Helper: Obtener usuario actual
// -------------------------
function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (!userStr) {
      console.warn('⚠️ No hay usuario en localStorage');
      return null;
    }
    const user = JSON.parse(userStr);
    console.log('👤 Usuario actual:', user.first_name, user.last_name, `(ID: ${user.user_id})`);
    return user;
  } catch (error) {
    console.error('❌ Error al obtener usuario:', error);
    return null;
  }
}

// -------------------------
// API Store (Backend MySQL)
// -------------------------
const Store = {
  async byParent(parentId) {
    const user = getCurrentUser();
    if (!user) {
      console.error('❌ No hay usuario autenticado');
      return { folders: [], docs: [] };
    }

    try {
      // Construir URLs para carpetas y documentos
      const foldersUrl = parentId
        ? `/api/folders?parent_id=${parentId}&user_id=${user.user_id}`
        : `/api/folders?parent_id=null&user_id=${user.user_id}`;

      const docsUrl = parentId
        ? `/api/documents?folder_id=${parentId}&user_id=${user.user_id}`
        : `/api/documents?folder_id=null&user_id=${user.user_id}`;

      console.log('📡 Consultando en paralelo:', { foldersUrl, docsUrl });

      // ✅ EJECUTAR AMBAS PETICIONES EN PARALELO (más rápido)
      const [foldersRes, docsRes] = await Promise.all([
        fetch(foldersUrl),
        fetch(docsUrl)
      ]);

      // Parsear respuestas en paralelo también
      const [foldersData, docsData] = await Promise.all([
        foldersRes.json(),
        docsRes.json()
      ]);

      const folders = foldersData.success ? foldersData.data.map(f => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id,
        count: f.item_count || 0
      })) : [];

      const docs = docsData.success ? docsData.data.map(d => ({
        id: d.id,
        title: d.title,
        owner: d.owner_name || 'PKI SERVICES',
        date: d.created_at,
        folderId: d.folder_id
      })) : [];

      console.log(`✅ Carpeta ${parentId || 'raíz'}: ${folders.length} subcarpetas, ${docs.length} documentos`);
      return { folders, docs };

    } catch (error) {
      console.error('❌ Error al cargar datos:', error);
      ToastManager.error('Error', 'No se pudieron cargar las carpetas');
      return { folders: [], docs: [] };
    }
  },

  async addFolder({ name, parentId }) {
    const user = getCurrentUser();
    if (!user) {
      console.error('❌ No hay usuario autenticado');
      return null;
    }

    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_name: name,
          parent_id: parentId || null,
          user_id: user.user_id
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Carpeta creada:', data.data);
        return data.data.folder_id;
      } else {
        throw new Error(data.error || 'Error al crear carpeta');
      }
    } catch (error) {
      console.error('❌ Error al crear carpeta:', error);
      ToastManager.error('Error', error.message);
      return null;
    }
  },

  async addDoc({ title, folderId, file }) {
    const user = getCurrentUser();
    if (!user) {
      console.error('❌ No hay usuario autenticado');
      ToastManager.error('Error', 'Debes iniciar sesión');
      return null;
    }

    if (!file) {
      console.error('❌ No se proporcionó archivo');
      ToastManager.error('Error', 'Debes seleccionar un archivo');
      return null;
    }

    try {
      console.log('📤 Subiendo documento:', { title, folderId, fileName: file.name });

      const formData = new FormData();
      formData.append('files', file); // Importante: campo 'files' (plural)

      if (title) {
        formData.append('titles', JSON.stringify([title])); // Array de títulos
      }

      if (folderId) {
        formData.append('folder_id', folderId);
      }

      formData.append('user_id', user.user_id);

      // IMPORTANTE: Agregar user_id en query params para que el middleware de auth lo detecte
      const response = await fetch(`/api/documents/upload?user_id=${user.user_id}`, {
        method: 'POST',
        body: formData
        // NO poner Content-Type, FormData lo maneja automáticamente
      });

      const data = await response.json();

      if (data.success && data.data && data.data.length > 0) {
        console.log('✅ Documento subido correctamente:', data.data[0]);
        return data.data[0].document_id;
      } else {
        throw new Error(data.error || 'Error al subir documento');
      }
    } catch (error) {
      console.error('❌ Error al subir documento:', error);
      ToastManager.error('Error al subir', error.message);
      return null;
    }
  },

  async updateDoc(id, updates) {
    const user = getCurrentUser();
    if (!user) return false;

    try {
      const response = await fetch(`/api/documents/${id}?user_id=${user.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Documento actualizado:', id);
        return true;
      } else {
        throw new Error(data.error || 'Error al actualizar documento');
      }
    } catch (error) {
      console.error('❌ Error al actualizar documento:', error);
      return false;
    }
  },

  async deleteDoc(id) {
    const user = getCurrentUser();
    if (!user) return false;

    try {
      const response = await fetch(`/api/documents/${id}?user_id=${user.user_id}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Documento eliminado:', id);
        return true;
      } else {
        throw new Error(data.error || 'Error al eliminar documento');
      }
    } catch (error) {
      console.error('❌ Error al eliminar documento:', error);
      return false;
    }
  },

  async moveDoc(docId, targetFolderId) {
    const user = getCurrentUser();
    if (!user) return false;

    try {
      const response = await fetch(`/api/documents/${docId}?user_id=${user.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: targetFolderId })
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Documento movido a carpeta:', targetFolderId);
        return true;
      } else {
        throw new Error(data.error || 'Error al mover documento');
      }
    } catch (error) {
      console.error('❌ Error al mover documento:', error);
      return false;
    }
  },

  async duplicateDoc(docId) {
    const user = getCurrentUser();
    if (!user) return false;

    try {
      const response = await fetch(`/api/documents/${docId}/duplicate?user_id=${user.user_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Documento duplicado:', data.data);
        return data.data;
      } else {
        throw new Error(data.error || 'Error al duplicar documento');
      }
    } catch (error) {
      console.error('❌ Error al duplicar documento:', error);
      return false;
    }
  },

  async getAllFolders() {
    const user = getCurrentUser();
    if (!user) return [];

    try {
      const response = await fetch(`/api/folders?user_id=${user.user_id}`);
      const data = await response.json();

      if (data.success) {
        return data.data.map(f => ({
          id: f.id,
          name: f.name,
          item_count: f.item_count || 0
        }));
      }
      return [];
    } catch (error) {
      console.error('❌ Error al obtener carpetas:', error);
      return [];
    }
  }
};

// -------------------------
// DOM refs
// -------------------------
const foldersContainer = document.getElementById('foldersContainer');
const foldersGrid = document.getElementById('foldersGrid');
const docsContainer = document.getElementById('docsContainer');
const docsGrid = document.getElementById('docsGrid');
const emptyGrid = document.getElementById('emptyGrid');
const tplDoc = document.getElementById('doc-card-template');

console.log('🔍 [INIT] Elementos DOM encontrados:', {
  docsGrid: !!docsGrid,
  docsGridId: docsGrid?.id,
  tplDoc: !!tplDoc
});

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
const currentFolderId   = parseInt(params.get('id')) || null; // ✅ Convertir a número
const currentFolderName = params.get('name') ? decodeURIComponent(params.get('name')) : 'Carpeta';

const titleEl = document.getElementById('folderTitle');
if (titleEl) titleEl.textContent = currentFolderName;
const cfEl = document.getElementById('ct-current-folder-name');
if (cfEl) cfEl.textContent = currentFolderName;

// -------------------------
// Render
// -------------------------
function clearAll() {
  if (foldersGrid) foldersGrid.innerHTML = '';
  if (docsGrid) docsGrid.innerHTML = '';
  if (foldersContainer) foldersContainer.style.display = 'none';
  if (docsContainer) docsContainer.style.display = 'none';
  if (emptyGrid) emptyGrid.style.display = 'none';
}

function renderEmpty() {
  clearAll();
  if (!emptyGrid) return;
  emptyGrid.style.display = 'block';
  emptyGrid.innerHTML = `
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

  // Asignar data-id a los botones de acción
  const actionButtons = node.querySelectorAll('[data-action]');
  console.log(`🔧 [docCard] Configurando ${actionButtons.length} botones para documento ID:${id}`);

  actionButtons.forEach(btn => {
    btn.dataset.id = id;
    console.log(`  ✓ Botón [${btn.dataset.action}] configurado con data-id="${btn.dataset.id}"`);
  });

  return node;
}

function showLoading() {
  clearAll();

  // Crear overlay de carga centrado en el viewport
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'loading-overlay';
  loadingOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.95);
    z-index: 9999;
  `;

  loadingOverlay.innerHTML = `
    <div style="text-align: center;">
      <div style="width: 48px; height: 48px; border: 4px solid #f3f3f3; border-top: 4px solid #c41e56; border-radius: 50%; animation: spin 0.6s linear infinite; margin: 0 auto;"></div>
      <p style="margin-top: 16px; color: #666; font-size: 15px; font-weight: 500;">Cargando carpetas...</p>
    </div>
  `;

  document.body.appendChild(loadingOverlay);

  // Agregar animación si no existe
  if (!document.getElementById('spinner-style')) {
    const style = document.createElement('style');
    style.id = 'spinner-style';
    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.remove();
  }
}

async function render() {
  showLoading();

  const { folders, docs } = await Store.byParent(currentFolderId);

  hideLoading();
  clearAll();

  console.log(`📂 Renderizando carpeta "${currentFolderName}":`, {
    folders: folders.length,
    docs: docs.length
  });

  if (!folders.length && !docs.length) {
    renderEmpty();
    return;
  }

  // Renderizar carpetas
  if (folders.length > 0) {
    foldersContainer.style.display = 'block';
    folders.forEach(f => {
      foldersGrid.appendChild(folderCard({ id: f.id, name: f.name, count: f.count }));
    });
  }

  // Renderizar documentos
  if (docs.length > 0) {
    docsContainer.style.display = 'block';
    docs.forEach(d => {
      docsGrid.appendChild(docCard(d));
    });
  }
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
  
  // Cargar carpetas en el selector
  loadFoldersIntoSelect();
  
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

ctCreate?.addEventListener('click', async () => {
  const title = ctName.value.trim();

  if (!title) {
    ToastManager.warning('Campo requerido', 'Por favor ingresa un nombre para el documento');
    return;
  }

  // Verificar que haya archivo seleccionado
  const file = ctFile.files && ctFile.files[0];

  if (!file) {
    ToastManager.warning('Archivo requerido', 'Por favor selecciona un archivo');
    return;
  }

  if (file.type !== 'application/pdf') {
    ToastManager.warning('Archivo no válido', 'Solo se permiten archivos PDF');
    return;
  }

  // Obtener carpeta seleccionada del selector (puede ser diferente a la carpeta actual)
  const selectedFolderId = document.getElementById('ct-folder-select')?.value || currentFolderId;
  
  console.log('📤 Creando documento:', { 
    title, 
    fileName: file.name, 
    selectedFolder: selectedFolderId,
    currentFolder: currentFolderId 
  });

  // Deshabilitar botón mientras sube
  ctCreate.disabled = true;
  ctCreate.textContent = 'Subiendo...';

  // Usar Store.addDoc() con la carpeta seleccionada
  const docId = await Store.addDoc({
    title,
    folderId: selectedFolderId || null, // null si se eligió "Sin carpeta"
    file: file
  });

  // Rehabilitar botón
  ctCreate.disabled = false;
  ctCreate.textContent = 'Crear';

  if (docId) {
    closeCreateModal();
    
    // SIEMPRE recargar la vista para actualizar contadores de subcarpetas
    await render();
    
    // Mensaje personalizado según dónde se subió
    if (selectedFolderId == currentFolderId) {
      ToastManager.success('Documento creado', `"${title}" se agregó a esta carpeta`);
    } else {
      const targetFolder = selectedFolderId ? 
        'subcarpeta seleccionada' : 
        'página principal';
      ToastManager.success('Documento creado', `"${title}" se guardó en ${targetFolder}`);
    }
    
    // Limpiar formulario
    ctName.value = '';
    ctFile.value = '';
    ctFileText.textContent = 'Selecciona un archivo…';
    document.getElementById('ct-folder-select').value = currentFolderId;
    document.getElementById('ct-folder-value').textContent = `Esta carpeta (${currentFolderName})`;
  }
  // El error ya lo muestra Store.addDoc()
});

uploadBtn?.addEventListener('click', () => uploadPick?.click());
uploadPick?.addEventListener('change', async () => {
  const files = Array.from(uploadPick.files || []);

  if (files.length === 0) return;

  console.log(`📤 Subiendo ${files.length} archivo(s)...`);

  let added = 0;
  let failed = 0;

  for (const file of files) {
    // Usar el nombre del archivo sin extensión como título
    const title = file.name.replace(/\.[^.]+$/, '');

    const docId = await Store.addDoc({
      title,
      folderId: currentFolderId,
      file: file
    });

    if (docId) {
      added++;
    } else {
      failed++;
    }
  }

  uploadPick.value = ''; // Limpiar input
  await render(); // Recargar vista

  if (added > 0) {
    ToastManager.success('Documentos subidos', `Se agregaron ${added} documento${added > 1 ? 's' : ''}`);
  }

  if (failed > 0) {
    ToastManager.error('Error', `${failed} documento${failed > 1 ? 's' : ''} no se pudo${failed > 1 ? 'ieron' : ''} subir`);
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

nfForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = nfName.value.trim();
  if (!name) {
    ToastManager.warning('Campo requerido', 'Debes ingresar un nombre para la carpeta');
    return;
  }
  const folderId = await Store.addFolder({ name, parentId: currentFolderId });
  if (folderId) {
    closeNewFolderModal();
    await render();
    ToastManager.success('Subcarpeta creada', `"${name}" se creó exitosamente`);
  }
});

// -------------------------
// Modales Personalizados: Edit Name & Confirm
// -------------------------
function showEditNameModal(currentName) {
  console.log('🎯 showEditNameModal llamada con:', currentName);
  return new Promise((resolve) => {
    const modal = document.getElementById('editNameModal');
    const input = document.getElementById('en-input');
    const saveBtn = document.getElementById('en-save');
    const cancelBtn = document.getElementById('en-cancel');
    const closeBtn = document.getElementById('en-close');

    console.log('🔍 Elementos del modal encontrados:', { modal: !!modal, input: !!input, saveBtn: !!saveBtn });

    if (!modal) {
      console.error('❌ Modal de editar nombre no encontrado en el DOM');
      resolve(null);
      return;
    }

    input.value = currentName;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    console.log('✅ Modal de editar nombre desplegado');
    setTimeout(() => input.focus(), 100);

    const close = () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      console.log('🔒 Modal de editar nombre cerrado');
    };

    const handleSave = () => {
      const newName = input.value.trim();
      console.log('💾 Guardando nuevo nombre:', newName);
      close();
      resolve(newName || null);
    };

    const handleCancel = () => {
      console.log('❌ Edición cancelada');
      close();
      resolve(null);
    };

    saveBtn.onclick = handleSave;
    cancelBtn.onclick = handleCancel;
    closeBtn.onclick = handleCancel;

    input.onkeydown = (e) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') handleCancel();
    };
  });
}

function showConfirmModal(title, message) {
  console.log('🎯 showConfirmModal llamada con:', { title, message });
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    const closeBtn = document.getElementById('confirm-close');

    console.log('🔍 Elementos del modal encontrados:', { modal: !!modal, titleEl: !!titleEl, okBtn: !!okBtn });

    if (!modal) {
      console.error('❌ Modal de confirmación no encontrado en el DOM');
      resolve(false);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    console.log('✅ Modal de confirmación desplegado');

    const close = () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      console.log('🔒 Modal de confirmación cerrado');
    };

    const handleOk = () => {
      console.log('✅ Usuario confirmó la acción');
      close();
      resolve(true);
    };

    const handleCancel = () => {
      console.log('❌ Usuario canceló la acción');
      close();
      resolve(false);
    };

    okBtn.onclick = handleOk;
    cancelBtn.onclick = handleCancel;
    closeBtn.onclick = handleCancel;
  });
}

// -------------------------
// Modal: Mover documento
// -------------------------
let currentDocToMove = null;

async function openMoveDocumentModal(docId, docTitle) {
  console.log('🎯 openMoveDocumentModal llamada con:', { docId, docTitle });
  currentDocToMove = docId;

  const modal = document.getElementById('moveDocModal');
  const docNameEl = document.getElementById('md-doc-name');
  const dropdown = document.querySelector('#md-folder-select .select-dropdown');

  console.log('🔍 Elementos del modal encontrados:', { modal: !!modal, docNameEl: !!docNameEl, dropdown: !!dropdown });

  if (!modal || !dropdown) {
    console.error('❌ Modal de mover o dropdown no encontrados en el DOM');
    return;
  }

  // Mostrar nombre del documento
  docNameEl.textContent = `Moviendo: "${docTitle}"`;

  // Cargar todas las carpetas
  console.log('📂 Cargando carpetas disponibles...');
  const folders = await Store.getAllFolders();
  console.log('✅ Carpetas cargadas:', folders.length);

  // Limpiar y llenar dropdown
  dropdown.innerHTML = '';

  if (folders.length === 0) {
    dropdown.innerHTML = '<div style="padding: 12px; color: var(--ink-soft); text-align: center;">No hay carpetas disponibles</div>';
    console.log('⚠️ No hay carpetas disponibles');
  } else {
    folders.forEach(folder => {
      const option = document.createElement('div');
      option.className = 'custom-select-option';
      option.dataset.value = folder.id;
      option.innerHTML = `
        <span class="option-icon">📁</span>
        <span class="option-text">${folder.name} <span style="color: var(--ink-soft); font-weight: 400;">(${folder.item_count} ítem${folder.item_count !== 1 ? 's' : ''})</span></span>
      `;
      dropdown.appendChild(option);
    });
    console.log('✅ Dropdown llenado con', folders.length, 'carpetas');
  }

  // Mostrar modal
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  console.log('✅ Modal de mover desplegado correctamente');
}

function closeMoveDocumentModal() {
  const modal = document.getElementById('moveDocModal');
  if (!modal) return;

  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  currentDocToMove = null;
}

// Event listeners para el modal de mover
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('moveDocModal');
  const closeBtn = document.getElementById('md-close');
  const cancelBtn = document.getElementById('md-cancel');
  const moveBtn = document.getElementById('md-move');
  const selectTrigger = document.querySelector('#md-folder-select .select-trigger');
  const dropdown = document.querySelector('#md-folder-select .select-dropdown');

  // Cerrar modal
  closeBtn?.addEventListener('click', closeMoveDocumentModal);
  cancelBtn?.addEventListener('click', closeMoveDocumentModal);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeMoveDocumentModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.style.display === 'flex') {
      closeMoveDocumentModal();
    }
  });

  // Toggle dropdown
  selectTrigger?.addEventListener('click', () => {
    const isOpen = dropdown?.classList.toggle('is-open');
    if (isOpen) {
      selectTrigger.classList.add('is-open');
    } else {
      selectTrigger.classList.remove('is-open');
    }
  });

  // Seleccionar carpeta
  dropdown?.addEventListener('click', (e) => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;

    const text = option.querySelector('.option-text')?.textContent || 'Carpeta seleccionada';
    const selectText = document.querySelector('#md-folder-select .select-text');
    if (selectText) selectText.textContent = text;

    dropdown.classList.remove('is-open');
    selectTrigger?.classList.remove('is-open');
    selectTrigger?.classList.add('has-value');
    moveBtn.dataset.targetFolder = option.dataset.value;
  });

  // Ejecutar movimiento
  moveBtn?.addEventListener('click', async () => {
    const targetFolderId = moveBtn.dataset.targetFolder;

    if (!targetFolderId) {
      ToastManager.warning('Selección requerida', 'Debes seleccionar una carpeta destino');
      return;
    }

    if (!currentDocToMove) return;

    moveBtn.disabled = true;
    moveBtn.textContent = 'Moviendo...';

    try {
      const success = await Store.moveDoc(currentDocToMove, targetFolderId);

      if (success) {
        ToastManager.success('Documento movido', 'El documento se movió correctamente');
        closeMoveDocumentModal();
        await render();
      } else {
        ToastManager.error('Error', 'No se pudo mover el documento');
      }
    } catch (error) {
      console.error('❌ Error al mover:', error);
      ToastManager.error('Error', 'Ocurrió un error al mover el documento');
    } finally {
      moveBtn.disabled = false;
      moveBtn.textContent = 'Mover';
      delete moveBtn.dataset.targetFolder;
    }
  });
});

// -------------------------
// EVENT DELEGATION: Acciones de documentos
// -------------------------
if (docsGrid) {
  console.log('✅ [INIT] Event listener de acciones de documentos registrado en docsGrid');
  docsGrid.addEventListener('click', async (e) => {
    console.log('🖱️ Click detectado en docsGrid:', e.target);
    console.log('   Target className:', e.target.className);
    console.log('   Target tagName:', e.target.tagName);

  // PRIMERO: Verificar si se hizo clic en un botón de acción (prioridad)
  const btn = e.target.closest('[data-action]');

  if (btn) {
    console.log('✅ Botón de acción detectado');
    e.preventDefault();
    e.stopPropagation();

    const id = btn.dataset.id;
    const action = btn.dataset.action;

    console.log('🔘 Botón clickeado:', { action, id });

    // Obtener datos actuales
    const { docs } = await Store.byParent(currentFolderId);
    const doc = docs.find(d => d.id == id);

    if (!doc) {
      console.warn('⚠️ Documento no encontrado:', id);
      return;
    }

    console.log('📄 Documento encontrado:', doc);

    try {
      switch(action) {
        case 'move':
          console.log('📂 Abriendo modal de mover...');
          await openMoveDocumentModal(id, doc.title);
          console.log('✅ Modal de mover desplegado correctamente');
          break;

        case 'edit':
          console.log('✏️ Abriendo modal de editar nombre...');
          const newName = await showEditNameModal(doc.title);
          console.log('✅ Modal de editar nombre cerrado. Nuevo nombre:', newName);
          if (newName && newName !== doc.title) {
            await Store.updateDoc(id, { title: newName });
            await render();
            ToastManager.success('Documento renombrado', 'El nombre se actualizó correctamente');
          } else {
            console.log('ℹ️ No se realizó cambio de nombre');
          }
          break;

        case 'clone':
          console.log('📋 Duplicando documento...');
          const duplicated = await Store.duplicateDoc(id);
          if (duplicated) {
            console.log('✅ Documento duplicado correctamente:', duplicated);
            await render();
            ToastManager.success('Documento duplicado', 'Se creó una copia del documento');
          } else {
            console.error('❌ Error al duplicar documento');
            ToastManager.error('Error', 'No se pudo duplicar el documento');
          }
          break;

        case 'archive':
          console.log('🗄️ Abriendo modal de confirmación...');
          const confirmed = await showConfirmModal(
            'Archivar documento',
            `¿Estás seguro de que deseas archivar "${doc.title}"? Esta acción moverá el documento a archivados.`
          );
          console.log('✅ Modal de confirmación cerrado. Confirmado:', confirmed);
          if (confirmed) {
            // ✅ CORREGIDO: Cambiar status a 'archived' en lugar de eliminar
            const success = await Store.updateDoc(id, { status: 'archived' });
            if (success) {
              await render();
              ToastManager.info('Documento archivado', 'El documento se movió a archivados');
            } else {
              ToastManager.error('Error', 'No se pudo archivar el documento');
            }
          } else {
            console.log('ℹ️ Archivo cancelado por el usuario');
          }
          break;

        default:
          console.warn('⚠️ Acción desconocida:', action);
      }
    } catch (err) {
      console.error('❌ Error en acción:', err);
      ToastManager.error('Error en la acción', err.message || 'Ocurrió un error inesperado');
    }
    return; // Salir para no procesar el click del documento
  } else {
    console.log('ℹ️ No se detectó botón de acción, verificando click en documento...');
  }

  // SEGUNDO: Verificar si se hizo clic en el enlace del documento (para abrir en tracking.html)
  const docLink = e.target.closest('[data-open-doc]');
  if (docLink) {
    e.preventDefault();
    const card = docLink.closest('.card.doc');
    const docId = card?.dataset?.id;

    if (docId) {
      console.log('📄 Abriendo documento en tracking:', docId);
      // ✅ CORREGIDO: Redirigir a tracking.html en vez de sign.html
      const docTitle = card.querySelector('.title')?.textContent || 'Documento';
      window.location.href = `/tracking.html?id=${docId}&name=${encodeURIComponent(docTitle)}`;
    }
    return;
  }
  });
} else {
  console.error('❌ [INIT] docsGrid no encontrado - no se pueden registrar event listeners');
}

// -------------------------
// Custom Select para carpetas
// -------------------------
function initCustomSelect() {
  const trigger = document.getElementById('ct-folder-trigger');
  const dropdown = document.getElementById('ct-folder-dropdown');
  const valueEl = document.getElementById('ct-folder-value');
  const hiddenInput = document.getElementById('ct-folder-select');

  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = dropdown.classList.contains('active');

    document.querySelectorAll('.custom-select-dropdown').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.custom-select-trigger').forEach(t => t.classList.remove('active'));

    if (!isActive) {
      dropdown.classList.add('active');
      trigger.classList.add('active');
    }
  });

  dropdown.addEventListener('click', (e) => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;

    const value = option.dataset.value;
    const text = option.querySelector('.option-text').textContent;

    valueEl.textContent = text;
    hiddenInput.value = value;

    dropdown.querySelectorAll('.custom-select-option').forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');

    dropdown.classList.remove('active');
    trigger.classList.remove('active');
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('active');
    trigger.classList.remove('active');
  });
}

async function loadFoldersIntoSelect() {
  const dropdown = document.getElementById('ct-folder-dropdown');
  if (!dropdown) return;

  const user = getCurrentUser();
  if (!user) return;

  console.log('📂 Cargando carpetas en selector para carpeta:', currentFolderName, `(ID: ${currentFolderId})`);

  try {
    // Cargar todas las carpetas del usuario
    const response = await fetch(`/api/folders?user_id=${user.user_id}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Error al cargar carpetas');
    }

    const allFolders = data.data || [];

    console.log('🔍 [FRONTEND] Todas las carpetas recibidas del backend:', allFolders.length);
    allFolders.forEach((folder, i) => {
      console.log(`   ${i + 1}. ID:${folder.id} "${folder.name}" - parent_id:${folder.parent_id} - level:${folder.level}`);
    });
    
    console.log('🔍 [FRONTEND] currentFolderId:', currentFolderId, 'tipo:', typeof currentFolderId);

    // Filtrar solo las SUBCARPETAS de la carpeta actual (hijas directas)
    const subfolders = allFolders.filter(folder => {
      const match = folder.parent_id == currentFolderId;
      console.log(`  🔍 [FILTRO] Carpeta "${folder.name}": parent_id=${folder.parent_id} (${typeof folder.parent_id}) == currentFolderId=${currentFolderId} (${typeof currentFolderId}) → ${match ? '✅ MATCH' : '❌ NO'}`);
      return match;
    });

    console.log(`📁 [RESULTADO] Carpeta actual: "${currentFolderName}" (ID: ${currentFolderId})`);
    console.log(`📂 [RESULTADO] Subcarpetas encontradas: ${subfolders.length}`, subfolders.map(f => f.name));

    // Opción predeterminada: "Esta carpeta" (carpeta actual)
    dropdown.innerHTML = `
      <div class="custom-select-option selected" data-value="${currentFolderId}">
        <span class="option-icon">📁</span>
        <span class="option-text">Esta carpeta (${currentFolderName})</span>
      </div>
    `;

    // Agregar SOLO las subcarpetas directas de la carpeta actual
    subfolders.forEach(folder => {
      const option = document.createElement('div');
      option.className = 'custom-select-option';
      option.dataset.value = folder.id;
      
      option.innerHTML = `
        <span class="option-icon">📁</span>
        <span class="option-text">${folder.name}</span>
      `;
      dropdown.appendChild(option);
    });

    // Agregar opción "Sin carpeta" (index) al final
    const indexOption = document.createElement('div');
    indexOption.className = 'custom-select-option';
    indexOption.dataset.value = '';
    indexOption.innerHTML = `
      <span class="option-icon">�</span>
      <span class="option-text">Sin carpeta (Página principal)</span>
    `;
    dropdown.appendChild(indexOption);

    console.log(`✅ Selector cargado: 1 carpeta actual + ${subfolders.length} subcarpetas + 1 opción index`);
  } catch (error) {
    console.error('❌ Error al cargar carpetas en selector:', error);
  }
}

// -------------------------
// Permisos + UX header
// -------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar custom select
  initCustomSelect();
  
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