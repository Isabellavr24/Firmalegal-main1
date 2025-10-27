/*********************************************************
 * Firmalegal — script.js (Index con carpetas dinámicas)
 * - Genera tarjetas de carpetas con link directo a folder.html
 * - Funciona aun sin API (modo demo)
 **********************************************************/

// ====== Config ======
const USE_API = false; // pon en true cuando tu endpoint /api/folders esté listo

// ====== DOM ======
const grid        = document.getElementById('grid');
const searchInput = document.getElementById('searchInput');
const tabs        = document.querySelectorAll('.tab');
const toggles     = document.querySelectorAll('.toggle-btn');

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

// Crea una card de carpeta con HREF directo a folder.html (relativo al index)
function folderCardTemplate({ id, name, item_count = 0, tag = 'mine' }){
  const folderId = id || slugify(name);

  // Construye URL relativa al documento actual (index.html)
  const url = new URL('folder.html', window.location.href);
  url.searchParams.set('id', folderId);
  url.searchParams.set('name', name);

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
        <p class="sub">${item_count} ítems</p>
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
    { id:'pki-services', name:'Pki Services',        item_count:12, tag:'mine'   },
    { id:'yakitori',     name:'Proyecto Yakitori',   item_count: 8, tag:'shared' }
  ].filter(f => {
    const t = (f.name || '').toLowerCase();
    const okSearch = currentSearch ? t.includes(currentSearch.toLowerCase()) : true;
    const okFilter = currentFilter === '*' ? true : (f.tag || '').includes(currentFilter);
    return okSearch && okFilter;
  });
}

async function fetchFoldersAPI(){
  if (!USE_API) return demoFolders();

  const qs = new URLSearchParams();
  if (currentFilter !== '*') qs.set('filter', currentFilter);
  if (currentSearch.trim()) qs.set('search', currentSearch.trim());

  const url = `/api/folders?${qs.toString()}`;
  try {
    const res = await fetch(url, { headers: { 'Accept':'application/json' }});
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if (json?.ok && Array.isArray(json.data)) return json.data;
    throw new Error('Formato inesperado');
  } catch (e) {
    console.warn('[index] API falló, usando demo:', e?.message || e);
    return demoFolders();
  }
}

async function loadFolders(){
  if (!grid) { console.warn('[index] No existe #grid'); return; }
  const folders = await fetchFoldersAPI();
  clearRenderedFolders();
  folders.forEach(f => insertFolderCard(folderCardTemplate(f)));
  // Salvavidas: si no se pintó nada, fuerza demo
  if (!grid.querySelector('.card.folder')) {
    demoFolders().forEach(f => insertFolderCard(folderCardTemplate(f)));
  }
}

// ====== Search (docs locales) + recarga de carpetas ======
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
  const openBtn   = document.getElementById('newTemplateBtn');
  const modal     = document.getElementById('createTemplateModal');
  const closeBtn  = document.getElementById('ct-close');

  const segBtns   = modal?.querySelectorAll('.segmented-btn');
  const uploadTab = document.getElementById('ct-tab-upload');
  const driveTab  = document.getElementById('ct-tab-gdrive');

  const nameInput = document.getElementById('ct-name');
  const fileInput = document.getElementById('ct-file');
  const fileText  = document.getElementById('ct-file-text');
  const driveInput= document.getElementById('ct-gdrive');
  const createBtn = document.getElementById('ct-create');

  const folderName= document.getElementById('ct-folder-name');
  const changeBtn = document.getElementById('ct-change-folder');
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

  changeBtn?.addEventListener('click', ()=>{
    const val = prompt('Nombre de carpeta:', folderName?.textContent?.trim() || 'Default');
    if(val){ folderName.textContent = val.trim(); }
  });
  newFolder?.addEventListener('click', ()=> alert('Abrir creación/selector de carpeta (integra tu backend)'));

  createBtn?.addEventListener('click', ()=>{
    const payload = {
      name: nameInput.value.trim(),
      folder: folderName.textContent.trim(),
      source: usingDrive() ? {type:'gdrive', url: driveInput.value.trim()} : {type:'upload', files: fileInput.files}
    };
    console.log('CREATE payload:', payload);
    createBtn.disabled = true;
    const orig = createBtn.textContent; createBtn.textContent = 'Creando…';
    setTimeout(()=>{ createBtn.textContent = orig; createBtn.disabled = false; close(); }, 600);
  });
})();

// ====== Subir (demo) ======
document.getElementById('uploadBtn')?.addEventListener('click', () => alert('Subir plantilla (demo)'));

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
