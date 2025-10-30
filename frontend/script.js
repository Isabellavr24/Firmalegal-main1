/*********************************************************
 * Firmalegal — script.js (Index con carpetas dinámicas)
 **********************************************************/

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

// ====== Config ======
const USE_API = true;

// ====== Helper: Obtener usuario actual desde localStorage ======
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

// ====== DOM ======
const grid = document.getElementById('grid');
const searchInput = document.getElementById('searchInput');
const tabs = document.querySelectorAll('.tab');
const toggles = document.querySelectorAll('.toggle-btn');

let currentFilter = '*';
let currentSearch = '';

// ====== Utils ======
function slugify(s){
  return String(s || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Función helper para contar items en una carpeta
function countFolderItems(folderId) {
  try {
    const LS_KEY = 'firmalegal_store';
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const store = JSON.parse(raw);

      // Normalizar folderId para comparación (puede venir como string o número)
      const normalizedId = String(folderId);

      // Buscar subcarpetas que tengan como padre esta carpeta
      // Soportar tanto 'parentId' (camelCase) como 'parent_id' (snake_case)
      const subfolders = store.folders?.filter(f => {
        const parentId = f.parentId || f.parent_id;
        return parentId && String(parentId) === normalizedId;
      }).length || 0;

      // Buscar documentos que pertenezcan a esta carpeta
      // Soportar tanto 'folderId' como 'folder_id'
      const docs = store.docs?.filter(d => {
        const docFolderId = d.folderId || d.folder_id;
        return docFolderId && String(docFolderId) === normalizedId;
      }).length || 0;

      console.log(`📊 Conteo carpeta ${folderId}: ${subfolders} subcarpetas + ${docs} documentos = ${subfolders + docs} items`);
      return subfolders + docs;
    }
  } catch (e) {
    console.warn('Error al contar items:', e);
  }
  return 0;
}

// Crea una card de carpeta con HREF directo a folder.html (relativo al index)
function folderCardTemplate({ id, name, item_count = 0, tag = 'mine' }){
  const folderId = id || slugify(name);

  // Construye URL relativa al documento actual (index.html)
  const url = new URL('folder.html', window.location.href);
  url.searchParams.set('id', folderId);
  url.searchParams.set('name', name);

  // ✅ SIEMPRE contar del Store local porque las subcarpetas pueden estar solo en localStorage
  // El API solo sabe de carpetas principales, no de las subcarpetas creadas localmente
  let realItemCount = countFolderItems(folderId);

  // Si no hay nada en localStorage, usar el conteo del API como fallback
  if (realItemCount === 0 && item_count > 0) {
    realItemCount = item_count;
    console.log(`📂 Carpeta "${name}" (${folderId}): usando conteo del API = ${item_count} items`);
  }

  const article = document.createElement('article');
  article.className = 'card folder';
  article.dataset.type = 'folder';
  article.dataset.tags = tag;
  article.dataset.folderId = folderId;

  article.innerHTML = `
    <a class="card-link" href="${url.href}">
      <div class="folder-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.8a2 2 0 0 1-1.7-.9l-.8-1.1A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
        </svg>
      </div>
      <div class="meta">
        <h3 class="title">${name}</h3>
        <p class="sub">${realItemCount} ítem${realItemCount !== 1 ? 's' : ''}</p>
      </div>
    </a>
  `;
  return article;
}

function clearRenderedFolders(){
  grid?.querySelectorAll('.card.folder').forEach(el => el.remove());
}

function insertFolderCard(cardEl){
  const firstDoc = grid?.querySelector('.card.doc');
  if (firstDoc) grid.insertBefore(cardEl, firstDoc);
  else grid?.prepend(cardEl);
}

// ====== Data (demo y API) ======
function demoFolders(){
  return [
    { id:'pki-services', name:'Pki Services', item_count:12, tag:'mine' },
    { id:'yakitori', name:'Proyecto Yakitori', item_count: 8, tag:'shared' }
  ].filter(f => {
    const t = (f.name || '').toLowerCase();
    const okSearch = currentSearch ? t.includes(currentSearch.toLowerCase()) : true;
    const okFilter = currentFilter === '*' ? true : (f.tag || '').includes(currentFilter);
    return okSearch && okFilter;
  });
}

async function fetchFoldersAPI(){
  if (!USE_API) return demoFolders();

  const user = getCurrentUser();
  if (!user) {
    console.error('❌ Usuario no autenticado, redirigiendo a login...');
    window.location.href = '/login.html';
    return [];
  }

  const qs = new URLSearchParams();
  qs.set('user_id', user.user_id);
  qs.set('level', '0');
  if (currentFilter !== '*') qs.set('filter', currentFilter);
  if (currentSearch.trim()) qs.set('search', currentSearch.trim());

  const url = `/api/folders?${qs.toString()}`;
  console.log(`📡 [API] Solicitando carpetas: ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        'Accept':'application/json',
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.error(`❌ [API] Error HTTP ${res.status}`);
      throw new Error('HTTP '+res.status);
    }

    const json = await res.json();
    console.log('✅ [API] Respuesta recibida:', json);

    if (json?.ok && Array.isArray(json.data)) {
      console.log(`📂 [API] ${json.data.length} carpetas cargadas`);
      return json.data;
    }

    throw new Error('Formato inesperado');
  } catch (e) {
    console.warn('⚠️ [index] API falló, usando datos demo:', e?.message || e);
    return demoFolders();
  }
}

async function loadFolders(){
  if (!grid) { console.warn('[index] No existe #grid'); return; }

  const folders = await fetchFoldersAPI();
  clearRenderedFolders();
  folders.forEach(f => insertFolderCard(folderCardTemplate(f)));
  showEmptyStateIfNeeded();
}

// ====== Mensaje de Estado Vacío ======
function showEmptyStateIfNeeded() {
  const hasContent = grid.querySelector('.card.folder') || grid.querySelector('.card.doc');
  const existingEmpty = grid.querySelector('.empty-state');
  if (existingEmpty) existingEmpty.remove();

  if (!hasContent) {
    console.log('📭 [index] No hay contenido, mostrando mensaje vacío');

    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    
    if (currentFilter === 'archived') {
      emptyState.innerHTML = `
        <div class="empty-state-content">
          <svg class="empty-state-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="21 8 21 21 3 21 3 8"/>
            <rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
          <h2 class="empty-state-title">No hay documentos archivados</h2>
          <p class="empty-state-description">
            Los documentos que archives aparecerán aquí.
          </p>
        </div>
      `;
    } else if (currentFilter === 'shared') {
      emptyState.innerHTML = `
        <div class="empty-state-content">
          <svg class="empty-state-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <h2 class="empty-state-title">No hay documentos compartidos contigo</h2>
          <p class="empty-state-description">
            Cuando alguien comparta documentos contigo, aparecerán aquí.
          </p>
        </div>
      `;
    } else if (currentFilter === 'mine') {
      emptyState.innerHTML = `
        <div class="empty-state-content">
          <svg class="empty-state-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.8a2 2 0 0 1-1.7-.9l-.8-1.1A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
            <circle cx="12" cy="13" r="2" stroke-dasharray="2 2" opacity="0.5"/>
          </svg>
          <h2 class="empty-state-title">No tienes plantillas aún</h2>
          <p class="empty-state-description">
            Crea tu primera carpeta para organizar tus plantillas.
          </p>
          <button class="empty-state-btn" onclick="openNewFolderModal()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Crear Primera Carpeta
          </button>
        </div>
      `;
    } else {
      emptyState.innerHTML = `
        <div class="empty-state-content">
          <svg class="empty-state-icon" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.8a2 2 0 0 1-1.7-.9l-.8-1.1A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
            <circle cx="12" cy="13" r="2" stroke-dasharray="2 2" opacity="0.5"/>
          </svg>
          <h2 class="empty-state-title">No hay carpetas aún</h2>
          <p class="empty-state-description">
            Comienza creando tu primera carpeta para organizar tus documentos y plantillas.
          </p>
          <button class="empty-state-btn" onclick="openNewFolderModal()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Crear Primera Carpeta
          </button>
        </div>
      `;
    }
    
    grid.appendChild(emptyState);
  } else {
    console.log('✅ [index] Hay contenido visible');
  }
}

// ====== Search ======
function filterDocsLocally(){
  const docs = Array.from(grid?.querySelectorAll('.card.doc') || []);
  const term = (searchInput?.value || '').toLowerCase();
  docs.forEach(c => {
    const text = c.innerText.toLowerCase();
    c.style.display = text.includes(term) ? '' : 'none';
  });
}

searchInput?.addEventListener('input', () => {
  currentSearch = searchInput.value || '';
  filterDocsLocally();
  loadFolders();
});

// ====== Tabs ======
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('is-active'));
  t.classList.add('is-active');
  currentFilter = t.dataset.filter || '*';
  loadFolders();
}));

// ====== View toggle ======
toggles.forEach(btn => btn.addEventListener('click', () => {
  toggles.forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  const view = btn.dataset.view;
  grid?.classList.toggle('list-view', view === 'list');
}));

// ====== Modal CREAR plantilla ======
(function(){
  const openBtn = document.getElementById('newTemplateBtn');
  const modal = document.getElementById('createTemplateModal');
  const closeBtn = document.getElementById('ct-close');
  const segBtns = modal?.querySelectorAll('.segmented-btn');
  const uploadTab = document.getElementById('ct-tab-upload');
  const driveTab = document.getElementById('ct-tab-gdrive');
  const nameInput = document.getElementById('ct-name');
  const fileInput = document.getElementById('ct-file');
  const fileText = document.getElementById('ct-file-text');
  const driveInput = document.getElementById('ct-gdrive');
  const createBtn = document.getElementById('ct-create');
  const newFolder = document.getElementById('ct-new-folder');

  if(!modal) return;

  function open(){ modal.style.display='flex'; modal.setAttribute('aria-hidden','false'); nameInput?.focus(); refresh(); }
  function close(){ modal.style.display='none'; modal.setAttribute('aria-hidden','true'); }

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', (e)=>{ if(e.target === modal) close(); });
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });

  segBtns?.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      segBtns.forEach(b=>b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const tab = btn.dataset.tab;
      uploadTab?.classList.toggle('is-visible', tab==='upload');
      driveTab?.classList.toggle('is-visible', tab==='gdrive');
      refresh();
    });
  });

  fileInput?.addEventListener('change', ()=>{
    if(fileInput.files?.length){
      fileText.textContent = fileInput.files.length === 1 ? fileInput.files[0].name : `${fileInput.files.length} archivos seleccionados`;
    } else { fileText.textContent = 'Selecciona un archivo…'; }
    refresh();
  });

  [nameInput, driveInput].forEach(el=> el?.addEventListener('input', refresh));

  function usingDrive(){ return driveTab?.classList.contains('is-visible'); }
  function hasSource(){ return usingDrive() ? !!(driveInput?.value || '').trim() : !!fileInput?.files?.length; }
  function refresh(){ createBtn.disabled = !((nameInput?.value || '').trim() && hasSource()); }

  newFolder?.addEventListener('click', ()=> { openNewFolderModal(); });

  createBtn?.addEventListener('click', async ()=>{
    const documentName = nameInput.value.trim();
    const isUpload = !usingDrive();

    if (!documentName) {
      ToastManager.warning('Campo requerido', 'Por favor ingresa un nombre para el documento');
      return;
    }

    createBtn.disabled = true;
    const orig = createBtn.textContent;
    createBtn.textContent = 'Procesando…';

    try {
      if (isUpload && fileInput?.files?.length > 0) {
        const file = fileInput.files[0];

        if (file.type !== 'application/pdf') {
          ToastManager.warning('Archivo no válido', 'Solo se permiten archivos PDF para firmar');
          createBtn.textContent = orig;
          createBtn.disabled = false;
          return;
        }

        console.log('📄 Preparando PDF para firma:', file.name);

        const reader = new FileReader();
        reader.onload = function(e) {
          const base64PDF = e.target.result;

          sessionStorage.setItem('pendingDocument', JSON.stringify({
            name: documentName,
            fileName: file.name,
            fileData: base64PDF,
            fileType: file.type
          }));

          console.log('✅ PDF guardado en sessionStorage, redirigiendo a sign.html...');
          window.location.href = './sign.html';
        };

        reader.onerror = function() {
          ToastManager.error('Error al leer archivo', 'No se pudo procesar el archivo PDF');
          createBtn.textContent = orig;
          createBtn.disabled = false;
        };

        reader.readAsDataURL(file);
      } else {
        ToastManager.info('Próximamente', 'La integración con Google Drive estará disponible próximamente');
        createBtn.textContent = orig;
        createBtn.disabled = false;
      }
    } catch (error) {
      console.error('❌ Error:', error);
      ToastManager.error('Error al procesar documento', error.message);
      createBtn.textContent = orig;
      createBtn.disabled = false;
    }
  });
})();

// ====== Logout ======
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#logoutBtn');
  if (!btn) return;
  try { await window.permissions?.logout?.(); } catch {}
  try {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('current_user');
    localStorage.removeItem('token');
  } catch {}
  location.href = '/login.html';
});

// ====== Init ======
document.addEventListener('DOMContentLoaded', async () => {
  await loadFolders();
});

// ====== BOTÓN SUBIR ======
const uploadBtn = document.getElementById('uploadBtn');
const uploadPicker = document.getElementById('uploadPicker');

if (uploadPicker) {
  uploadPicker.removeAttribute('multiple');
  uploadPicker.setAttribute('accept', '.pdf,application/pdf');
}

uploadBtn?.addEventListener('click', () => uploadPicker?.click());

uploadPicker?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const user = getCurrentUser();
  if (!user) {
    ToastManager.warning('Sesión requerida', 'Debes iniciar sesión para subir documentos');
    e.target.value = '';
    return;
  }

  const file = files[0];

  if (file.type !== 'application/pdf') {
    ToastManager.warning('Archivo no válido', 'Solo se permiten archivos PDF para firmar');
    e.target.value = '';
    return;
  }

  console.log('📄 Modo Exprés: Preparando PDF para firma inmediata:', file.name);

  try {
    const reader = new FileReader();
    reader.onload = function(event) {
      const base64PDF = event.target.result;

      sessionStorage.setItem('pendingDocument', JSON.stringify({
        name: file.name.replace('.pdf', ''),
        fileName: file.name,
        fileData: base64PDF,
        fileType: file.type
      }));

      console.log('✅ PDF guardado en sessionStorage, redirigiendo a sign.html...');
      window.location.href = './sign.html';
    };

    reader.onerror = function() {
      ToastManager.error('Error al leer archivo', 'No se pudo procesar el archivo PDF');
      e.target.value = '';
    };

    reader.readAsDataURL(file);

  } catch (err) {
    console.error('❌ Error:', err);
    ToastManager.error('Error al procesar documento', err?.message || 'Error desconocido');
    e.target.value = '';
  }
});

// ====== MODAL DE NUEVA CARPETA ======
let allUserFolders = [];

function openNewFolderModal() {
  const modal = document.getElementById('newFolderModal');
  if (!modal) return;

  document.getElementById('nf-name').value = '';
  document.getElementById('nf-description').value = '';

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('nf-name').focus();
}

function closeNewFolderModal() {
  const modal = document.getElementById('newFolderModal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('newFolderModal');
  const closeBtn = document.getElementById('nf-close');
  const cancelBtn = document.getElementById('nf-cancel');
  const form = document.getElementById('newFolderForm');

  closeBtn?.addEventListener('click', closeNewFolderModal);
  cancelBtn?.addEventListener('click', closeNewFolderModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeNewFolderModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.style.display === 'flex') {
      closeNewFolderModal();
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = getCurrentUser();
    if (!user) {
      ToastManager.warning('Sesión requerida', 'Debes iniciar sesión');
      return;
    }

    const folderName = document.getElementById('nf-name').value.trim();
    const description = document.getElementById('nf-description').value.trim();

    if (!folderName) {
      ToastManager.warning('Campo requerido', 'Debes ingresar un nombre para la carpeta');
      return;
    }

    console.log('📁 Creando carpeta:', { folderName, description });

    const createBtn = document.getElementById('nf-create');
    const originalHTML = createBtn.innerHTML;
    createBtn.disabled = true;
    createBtn.textContent = 'Creando...';

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_name: folderName,
          user_id: user.user_id,
          tag: 'mine',
          folder_description: description,
          folder_color: '#2b0e31'
        })
      });

      const json = await res.json();

      if (json.ok) {
        console.log('✅ Carpeta creada:', json.data);

        await loadFolders();
        await loadFoldersIntoSelect();
        closeNewFolderModal();

        const levelName = json.data?.level_name || 'Carpeta';
        ToastManager.success('Carpeta creada', `${levelName} "${folderName}" creada exitosamente`);
      } else {
        throw new Error(json.error || 'Error desconocido');
      }
    } catch (error) {
      console.error('❌ Error al crear carpeta:', error);
      ToastManager.error('Error al crear carpeta', error.message);
    } finally {
      createBtn.disabled = false;
      createBtn.innerHTML = originalHTML;
    }
  });
});

// ====== CUSTOM SELECT DROPDOWN ======
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

  console.log('📂 Cargando carpetas en selector...');

  try {
    const folders = await fetchFoldersAPI();
    allUserFolders = folders;

    dropdown.innerHTML = `
      <div class="custom-select-option selected" data-value="">
        <span class="option-icon">📁</span>
        <span class="option-text">Sin carpeta</span>
      </div>
    `;

    folders.forEach(folder => {
      // SIEMPRE contar del localStorage porque puede haber subcarpetas locales
      let itemCount = countFolderItems(folder.id);

      // Si no hay nada en localStorage, usar el conteo del API
      if (itemCount === 0 && folder.item_count > 0) {
        itemCount = folder.item_count;
      }

      const option = document.createElement('div');
      option.className = 'custom-select-option';
      option.dataset.value = folder.id;
      option.innerHTML = `
        <span class="option-icon">📁</span>
        <span class="option-text">${folder.name} <span style="color: var(--ink-soft, #6d6270); font-weight: 400;">(${itemCount} ítem${itemCount !== 1 ? 's' : ''})</span></span>
      `;
      dropdown.appendChild(option);
    });

    console.log(`✅ ${folders.length} carpetas cargadas en selector`);
  } catch (error) {
    console.error('❌ Error al cargar carpetas en selector:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCustomSelect();
});

document.getElementById('newTemplateBtn')?.addEventListener('click', () => {
  setTimeout(() => loadFoldersIntoSelect(), 100);
});

// === Delegación sobre el contenedor de tarjetas ===
const docGrid = document.getElementById('docsGrid') || document.getElementById('grid');

docGrid?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.icon-btn[data-action]');
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  try {
    if (action === 'open') {
      console.log('Abrir doc', id);
    }

    if (action === 'rename') {
      const card = btn.closest('.card.doc');
      const h3 = card.querySelector('.title');
      const nuevo = prompt('Nuevo nombre del documento:', h3.textContent.trim());
      if (nuevo && nuevo.trim()) {
        h3.textContent = nuevo.trim();
        ToastManager.success('Documento renombrado', 'El nombre se actualizó correctamente');
      }
    }

    if (action === 'duplicate') {
      console.log('Duplicar doc', id);
      const card = btn.closest('.card.doc');
      const clone = card.cloneNode(true);
      clone.dataset.id = id + '-copy';
      docGrid.prepend(clone);
      ToastManager.success('Documento duplicado', 'Se creó una copia del documento');
    }

    if (action === 'archive') {
      if (!confirm('¿Archivar este documento?')) return;
      btn.closest('.card.doc').remove();
      ToastManager.info('Documento archivado', 'El documento se movió a archivados');
    }
  } catch (err) {
    console.error(err);
    ToastManager.error('Error en la acción', err.message || 'Ocurrió un error inesperado');
  }
});

docGrid?.addEventListener('click', (e) => {
  if (e.target.closest('.doc-actions')) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);