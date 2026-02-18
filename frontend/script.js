/*********************************************************
 * Firmalegal — script.js (Index con carpetas dinámicas)
 **********************************************************/

// SVG icon helper
const _ico = (d, size) => `<svg style="width:${size||18}px;height:${size||18}px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  folder: _ico('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  warning: _ico('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  error: _ico('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
};

// ====== HELPER DE AUTENTICACIÓN ======
/**
 * Fetch con autenticación automática (incluye cookie JWT)
 * Si auth-helper.js ya está cargado, usa esa función
 * Si no, define una versión local
 */
if (typeof authFetch === 'undefined') {
  function authFetch(url, options = {}) {
    // Si el body es FormData, NO establecer Content-Type (el navegador lo hace automáticamente con el boundary correcto)
    const isFormData = options.body instanceof FormData;

    const headers = isFormData
      ? { ...options.headers } // No agregar Content-Type para FormData
      : {
          'Content-Type': 'application/json',
          ...options.headers
        };

    return fetch(url, {
      ...options,
      credentials: 'include',  // ⚠️ CRÍTICO: Envía la cookie JWT
      headers
    });
  }
}

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

// ====== Helper: Obtener folder_id actual desde URL ======
function getCurrentFolderId() {
  // Si estamos en folder.html, buscar en URL
  if (window.location.pathname.includes('folder.html')) {
    const params = new URLSearchParams(window.location.search);
    const folderId = params.get('id');
    return folderId ? parseInt(folderId) : null;
  }
  // Si estamos en index.html, no hay folder_id
  return null;
}

// ====== DOM ======
const foldersContainer = document.getElementById('foldersContainer');
const foldersGrid = document.getElementById('foldersGrid');
const docsContainer = document.getElementById('docsContainer');
const grid = document.getElementById('grid');
const emptyGrid = document.getElementById('emptyGrid');
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
function folderCardTemplate({ id, name, item_count = 0, tag = 'mine', owner_name = null }){
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
      <div class="meta" style="display:flex;flex-direction:column;gap:4px;">
        <h3 class="title" style="margin:0;">${name}</h3>
        <p class="sub" style="margin:0;">${realItemCount} ítem${realItemCount !== 1 ? 's' : ''}</p>
        ${owner_name ? `<p class="sub" style="margin:0;color:var(--text-secondary,#888);font-size:0.85em;">${owner_name}</p>` : ''}
      </div>
    </a>
  `;
  return article;
}

/**
 * Crear tarjeta de documento usando el template
 * Asigna automáticamente los data-id a todos los botones de acción
 */
function createDocCard({ id, title, owner, date, folderName = null, documentType = 'normal' }) {
  const template = document.getElementById('doc-card-template');
  
  if (!template) {
    console.error('❌ Template #doc-card-template no encontrado');
    // Fallback: crear tarjeta simple sin botones
    const article = document.createElement('article');
    article.className = 'card doc';
    article.dataset.id = id;
    article.innerHTML = `
      <a class="card-link" href="/tracking.html?id=${id}&name=${encodeURIComponent(title || 'Documento')}&folder=${encodeURIComponent(folderName || 'Mis Plantillas')}">
        <h3 class="title">${title || 'Sin título'}</h3>
        <div class="meta">
          <p class="owner">${owner || 'PKI SERVICES'}</p>
          <p class="date">${date || ''}</p>
        </div>
      </a>
    `;
    return article;
  }

  // Clonar el template
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.id = id;

  // Llenar información del documento
  const titleEl = node.querySelector('.title');
  const ownerEl = node.querySelector('.owner');
  const dateEl = node.querySelector('.date');
  const linkEl = node.querySelector('.card-link');

  if (titleEl) titleEl.textContent = title || 'Sin título';
  if (ownerEl) ownerEl.textContent = owner || 'PKI SERVICES';
  if (dateEl) dateEl.textContent = date || '';
  
  // ✅ NO poner href aquí, solo agregar data-doc-id para identificarlo
  if (linkEl) {
    linkEl.removeAttribute('href'); // Quitar href para evitar redirección automática
    linkEl.style.cursor = 'pointer'; // Mantener cursor pointer
    linkEl.dataset.docId = id; // Guardar ID para usarlo después
    linkEl.dataset.docTitle = title || 'Documento'; // ✅ Guardar título también
    linkEl.dataset.folderName = folderName || 'Mis Plantillas'; // ✅ Guardar nombre de carpeta
    linkEl.dataset.documentType = documentType || 'normal'; // ✅ Guardar tipo de documento
  }

  // ✅ CRÍTICO: Asignar data-id a TODOS los botones de acción
  const actionButtons = node.querySelectorAll('[data-action]');
  console.log(`🔧 [createDocCard] Configurando ${actionButtons.length} botones para documento ID:${id}`);

  actionButtons.forEach(btn => {
    btn.dataset.id = id;
    console.log(`  ✓ Botón [${btn.dataset.action}] configurado con data-id="${btn.dataset.id}"`);
  });

  return node;
}

function clearRenderedFolders(){
  foldersGrid?.querySelectorAll('.card.folder').forEach(el => el.remove());
}

function insertFolderCard(cardEl){
  // Ya no insertamos en el grid principal, usamos foldersGrid
  foldersGrid?.appendChild(cardEl);
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
    const res = await authFetch(url, {
      headers: {
        'Accept':'application/json'
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
  clearRenderedFolders();

  // Limpiar grid de documentos también
  if (grid) grid.innerHTML = '';
  if (docsContainer) docsContainer.style.display = 'none';

  // ✅ Cargar documentos según el filtro actual
  if (currentFilter === 'archived') {
    console.log('📦 [index] Cargando documentos archivados...');
    foldersContainer.style.display = 'none';
    await loadArchivedDocuments();
  } else if (currentFilter === 'shared') {
    // "Compartidas conmigo": solo usar vault (no fetchFoldersAPI para evitar duplicados)
    console.log('🔗 [index] Cargando documentos compartidos via equipos...');
    foldersContainer.style.display = 'none';
    await loadSharedDocuments();
  } else {
    // "Todas" o "Mis Plantillas": carpetas del API general
    const folders = await fetchFoldersAPI();
    if (folders.length > 0) {
      foldersContainer.style.display = 'block';
      folders.forEach(f => {
        const card = folderCardTemplate(f);
        foldersGrid.appendChild(card);
      });
    } else {
      foldersContainer.style.display = 'none';
    }
    console.log(`📄 [index] Cargando documentos activos del index (filtro: ${currentFilter})...`);
    await loadActiveDocuments();
  }

  showEmptyStateIfNeeded();
}

// ✅ Nueva función para cargar documentos ACTIVOS del index (sin carpeta)
async function loadActiveDocuments() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    // Documentos sin carpeta (folder_id=NULL o vacío) y status='active'
    const url = `/api/documents?user_id=${user.user_id}&status=active`;
    console.log(`� [API] Solicitando documentos activos: ${url}`);

    const res = await authFetch(url);
    const json = await res.json();

    if (json.success && json.data && json.data.length > 0) {
      // ✅ FILTRAR solo documentos del index (sin carpeta)
      let indexDocs = json.data.filter(doc => !doc.folder_id || doc.folder_id === null);

      // ✅ "Mis Plantillas": solo documentos propios del usuario
      if (currentFilter === 'mine') {
        indexDocs = indexDocs.filter(doc => doc.owner_id === user.user_id);
      }
      
      console.log(`✅ [API] ${indexDocs.length} documentos activos en el index`);

      if (indexDocs.length > 0) {
        docsContainer.style.display = 'block';

        indexDocs.forEach(doc => {
          const formattedDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-CO', { 
            day: '2-digit', 
            month: 'short',
            year: 'numeric'
          }) : '';

          // ✅ Usar la función createDocCard con el template
          const card = createDocCard({
            id: doc.document_id || doc.id,
            title: doc.title || 'Sin título',
            owner: doc.owner_name || 'PKI SERVICES',
            date: formattedDate,
            folderName: doc.folder_name || null,
            documentType: doc.document_type || 'normal'
          });

          grid.appendChild(card);
        });
      } else {
        console.log('ℹ️ [API] No hay documentos en el index');
      }
    } else {
      console.log('ℹ️ [API] No hay documentos activos');
    }
  } catch (error) {
    console.error('❌ [API] Error al cargar documentos activos:', error);
  }
}

// ✅ Nueva función para cargar documentos archivados
async function loadArchivedDocuments() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const url = `/api/documents?user_id=${user.user_id}&status=archived`;
    console.log(`📡 [API] Solicitando documentos archivados: ${url}`);

    const res = await authFetch(url);
    const json = await res.json();

    if (json.success && json.data && json.data.length > 0) {
      console.log(`✅ [API] ${json.data.length} documentos archivados encontrados`);

      docsContainer.style.display = 'block';

      json.data.forEach(doc => {
        const article = document.createElement('article');
        article.className = 'card doc';
        article.dataset.id = doc.id;

        const createdDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-CO', { 
          day: '2-digit', 
          month: 'short',
          year: 'numeric'
        }) : '';

        article.innerHTML = `
          <a class="card-link" href="/tracking.html?id=${doc.id}&name=${encodeURIComponent(doc.title || 'Documento')}">
            <h3 class="title">${doc.title || 'Sin título'}</h3>
            <div class="meta">
              <p class="owner">${doc.owner_name || 'PKI SERVICES'}</p>
              <p class="date">${createdDate}</p>
            </div>
          </a>
          
          <div class="doc-actions">
            <button class="icon-btn" data-action="restore" data-id="${doc.id}" title="Restaurar documento">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
            </button>
            
            <button class="icon-btn" data-action="delete-permanent" data-id="${doc.id}" title="Eliminar permanentemente">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </div>
        `;

        grid.appendChild(article);
      });
    } else {
      console.log('ℹ️ [API] No hay documentos archivados');
    }
  } catch (error) {
    console.error('❌ [API] Error al cargar documentos archivados:', error);
  }
}

// ====== Documentos compartidos via equipos (teams) ======
async function loadSharedDocuments() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const res = await authFetch('/api/teams/shared-with-me/vault');
    const json = await res.json();

    if (json.ok && json.data) {
      const { folders, documents } = json.data;
      console.log(`✅ [API] ${documents.length} documentos y ${folders.length} carpetas compartidas via equipos`);

      // Mostrar carpetas compartidas
      if (folders && folders.length > 0) {
        foldersContainer.style.display = 'block';
        folders.forEach(f => {
          const folderCard = folderCardTemplate({
            id: f.id,
            name: f.name,
            item_count: f.doc_count || 0,
            tag: 'shared',
            owner_name: f.owner_name || null
          });
          foldersGrid.appendChild(folderCard);
        });
      }

      // Mostrar documentos compartidos
      if (documents && documents.length > 0) {
        docsContainer.style.display = 'block';
        documents.forEach(doc => {
          const formattedDate = doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric'
          }) : '';

          const card = createDocCard({
            id: doc.document_id || doc.id,
            title: doc.title || 'Sin título',
            owner: doc.owner_name || 'Equipo',
            date: formattedDate,
            folderName: doc.folder_name || null,
            documentType: doc.document_type || 'normal'
          });

          grid.appendChild(card);
        });
      } else {
        console.log('ℹ️ [API] No hay documentos compartidos via inquilinos');
      }
    }
  } catch (error) {
    console.error('❌ [API] Error al cargar documentos compartidos:', error);
  }
}

// ====== FUNCIONES DE API PARA DOCUMENTOS ======

/**
 * Actualizar documento (cambiar título, carpeta, estado, etc.)
 */
async function updateDocument(docId, updates) {
  const user = getCurrentUser();
  if (!user) return false;

  try {
    console.log(`📝 [API] Actualizando documento ${docId}:`, updates);
    
    const response = await authFetch(`/api/documents/${docId}?user_id=${user.user_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (data.success) {
      console.log(`✅ [API] Documento ${docId} actualizado correctamente`);
      return true;
    } else {
      throw new Error(data.error || 'Error al actualizar documento');
    }
  } catch (error) {
    console.error('❌ [API] Error al actualizar documento:', error);
    ToastManager.error('Error al actualizar', error.message);
    return false;
  }
}

/**
 * Mover documento a otra carpeta
 */
async function moveDocument(docId, targetFolderId) {
  const user = getCurrentUser();
  if (!user) return false;

  try {
    console.log(`📁 [API] Moviendo documento ${docId} a carpeta ${targetFolderId}`);
    
    const response = await authFetch(`/api/documents/${docId}?user_id=${user.user_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_id: targetFolderId })
    });

    const data = await response.json();

    if (data.success) {
      console.log(`✅ [API] Documento movido a carpeta ${targetFolderId}`);
      return true;
    } else {
      throw new Error(data.error || 'Error al mover documento');
    }
  } catch (error) {
    console.error('❌ [API] Error al mover documento:', error);
    ToastManager.error('Error al mover', error.message);
    return false;
  }
}

/**
 * Duplicar documento
 */
async function duplicateDocument(docId) {
  const user = getCurrentUser();
  if (!user) return null;

  try {
    console.log(`📋 [API] Duplicando documento ${docId}`);
    
    const response = await authFetch(`/api/documents/${docId}/duplicate?user_id=${user.user_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (data.success && data.data) {
      console.log('✅ [API] Documento duplicado:', data.data);
      return data.data;
    } else {
      throw new Error(data.error || 'Error al duplicar documento');
    }
  } catch (error) {
    console.error('❌ [API] Error al duplicar documento:', error);
    ToastManager.error('Error al duplicar', error.message);
    return null;
  }
}

/**
 * Eliminar documento permanentemente (DELETE físico)
 */
async function deleteDocumentPermanent(docId) {
  const user = getCurrentUser();
  if (!user) return false;

  try {
    console.log(`🗑️ [API] Eliminando permanentemente documento ${docId}`);
    
    const response = await authFetch(`/api/documents/${docId}?user_id=${user.user_id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      console.log(`✅ [API] Documento ${docId} eliminado permanentemente`);
      return true;
    } else {
      throw new Error(data.error || 'Error al eliminar documento');
    }
  } catch (error) {
    console.error('❌ [API] Error al eliminar documento:', error);
    ToastManager.error('Error al eliminar', error.message);
    return false;
  }
}

/**
 * Obtener todas las carpetas disponibles para el usuario
 */
async function getAllFolders() {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    console.log('📂 [API] Obteniendo todas las carpetas del usuario');
    
    const response = await authFetch(`/api/folders?user_id=${user.user_id}`);
    const data = await response.json();

    if ((data.ok || data.success) && data.data) {
      console.log(`✅ [API] ${data.data.length} carpetas obtenidas`);
      return data.data.map(folder => ({
        id: folder.id || folder.folder_id,
        name: folder.name || folder.folder_name,
        item_count: folder.item_count || 0
      }));
    }
    return [];
  } catch (error) {
    console.error('❌ [API] Error al obtener carpetas:', error);
    return [];
  }
}

// ====== Mensaje de Estado Vacío ======
function showEmptyStateIfNeeded() {
  const hasFolders = foldersGrid?.querySelector('.card.folder');
  const hasDocs = grid?.querySelector('.card.doc');
  const hasContent = hasFolders || hasDocs;

  const existingEmpty = emptyGrid?.querySelector('.empty-state');
  if (existingEmpty) existingEmpty.remove();

  if (!hasContent) {
    emptyGrid.style.display = 'block';
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

    emptyGrid.appendChild(emptyState);
  } else {
    emptyGrid.style.display = 'none';
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
  // Aplicar vista a ambos grids
  foldersGrid?.classList.toggle('list-view', view === 'list');
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

  function open(){ 
    // ✅ Verificar permisos antes de abrir
    if (window.permissions && !window.permissions.hasPermission('canCreateDocuments')) {
      ToastManager.show({
        type: 'error',
        title: 'Acceso denegado',
        message: 'No tienes permisos para crear documentos. Tu rol es de solo lectura.'
      });
      return;
    }
    
    modal.style.display='flex'; 
    modal.setAttribute('aria-hidden','false'); 
    nameInput?.focus(); 
    loadFoldersIntoSelect(); // Cargar carpetas cada vez que se abre
    refresh(); 
  }
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

  // ===== Selector de tipo de documento =====
  const docTypeBtns = modal?.querySelectorAll('.doc-type-btn');
  docTypeBtns?.forEach(btn => {
    btn.addEventListener('click', () => {
      docTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      console.log('📋 Tipo de documento seleccionado:', btn.dataset.type);
    });
  });

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

        // 🔒 VALIDACIÓN ESTRICTA: Solo permitir PDFs
        const isValidPDF = file.type === 'application/pdf' && file.name.toLowerCase().endsWith('.pdf');

        if (!isValidPDF) {
          ToastManager.error('Archivo no válido', 'Solo se permiten archivos PDF válidos. Por favor selecciona un archivo .pdf');
          createBtn.textContent = orig;
          createBtn.disabled = false;
          return;
        }

        console.log('📄 Preparando documento para subir:', file.name);

        // ✅ Obtener tipo de documento seleccionado
        const documentType = document.querySelector('.doc-type-btn.active')?.dataset.type || 'normal';
        console.log('📋 Tipo de documento:', documentType);

        // Obtener carpeta seleccionada (puede ser vacío = "Sin carpeta")
        const selectedFolderId = document.getElementById('ct-folder-select')?.value || '';

        // Obtener usuario actual
        const user = getCurrentUser();
        if (!user) {
          ToastManager.error('Error de autenticación', 'Usuario no encontrado');
          createBtn.textContent = orig;
          createBtn.disabled = false;
          return;
        }

        // Preparar FormData para subir al servidor
        const formData = new FormData();
        formData.append('files', file);
        formData.append('titles', JSON.stringify([documentName]));
        formData.append('folder_id', selectedFolderId); // Vacío si es "Sin carpeta"
        formData.append('user_id', user.user_id);
        formData.append('document_type', documentType); // ✅ Agregar tipo de documento

        console.log('📤 Subiendo documento:', {
          nombre: documentName,
          archivo: file.name,
          carpeta: selectedFolderId || 'Sin carpeta (index)',
          usuario: user.user_id
        });

        // Subir al servidor
        const response = await authFetch(`/api/documents/upload?user_id=${user.user_id}`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Error al subir documento');
        }

        console.log('✅ Documento subido correctamente:', result.data[0]);
        const uploadedDoc = result.data[0];

        // ✅ Redirigir a tracking.html con el tipo de documento
        console.log(`🔄 Redirigiendo a tracking.html?docId=${uploadedDoc.document_id}&type=${documentType}`);
        ToastManager.success('Documento creado', `Redirigiendo a configuración de "${documentName}"...`);

        // Cerrar modal
        close();

        // Redirigir a tracking.html
        setTimeout(() => {
          window.location.href = `/tracking.html?docId=${uploadedDoc.document_id}&type=${documentType}`;
        }, 500);

        // NOTA: El código anterior que agregaba al grid ha sido reemplazado
        // por la redirección directa a tracking.html
        const currentFolderId = getCurrentFolderId();
        const uploadedFolderId = selectedFolderId || null;

        // Comparar si el documento se subió a la vista actual
        const shouldAddToGrid = false; // Deshabilitado: ahora redirigimos directamente

        if (shouldAddToGrid) {
          console.log('📄 Agregando documento al grid actual');
          const uploadedDoc = result.data[0];
          
          // Formatear fecha
          const formattedDate = uploadedDoc.created_at ? new Date(uploadedDoc.created_at).toLocaleDateString('es-CO', { 
            day: '2-digit', 
            month: 'short',
            year: 'numeric'
          }) : '';
          
          const docCard = createDocCard({
            id: uploadedDoc.document_id,
            title: uploadedDoc.title || documentName,
            owner: uploadedDoc.owner_name || 'PKI SERVICES',
            date: formattedDate,
            folderName: uploadedDoc.folder_name || null,
            documentType: uploadedDoc.document_type || documentType || 'normal'
          });

          const grid = document.getElementById('grid');
          if (grid) {
            grid.appendChild(docCard);
            showEmptyStateIfNeeded(); // Actualizar estado vacío
          }
        } else {
          console.log('📂 Documento subido a otra carpeta, no se agrega al grid actual');
        }

        // Resetear formulario
        nameInput.value = '';
        fileInput.value = '';
        fileText.textContent = 'Selecciona un archivo…';
        document.getElementById('ct-folder-select').value = '';
        document.getElementById('ct-folder-value').textContent = 'Sin carpeta';

      } else {
        ToastManager.info('Próximamente', 'La integración con Google Drive estará disponible próximamente');
      }

      createBtn.textContent = orig;
      createBtn.disabled = false;

    } catch (error) {
      console.error('❌ Error al crear documento:', error);
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
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  try {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('current_user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentUser');
  } catch {}
  location.href = '/public/Main/login.html';
});

// ====== Init ======
document.addEventListener('DOMContentLoaded', async () => {
  // Verificar permisos del usuario
  checkUserPermissions();
  await loadFolders();
});

// ====== VERIFICAR PERMISOS DEL USUARIO ======
function checkUserPermissions() {
  try {
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (!userStr) return;
    
    const user = JSON.parse(userStr);
    const roleName = user.role_name;
    
    // Roles que NO pueden acceder a perfil/configuración
    const restrictedRoles = ['Editor', 'Member', 'Agent', 'Viewer'];
    
    if (restrictedRoles.includes(roleName)) {
      console.log(`🔒 Usuario ${roleName}: ocultando enlace de Perfil`);
      
      // Ocultar enlace de Perfil en el menú
      const profileMenuItem = document.getElementById('profileMenuItem');
      if (profileMenuItem) {
        profileMenuItem.style.display = 'none';
      }
      
      // Ocultar enlace de Configuración en el header
      const configLink = document.getElementById('configLink');
      if (configLink) {
        configLink.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error al verificar permisos:', error);
  }
}

// ====== BOTÓN SUBIR ======
// ⚠️ NOTA: Los listeners de uploadBtn y uploadPicker ahora están en el bloque DOMContentLoaded
// más abajo (líneas ~1565+) para manejar el upload al index correctamente

// ====== MODAL DE NUEVA CARPETA ======
let allUserFolders = [];

function openNewFolderModal() {
  // ✅ Verificar permisos antes de abrir
  if (window.permissions && !window.permissions.hasPermission('canCreateFolders')) {
    ToastManager.show({
      type: 'error',
      title: 'Acceso denegado',
      message: 'No tienes permisos para crear carpetas. Tu rol es de solo lectura.'
    });
    return;
  }
  
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
      const res = await authFetch('/api/folders', {
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
        <span class="option-icon">${ICONS.folder}</span>
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
        <span class="option-icon">${ICONS.folder}</span>
        <span class="option-text">${folder.name} <span style="color: var(--ink-soft, #6d6270); font-weight: 400;">(${itemCount} ítem${itemCount !== 1 ? 's' : ''})</span></span>
      `;
      dropdown.appendChild(option);
    });

    console.log(`✅ ${folders.length} carpetas cargadas en selector`);
  } catch (error) {
    console.error('❌ Error al cargar carpetas en selector:', error);
  }
}

// ====== FUNCIONES DE MODALES PARA ACCIONES DE DOCUMENTOS ======

// Variable global para tracking del documento a mover
let currentDocToMove = null;

/**
 * Modal de Editar Nombre
 */
function showEditNameModal(currentName) {
  console.log('✏️ [MODAL] Abriendo modal de editar nombre:', currentName);
  return new Promise((resolve) => {
    const modal = document.getElementById('editNameModal');
    const input = document.getElementById('en-input');
    const saveBtn = document.getElementById('en-save');
    const cancelBtn = document.getElementById('en-cancel');
    const closeBtn = document.getElementById('en-close');

    if (!modal) {
      console.error('❌ Modal de editar nombre no encontrado');
      resolve(null);
      return;
    }

    input.value = currentName;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => input.focus(), 100);

    const close = () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
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

/**
 * Modal de Confirmación
 */
function showConfirmModal(title, message) {
  console.log('⚠️ [MODAL] Abriendo modal de confirmación:', title);
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    const closeBtn = document.getElementById('confirm-close');

    if (!modal) {
      console.error('❌ Modal de confirmación no encontrado');
      resolve(false);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');

    const close = () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
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

/**
 * Abrir Modal de Mover Documento
 */
async function openMoveDocumentModal(docId, docTitle) {
  console.log('📁 [MODAL] Abriendo modal de mover documento:', docId, docTitle);
  currentDocToMove = docId;

  const modal = document.getElementById('moveDocModal');
  const docNameEl = document.getElementById('md-doc-name');
  const dropdown = document.querySelector('#md-folder-select .select-dropdown');

  if (!modal || !dropdown) {
    console.error('❌ Modal de mover o dropdown no encontrados');
    return;
  }

  docNameEl.textContent = `Moviendo: "${docTitle}"`;

  // Cargar carpetas disponibles
  const folders = await getAllFolders();
  console.log(`📂 ${folders.length} carpetas disponibles para mover`);

  dropdown.innerHTML = '';

  if (folders.length === 0) {
    dropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--ink-soft);">No hay carpetas disponibles</div>';
  } else {
    folders.forEach(folder => {
      const option = document.createElement('div');
      option.className = 'custom-select-option';
      option.dataset.value = folder.id;
      option.innerHTML = `
        <span class="option-icon">${ICONS.folder}</span>
        <span class="option-text">${folder.name} (${folder.item_count} ítem${folder.item_count !== 1 ? 's' : ''})</span>
      `;
      dropdown.appendChild(option);
    });
  }

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Cerrar Modal de Mover Documento
 */
function closeMoveDocumentModal() {
  const modal = document.getElementById('moveDocModal');
  const selectTrigger = document.querySelector('#md-folder-select .select-trigger');
  const dropdown = document.querySelector('#md-folder-select .select-dropdown');
  const moveBtn = document.getElementById('md-move');

  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  if (dropdown) {
    dropdown.classList.remove('is-open');
  }

  if (selectTrigger) {
    selectTrigger.classList.remove('is-open', 'has-value');
    const selectText = selectTrigger.querySelector('.select-text');
    if (selectText) selectText.textContent = 'Selecciona una carpeta...';
  }

  if (moveBtn) {
    delete moveBtn.dataset.targetFolder;
  }

  currentDocToMove = null;
}

// ====== EVENT LISTENERS PARA LOS MODALES ======

document.addEventListener('DOMContentLoaded', () => {
  // === Modal de Mover Documento ===
  const moveModal = document.getElementById('moveDocModal');
  const mdClose = document.getElementById('md-close');
  const mdCancel = document.getElementById('md-cancel');
  const mdMove = document.getElementById('md-move');
  const mdSelectTrigger = document.querySelector('#md-folder-select .select-trigger');
  const mdDropdown = document.querySelector('#md-folder-select .select-dropdown');

  // Cerrar modal
  mdClose?.addEventListener('click', closeMoveDocumentModal);
  mdCancel?.addEventListener('click', closeMoveDocumentModal);
  moveModal?.addEventListener('click', (e) => {
    if (e.target === moveModal) closeMoveDocumentModal();
  });

  // Toggle dropdown
  mdSelectTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = mdDropdown?.classList.toggle('is-open');
    if (isOpen) {
      mdSelectTrigger.classList.add('is-open');
    } else {
      mdSelectTrigger.classList.remove('is-open');
    }
  });

  // Seleccionar carpeta del dropdown
  mdDropdown?.addEventListener('click', (e) => {
    const option = e.target.closest('.custom-select-option');
    if (!option) return;

    const text = option.querySelector('.option-text')?.textContent || 'Carpeta seleccionada';
    const selectText = mdSelectTrigger?.querySelector('.select-text');
    if (selectText) selectText.textContent = text;

    mdDropdown.classList.remove('is-open');
    mdSelectTrigger?.classList.remove('is-open');
    mdSelectTrigger?.classList.add('has-value');

    if (mdMove) {
      mdMove.dataset.targetFolder = option.dataset.value;
    }
  });

  // Cerrar dropdown al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!mdSelectTrigger?.contains(e.target) && !mdDropdown?.contains(e.target)) {
      mdDropdown?.classList.remove('is-open');
      mdSelectTrigger?.classList.remove('is-open');
    }
  });

  // Ejecutar movimiento
  mdMove?.addEventListener('click', async () => {
    const targetFolderId = mdMove.dataset.targetFolder;

    if (!targetFolderId) {
      ToastManager.warning('Selección requerida', 'Debes seleccionar una carpeta destino');
      return;
    }

    if (!currentDocToMove) {
      console.error('❌ No hay documento seleccionado para mover');
      return;
    }

    mdMove.disabled = true;
    mdMove.textContent = 'Moviendo...';

    try {
      const success = await moveDocument(currentDocToMove, targetFolderId);

      if (success) {
        ToastManager.success('Documento movido', 'El documento se movió correctamente a la carpeta');
        closeMoveDocumentModal();
        await loadFolders(); // Recargar vista
      } else {
        ToastManager.error('Error', 'No se pudo mover el documento');
      }
    } catch (error) {
      console.error('❌ Error al mover documento:', error);
      ToastManager.error('Error', 'Ocurrió un error al mover el documento');
    } finally {
      mdMove.disabled = false;
      mdMove.textContent = 'Mover';
      delete mdMove.dataset.targetFolder;
    }
  });
});

// ====== EVENT DELEGATION: Acciones de Documentos ======

document.addEventListener('DOMContentLoaded', () => {
  const docsGrid = document.getElementById('grid');

  if (!docsGrid) {
    console.warn('⚠️ Grid de documentos no encontrado');
    return;
  }

  console.log('✅ Event listener de acciones de documentos registrado en grid:', docsGrid);

  docsGrid.addEventListener('click', async (e) => {
    // PRIMERO: Verificar si es un botón de acción o está dentro de uno
    let btn = e.target.closest('[data-action]');
    
    // Si no se encontró, verificar si el click fue en el contenedor de botones
    if (!btn && e.target.classList.contains('doc-actions')) {
      // Click en el contenedor, ignorar
      return;
    }
    
    // Si tampoco, verificar si es un SVG o path dentro de un botón
    if (!btn) {
      const parent = e.target.parentElement;
      if (parent && parent.hasAttribute('data-action')) {
        btn = parent;
      }
    }

    if (btn) {
      console.log(`🔘 Acción: ${btn.dataset.action} en documento ${btn.dataset.id}`);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const id = btn.dataset.id;
      const action = btn.dataset.action;

      // Obtener información del documento desde la tarjeta DOM
      const card = btn.closest('.card.doc');
      if (!card) {
        console.error('❌ No se encontró la tarjeta del documento');
        return;
      }

      const titleEl = card.querySelector('.title');
      const docTitle = titleEl ? titleEl.textContent.trim() : 'Documento sin título';

      try {
        switch(action) {
          case 'move':
            await openMoveDocumentModal(id, docTitle);
            break;

          case 'edit':
            const newName = await showEditNameModal(docTitle);
            if (newName && newName !== docTitle) {
              const success = await updateDocument(id, { title: newName });
              if (success) {
                titleEl.textContent = newName;
                await loadFolders();
                ToastManager.success('Documento renombrado', 'El nombre se actualizó correctamente');
              }
            }
            break;

          case 'clone':
            const duplicated = await duplicateDocument(id);
            if (duplicated) {
              await loadFolders();
              ToastManager.success('Documento duplicado', 'Se creó una copia del documento');
            } else {
              ToastManager.error('Error', 'No se pudo duplicar el documento');
            }
            break;

          case 'archive':
            const confirmed = await showConfirmModal(
              'Archivar documento',
              `¿Estás seguro de que deseas archivar "${docTitle}"? Podrás restaurarlo desde la pestaña Archivadas.`
            );
            if (confirmed) {
              const success = await updateDocument(id, { status: 'archived' });
              if (success) {
                await loadFolders();
                ToastManager.info('Documento archivado', 'El documento se movió a archivados');
              } else {
                ToastManager.error('Error', 'No se pudo archivar el documento');
              }
            }
            break;

          case 'restore':
            console.log('♻️ Restaurando documento...');
            const restoreSuccess = await updateDocument(id, { status: 'active' });
            if (restoreSuccess) {
              await loadFolders();
              ToastManager.success('Documento restaurado', 'El documento se restauró correctamente');
            } else {
              ToastManager.error('Error', 'No se pudo restaurar el documento');
            }
            break;

          case 'delete-permanent':
            console.log('🗑️ Eliminando permanentemente...');
            const deleteConfirmed = await showConfirmModal(
              'Eliminar permanentemente',
              `¿Estás seguro de eliminar PERMANENTEMENTE "${docTitle}"? Esta acción NO se puede deshacer.`
            );
            if (deleteConfirmed) {
              const deleteSuccess = await deleteDocumentPermanent(id);
              if (deleteSuccess) {
                await loadFolders();
                ToastManager.success('Documento eliminado', 'El documento se eliminó permanentemente');
              } else {
                ToastManager.error('Error', 'No se pudo eliminar el documento');
              }
            }
            break;

          default:
            console.warn(`⚠️ Acción no reconocida: ${action}`);
        }
      } catch (err) {
        console.error('❌ Error en acción:', err);
        ToastManager.error('Error en la acción', err.message || 'Ocurrió un error inesperado');
      }
      return;
    }

    // SEGUNDO: Verificar si es click en el enlace del documento (abrir en tracking.html)
    // ✅ Cambiar de data-open-doc a .card-link o data-doc-id
    const docLink = e.target.closest('[data-doc-id]');
    if (docLink) {
      e.preventDefault();
      const docId = docLink.dataset.docId;
      const docTitle = docLink.dataset.docTitle || 'Documento';
      const folderName = docLink.dataset.folderName || 'Mis Plantillas';
      const documentType = docLink.dataset.documentType || 'normal';

      if (docId) {
        console.log(`📄 Abriendo documento ${docId} (tipo: ${documentType}) en tracking.html`);
        window.location.href = `/tracking.html?id=${docId}&name=${encodeURIComponent(docTitle)}&folder=${encodeURIComponent(folderName)}&type=${documentType}`;
      }
      return;
    }
  });
});

// ====== FUNCIONALIDAD DE SUBIR ARCHIVOS EN INDEX ======

document.addEventListener('DOMContentLoaded', () => {
  initCustomSelect();

  // ✅ Variables para modal de tipo de documento
  let selectedUploadType = 'normal';
  const uploadTypeModal = document.getElementById('uploadTypeModal');
  const uploadTypeClose = document.getElementById('upload-type-close');
  const uploadTypeCancel = document.getElementById('upload-type-cancel');
  const uploadTypeContinue = document.getElementById('upload-type-continue');
  const uploadTypeBtns = document.querySelectorAll('.doc-type-upload-btn');

  // ✅ Manejar selección de tipo de documento
  uploadTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      uploadTypeBtns.forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f8f9fa';
        b.style.borderColor = '#e5e7eb';
        b.style.color = '#1f2937';
        b.style.boxShadow = '';
      });
      btn.classList.add('active');
      selectedUploadType = btn.dataset.uploadType;
      console.log('📋 Tipo de documento seleccionado:', selectedUploadType);
    });
  });

  // ✅ Cerrar modal
  function closeUploadTypeModal() {
    if (uploadTypeModal) {
      uploadTypeModal.style.display = 'none';
      uploadTypeModal.setAttribute('aria-hidden', 'true');
    }
  }

  uploadTypeClose?.addEventListener('click', closeUploadTypeModal);
  uploadTypeCancel?.addEventListener('click', closeUploadTypeModal);

  // Esperar un momento para asegurar que todo está listo
  setTimeout(() => {
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadPicker = document.getElementById('uploadPicker');

    if (!uploadBtn || !uploadPicker) {
      return;
    }

    // ✅ Abrir modal de tipo de documento
    uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // ✅ Verificar permisos antes de abrir selector
      if (window.permissions && !window.permissions.hasPermission('canUploadDocuments')) {
        ToastManager.show({
          type: 'error',
          title: 'Acceso denegado',
          message: 'No tienes permisos para subir documentos. Tu rol es de solo lectura.'
        });
        return;
      }

      // ✅ Mostrar modal para seleccionar tipo de documento
      if (uploadTypeModal) {
        uploadTypeModal.style.display = 'flex';
        uploadTypeModal.setAttribute('aria-hidden', 'false');
      }
    });

    // ✅ Continuar con la subida
    uploadTypeContinue?.addEventListener('click', () => {
      closeUploadTypeModal();
      uploadPicker.click(); // Abrir selector de archivos
    });

    // Cuando se seleccionan archivos
    uploadPicker.addEventListener('change', async (e) => {
      const files = Array.from(uploadPicker.files || []);

      if (files.length === 0) {
        return;
      }

      // 🔒 VALIDACIÓN ESTRICTA: Solo permitir PDFs
      const invalidFiles = files.filter(file => {
        const fileType = file.type;
        const fileName = file.name.toLowerCase();
        return !(fileType === 'application/pdf' && fileName.endsWith('.pdf'));
      });

      if (invalidFiles.length > 0) {
        const invalidNames = invalidFiles.map(f => f.name).join(', ');
        ToastManager.error('Archivos no válidos', `Solo se permiten archivos PDF. Archivos rechazados: ${invalidNames}`);
        uploadPicker.value = ''; // Limpiar input
        return;
      }

      console.log(`📤 Subiendo ${files.length} archivo(s) al index...`);

      let added = 0;
      let failed = 0;

      for (const file of files) {
        // Usar el nombre del archivo sin extensión como título
        const title = file.name.replace(/\.[^.]+$/, '');
        console.log(`   📄 Subiendo: ${title} como tipo: ${selectedUploadType}`);

        const docId = await uploadDocument({
          title,
          file: file,
          folderId: null, // ✅ null = guardar en el index (sin carpeta)
          documentType: selectedUploadType // ✅ Pasar tipo de documento seleccionado
        });

        if (docId) {
          added++;
          console.log(`   ✅ Documento ${docId} subido correctamente`);
        } else {
          failed++;
          console.log(`   ❌ Error al subir ${title}`);
        }
      }

      uploadPicker.value = ''; // Limpiar input
      
      console.log(`📊 Resultado: ${added} subidos, ${failed} fallidos`);
      
      // ✅ NO recargar automáticamente, solo actualizar la lista
      await loadFolders();

      if (added > 0) {
        ToastManager.success('Documentos subidos', `Se agregaron ${added} documento${added > 1 ? 's' : ''} al index`);
      }

      if (failed > 0) {
        ToastManager.error('Error', `${failed} documento${failed > 1 ? 's' : ''} no se pudo${failed > 1 ? 'ieron' : ''} subir`);
      }
    });
  }, 100); // Esperar 100ms para asegurar que todo está listo
});

/**
 * Subir documento al servidor
 */
async function uploadDocument({ title, file, folderId = null, documentType = 'normal' }) {
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
    console.log('📤 Subiendo documento:', { title, folderId, fileName: file.name, documentType });

    const formData = new FormData();
    formData.append('files', file); // Importante: campo 'files' (plural)

    if (title) {
      formData.append('titles', JSON.stringify([title])); // Array de títulos
    }

    if (folderId !== null && folderId !== undefined) {
      formData.append('folder_id', folderId);
    }
    // Si folderId es null, NO lo agregamos → documento queda en el index

    formData.append('user_id', user.user_id);
    formData.append('document_type', documentType); // ✅ Enviar tipo de documento

    // IMPORTANTE: Agregar user_id en query params para que el middleware de auth lo detecte
    const response = await authFetch(`/api/documents/upload?user_id=${user.user_id}`, {
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
}

document.getElementById('newTemplateBtn')?.addEventListener('click', () => {
  setTimeout(() => loadFoldersIntoSelect(), 100);
});

// =============================================
// MODAL DE PERSONALIZACIÓN DE PLANTILLAS
// =============================================

let currentTemplateFields = [];
let currentTemplateId = null;
let currentTemplateName = '';

/**
 * Abrir modal de personalización con plantilla pre-cargada
 */
async function openPersonalizationModal(templateId, templateName) {
  console.log('🎨 Abriendo modal de personalización:', { templateId, templateName });
  
  currentTemplateId = templateId;
  currentTemplateName = decodeURIComponent(templateName || 'Plantilla');
  
  const modal = document.getElementById('personalizeModal');
  const titleEl = document.getElementById('personalize-template-name');
  const fieldsContainer = document.getElementById('personalize-fields-container');
  
  if (!modal) {
    console.error('❌ Modal de personalización no encontrado');
    return;
  }
  
  // Mostrar modal
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  
  // Actualizar título
  if (titleEl) {
    titleEl.textContent = currentTemplateName;
  }
  
  // Cargar campos
  try {
    fieldsContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;"><p>Cargando campos...</p></div>';
    
    const response = await authFetch(`/api/templates/${templateId}`);
    const data = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error('No se pudieron cargar los campos de la plantilla');
    }
    
    currentTemplateFields = data.data.fields || [];
    
    if (currentTemplateFields.length === 0) {
      fieldsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #ef4444;">
          <p><strong>${ICONS.warning} Esta plantilla no tiene campos</strong></p>
          <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
            Debes colocar campos en el editor antes de personalizar
          </p>
        </div>
      `;
      return;
    }
    
    // Renderizar formulario de campos
    renderFieldsForm();
    
  } catch (error) {
    console.error('❌ Error cargando campos:', error);
    fieldsContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ef4444;">
        <p><strong>${ICONS.error} Error al cargar campos</strong></p>
        <p style="font-size: 13px; margin-top: 8px;">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Renderizar formulario con todos los campos
 */
function renderFieldsForm() {
  const container = document.getElementById('personalize-fields-container');
  
  if (!container) return;
  
  // Filtrar solo campos de texto (para personalización simple)
  const textFields = currentTemplateFields.filter(f => f.field_type === 'text');
  
  if (textFields.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #f59e0b;">
        <p><strong>${ICONS.warning} No hay campos de texto para personalizar</strong></p>
        <p style="font-size: 13px; color: #6b7280; margin-top: 8px;">
          Esta plantilla solo tiene campos de firma, fecha o sello
        </p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = textFields.map((field, index) => {
    // Usar field_key como label (ej: "nombre_cliente" → "Nombre cliente")
    const label = (field.field_key || `Campo ${index + 1}`)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    
    return `
      <div class="form-group">
        <label class="form-label" style="font-weight: 600; color: #374151;">
          ${label}
        </label>
        <input 
          type="text" 
          class="ct-input" 
          data-field-id="${field.id}"
          data-field-key="${field.field_key}"
          placeholder="Ingresa ${label.toLowerCase()}"
          style="width: 100%; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px;"
        />
      </div>
    `;
  }).join('');
}

/**
 * Generar PDF personalizado
 */
async function generatePersonalizedPDF() {
  console.log('✨ Generando PDF personalizado...');
  
  const container = document.getElementById('personalize-fields-container');
  const inputs = container.querySelectorAll('input[data-field-key]');
  
  // Recolectar valores
  const fieldValues = {};
  let hasValues = false;
  
  inputs.forEach(input => {
    const key = input.dataset.fieldKey;
    const value = input.value.trim();
    
    if (value) {
      fieldValues[key] = value;
      hasValues = true;
    }
  });
  
  if (!hasValues) {
    ToastManager.warning('Campos vacíos', 'Debes completar al menos un campo');
    return;
  }
  
  try {
    const generateBtn = document.getElementById('personalize-generate');
    const originalText = generateBtn.textContent;
    generateBtn.innerHTML = '<svg style="width:16px;height:16px;vertical-align:middle;animation:spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Generando...';
    generateBtn.disabled = true;
    
    // Llamar al endpoint de generación
    const response = await authFetch('/api/documents/personalize-single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        templateId: currentTemplateId,
        fieldValues: fieldValues
      })
    });
    
    const data = await response.json();
    
    generateBtn.textContent = originalText;
    generateBtn.disabled = false;
    
    if (!data.success) {
      throw new Error(data.error || 'Error al generar PDF');
    }
    
    // Cerrar modal
    closePersonalizationModal();
    
    // Mostrar éxito y descargar
    ToastManager.success('¡PDF Generado!', 'Tu documento personalizado está listo');
    
    // Descargar PDF
    if (data.data && data.data.pdfUrl) {
      window.open(data.data.pdfUrl, '_blank');
    }
    
  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    ToastManager.error('Error', error.message);
    
    const generateBtn = document.getElementById('personalize-generate');
    generateBtn.textContent = 'Generar PDF';
    generateBtn.disabled = false;
  }
}

/**
 * Cerrar modal de personalización
 */
function closePersonalizationModal() {
  const modal = document.getElementById('personalizeModal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  
  currentTemplateFields = [];
  currentTemplateId = null;
  currentTemplateName = '';
}

// Event listeners para el modal
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('personalize-close');
  const cancelBtn = document.getElementById('personalize-cancel');
  const generateBtn = document.getElementById('personalize-generate');
  
  if (closeBtn) closeBtn.onclick = closePersonalizationModal;
  if (cancelBtn) cancelBtn.onclick = closePersonalizationModal;
  if (generateBtn) generateBtn.onclick = generatePersonalizedPDF;
});