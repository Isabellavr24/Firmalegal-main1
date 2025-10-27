/******************************************************
 * folder.js — Vista de carpeta con modal CREAR
 ******************************************************/

const grid = document.getElementById('docsGrid');
const titleEl = document.getElementById('folderTitle');
const params = new URLSearchParams(location.search);
const folderId = params.get('id') || '';
const folderNameFromURL = params.get('name') ? decodeURIComponent(params.get('name')) : 'Carpeta';
titleEl.textContent = folderNameFromURL;

// ===== Util =====
function slugify(s){
  return String(s || '')
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const day  = new Intl.DateTimeFormat('es-ES', { day:'2-digit' }).format(d);
  let mon    = new Intl.DateTimeFormat('es-ES', { month:'short' }).format(d);
  mon = mon.replace('.', '');
  const time = new Intl.DateTimeFormat('es-ES', { hour:'2-digit', minute:'2-digit' }).format(d);
  return `${day} de ${mon} ${time}`;
}

// ===== Render docs (demo o API) =====
async function fetchDocs(){
  const url = `/api/documents?folder_id=${encodeURIComponent(folderId)}&is_template=1`;
  try {
    const res = await fetch(url, { headers: { 'Accept':'application/json' }});
    if (!res.ok) throw 0;
    const json = await res.json();
    if (json?.data && Array.isArray(json.data)) return json.data;
    throw 0;
  } catch {
    // DEMO
    return [
      { id: 101, title: 'otro si al contrato de arrendamiento', owner_name:'PKI SERVICES', updated_at:'2024-09-25T11:11:00' },
      { id: 102, title: 'contrato de arrendamiento 2DO PISO',   owner_name:'PKI SERVICES', updated_at:'2024-09-25T10:21:00' },
    ];
  }
}
function docCardTemplate(doc){
  const art = document.createElement('article');
  art.className = 'card doc';
  art.innerHTML = `
    <a class="card-link" href="#">
      <div class="doc-body">
        <h3 class="title">${doc.title || doc.name || 'Documento'}</h3>
        <div class="badges">
          <span class="small">${doc.owner_name || 'PKI SERVICES'}</span>
          <span class="small muted">${fmtDate(doc.updated_at || doc.created_at || new Date().toISOString())}</span>
        </div>
      </div>
    </a>
  `;
  art.querySelector('a').addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Abrir documento', doc.id);
    // TODO: integrar visor/descarga
  });
  return art;
}
async function renderDocs(){
  const docs = await fetchDocs();
  grid.innerHTML = '';
  if (!docs.length) { grid.innerHTML = '<p>No hay documentos en esta carpeta.</p>'; return; }
  docs.forEach(d => grid.appendChild(docCardTemplate(d)));
}

// ======== MODAL CREAR (idéntico a index, adaptado a folder) ========
(function(){
  const openBtn   = document.getElementById('createBtn');
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

  const folderNameEl = document.getElementById('ct-folder-name');
  const changeBtn = document.getElementById('ct-change-folder');
  const newFolder = document.getElementById('ct-new-folder');

  // Prefija el folder actual
  folderNameEl.textContent = folderNameFromURL || 'Default';

  if(!modal) return;

  function open(){
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    nameInput.focus();
    refreshCreateState();
  }
  function close(){
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', (e)=>{ if(e.target === modal) close(); });
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });

  // Tabs
  segBtns?.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      segBtns.forEach(b=>b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const tab = btn.dataset.tab;
      uploadTab?.classList.toggle('is-visible', tab==='upload');
      driveTab?.classList.toggle('is-visible', tab==='gdrive');
      refreshCreateState();
    });
  });

  // File input
  fileInput?.addEventListener('change', ()=>{
    if(fileInput.files?.length){
      fileText.textContent = fileInput.files.length === 1
        ? fileInput.files[0].name
        : `${fileInput.files.length} archivos seleccionados`;
    } else {
      fileText.textContent = 'Selecciona un archivo…';
    }
    refreshCreateState();
  });

  [nameInput, driveInput].forEach(el=> el?.addEventListener('input', refreshCreateState));

  function usingDrive(){ return driveTab?.classList.contains('is-visible'); }
  function hasSource(){
    return usingDrive()
      ? !!(driveInput?.value || '').trim()
      : !!fileInput?.files?.length;
  }
  function refreshCreateState(){
    const hasName = (nameInput?.value || '').trim().length > 0;
    createBtn.disabled = !(hasName && hasSource());
  }

  // Cambiar carpeta (simple prompt; integra tu selector real si lo tienes)
  changeBtn?.addEventListener('click', ()=>{
    const val = prompt('Folder name:', folderNameEl.textContent || 'Default');
    if(val){ folderNameEl.textContent = val.trim(); }
  });

  // Crear carpeta: abre modal de nueva carpeta (incluido en esta página)
  const newFolderModal = document.getElementById('newFolderModal');
  const openNf = () => { newFolderModal.style.display='flex'; newFolderModal.setAttribute('aria-hidden','false'); };
  const closeNf= () => { newFolderModal.style.display='none'; newFolderModal.setAttribute('aria-hidden','true'); };

  newFolder?.addEventListener('click', openNf);
  newFolderModal?.addEventListener('click', (e) => {
    if (e.target.dataset.close === 'modal' || e.target === newFolderModal) closeNf();
  });
  document.getElementById('newFolderForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.folderName.value.trim();
    if(!name) return;
    // Aquí llamarías a tu API para crear la carpeta y recuperar su ID real
    folderNameEl.textContent = name;
    closeNf();
    e.target.reset();
  });

  // Acción CREAR (integra tu API real aquí)
  createBtn?.addEventListener('click', async ()=>{
    const payload = {
      name: nameInput.value.trim(),
      folder_id: folderId || slugify(folderNameEl.textContent.trim()),
      folder_name: folderNameEl.textContent.trim(),
      source: usingDrive() ? {type:'gdrive', url: driveInput.value.trim()}
                           : {type:'upload', files: fileInput.files}
    };

    console.log('CREATE (folder view) payload:', payload);

    // TODO: reemplaza por tu fetch real
    // const res = await fetch('/api/templates', { method:'POST', body: formData ... })

    // UX de cierre simple
    createBtn.disabled = true;
    const orig = createBtn.textContent;
    createBtn.textContent = 'Creando…';
    setTimeout(()=>{ createBtn.textContent = orig; createBtn.disabled = false; close(); }, 600);
  });
})();

// ===== Init =====
document.addEventListener('DOMContentLoaded', renderDocs);

// ===== Logout =====
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


// ========= SUBIR (FOLDER) =========
const UPLOAD_ENDPOINT = '/api/templates/upload'; // <-- AJUSTA si tu backend usa otra ruta
const uploadBtnF    = document.getElementById('uploadBtn');
const uploadPickerF = document.getElementById('uploadPicker');

uploadBtnF?.addEventListener('click', () => uploadPickerF?.click());

uploadPickerF?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const folderName = document.getElementById('folderTitle')?.textContent?.trim() || 'Default';
  try {
    await uploadFilesInFolder(files, { folderId, folderName });
    await renderDocs();               // vuelve a listar documentos en la carpeta
    alert('Subida completada ✔️');
  } catch (err) {
    alert('Error al subir: ' + (err?.message || err));
  } finally {
    e.target.value = '';
  }
});

async function uploadFilesInFolder(files, { folderId, folderName }) {
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));      // "files" -> AJUSTA al nombre que espere tu backend
  fd.append('folder_id', folderId);
  fd.append('folder_name', folderName);

  const res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
