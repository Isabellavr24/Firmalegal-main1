document.addEventListener('DOMContentLoaded', () => {
  /* ============================
     Navegación lateral (una sola sección visible)
  ============================ */
  const nav = document.getElementById('settingsNav');

  function showSection(id) {
    // Activar item del menú
    nav?.querySelectorAll('.sn-item').forEach(b => {
      b.classList.toggle('is-active', b.dataset.section === id);
    });
    // Mostrar sección correspondiente
    document.querySelectorAll('.set-section').forEach(sec => {
      sec.classList.toggle('is-visible', sec.id === `sec-${id}`);
    });
    // Guardar última abierta
    try { localStorage.setItem('settings_last_section', id); } catch {}
    // Subir al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Click en sidebar
  nav?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sn-item');
    if (!btn) return;
    const id = btn.dataset.section;
    showSection(id);
    // Sincroniza con hash para permitir links directos
    history.replaceState(null, '', `#${id}`);
  });

  // Estado inicial (hash > localStorage > primero activo > "perfil")
  (function initSection() {
    // Obtener usuario actual
    const currentUser = window.permissions?.getCurrentUser();
    const userRole = currentUser?.role_name;
    
    // Para Admin y Tenant Admin, SIEMPRE iniciar en "perfil"
    if (userRole === 'Admin' || userRole === 'Tenant Admin') {
      console.log('🔒 Admin/Tenant Admin: forzando inicio en Perfil');
      showSection('perfil');
      return;
    }
    
    // Para otros roles (Superadministrador), usar el comportamiento normal
    const fromHash = location.hash?.replace('#', '');
    const saved = (() => { try { return localStorage.getItem('settings_last_section'); } catch { return null; } })();
    const active = nav?.querySelector('.sn-item.is-active')?.dataset.section;
    const fallback = 'perfil';
    const start = fromHash || saved || active || fallback;
    showSection(start);
  })();

  /* ============================
     Form Perfil (demo)
  ============================ */
  const perfilForm = document.getElementById('perfilForm');
  perfilForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {
      nombre: document.getElementById('pf-nombre')?.value.trim() || '',
      apellido: document.getElementById('pf-apellido')?.value.trim() || '',
      email: document.getElementById('pf-email')?.value.trim() || '',
    };
    console.log('[Perfil] Guardar:', payload);
    // TODO: llamada a backend
    perfilForm.querySelector('.btn-primary-xl')?.blur();
  });

  /* ============================
     Firma (upload/preview/remove)
  ============================ */
  const sigInput  = document.getElementById('sigFile');
  const sigRemove = document.getElementById('sigRemove');
  const sigWrap   = document.getElementById('sigPreviewWrap');
  const sigImg    = document.getElementById('sigPreview');

  function enablePreview(file) {
    const url = URL.createObjectURL(file);
    sigImg.src = url;
    sigWrap.hidden = false;
    sigRemove.disabled = false;
  }

  sigInput?.addEventListener('change', () => {
    const file = sigInput.files?.[0];
    if (!file) return;
    enablePreview(file);
    // TODO: subir a backend si corresponde
  });

  sigRemove?.addEventListener('click', () => {
    if (sigInput) sigInput.value = '';
    sigImg?.removeAttribute('src');
    if (sigWrap) sigWrap.hidden = true;
    if (sigRemove) sigRemove.disabled = true;
    // TODO: notificar eliminación en backend
  });

  /* ============================
     CUENTA — persistencia simple
  ============================ */
  const accountFields = ['acct-name', 'acct-tz', 'acct-lang', 'acct-url'];

  // Cargar valores guardados
  accountFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      const saved = localStorage.getItem('acct_' + id);
      if (saved !== null) el.value = saved;
    } catch {}
    el.addEventListener('change', () => {
      try { localStorage.setItem('acct_' + id, el.value); } catch {}
    });
  });

  // Guardar al enviar
  const cuentaForm = document.getElementById('cuentaForm');
  cuentaForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = {};
    accountFields.forEach(id => {
      const el = document.getElementById(id);
      payload[id] = el?.value ?? '';
      try { localStorage.setItem('acct_' + id, payload[id]); } catch {}
    });
    console.log('[Cuenta] Guardar:', payload);
    // TODO: llamada a backend
    cuentaForm.querySelector('.btn-primary-xl')?.blur();
  });

  /* ============================
     SMTP — persistencia simple
  ============================ */
  const smtpFields = [
    'smtp-host', 'smtp-port', 'smtp-user', 'smtp-pass',
    'smtp-domain', 'smtp-auth', 'smtp-from'
  ];

  // Cargar valores guardados
  smtpFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      const saved = localStorage.getItem('smtp_' + id);
      if (saved !== null) el.value = saved;
    } catch {}
    el.addEventListener('change', () => {
      // no persistimos password al teclear, solo al guardar
      if (id === 'smtp-pass') return;
      try { localStorage.setItem('smtp_' + id, el.value); } catch {}
    });
  });

  // Radios de seguridad
  const smtpSecName = 'smtp-sec';
  const savedSec = (() => { try { return localStorage.getItem('smtp_sec'); } catch { return null; } })();
  if (savedSec) {
    const rb = document.querySelector(`input[name="${smtpSecName}"][value="${savedSec}"]`);
    if (rb) rb.checked = true;
  }
  document.querySelectorAll(`input[name="${smtpSecName}"]`).forEach(r => {
    r.addEventListener('change', () => {
      try { localStorage.setItem('smtp_sec', r.value); } catch {}
    });
  });

  // Guardar SMTP
  const smtpForm = document.getElementById('smtpForm');
  smtpForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const payload = {};
    smtpFields.forEach(id => {
      const el = document.getElementById(id);
      payload[id] = el?.value ?? '';
      try {
        // Guardamos todo, incluido pass, SOLO al guardar
        localStorage.setItem('smtp_' + id, payload[id]);
      } catch {}
    });

    const sec = document.querySelector(`input[name="${smtpSecName}"]:checked`)?.value || 'ssl';
    payload['smtp-sec'] = sec;
    try { localStorage.setItem('smtp_sec', sec); } catch {}

    console.log('[SMTP] Guardar:', payload);
    // TODO: llamada a backend
    smtpForm.querySelector('.btn-save')?.blur();
  });

  /* ============================
     Soporte de deep-link con hash
  ============================ */
  window.addEventListener('hashchange', () => {
    const h = location.hash?.replace('#', '');
    if (!h) return;
    if (document.getElementById(`sec-${h}`)) showSection(h);
  });
});


/* =========================================================
   Almacenamiento — selector de proveedor + persistencia
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const provBar = document.getElementById('stgProviders');
  if (!provBar) return;

  const panes = Array.from(document.querySelectorAll('.stg-pane'));
  const provBtns = Array.from(provBar.querySelectorAll('.prov'));

  const STORAGE_PROVIDER_KEY = 'stg_provider';
  const DEFAULT_PROVIDER = 'gcp';

  // ids por proveedor para persistir
  const FIELDS_BY_PROVIDER = {
    gcp: ['gcp-project','gcp-bucket','gcp-cred'],
    disk:['disk-path'],
    aws: ['aws-bucket','aws-region','aws-key','aws-secret'],
    azure:['az-account','az-container','az-conn']
  };

  function setProvider(p){
    // activar botón
    provBtns.forEach(b=>{
      const is = b.dataset.prov === p;
      b.classList.toggle('is-active', is);
      b.setAttribute('aria-selected', String(is));
    });
    // mostrar pane
    panes.forEach(pane=>{
      pane.hidden = (pane.dataset.for !== p);
    });
    try { localStorage.setItem(STORAGE_PROVIDER_KEY,p); } catch {}
  }

  // click en proveedor
  provBar.addEventListener('click', (e)=>{
    const btn = e.target.closest('.prov');
    if(!btn) return;
    setProvider(btn.dataset.prov);
  });

  // init proveedor
  const savedProv = (()=>{ try{ return localStorage.getItem(STORAGE_PROVIDER_KEY) || DEFAULT_PROVIDER; }catch{return DEFAULT_PROVIDER;} })();
  setProvider(savedProv);

  // cargar valores guardados
  Object.entries(FIELDS_BY_PROVIDER).forEach(([prov, ids])=>{
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      try{
        const v = localStorage.getItem(`alm_${prov}_${id}`);
        if(v !== null){
          if(el.tagName === 'TEXTAREA') el.value = v;
          else el.value = v;
        }
      }catch{}
      el.addEventListener('change', ()=>{
        try{ localStorage.setItem(`alm_${prov}_${id}`, el.value); }catch{}
      });
    });
  });

  // Guardar (demo)
  const almForm = document.getElementById('almForm');
  almForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const p = (()=>{ try{ return localStorage.getItem(STORAGE_PROVIDER_KEY) || DEFAULT_PROVIDER; }catch{return DEFAULT_PROVIDER;} })();
    const payload = { provider: p, values: {} };
    (FIELDS_BY_PROVIDER[p] || []).forEach(id=>{
      const el = document.getElementById(id);
      payload.values[id] = el?.value ?? '';
    });
    console.log('[Almacenamiento] Guardar:', payload);
    // TODO: envía payload a tu backend
    almForm.querySelector('.btn-primary-xl')?.blur();
  });
});


/* =========================================================
   NOTIFICACIONES — persistencia y envío (demo)
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Keys
  const K = {
    enable: 'ntf_enable',
    bcc:    'ntf_bcc',
    rem1:   'ntf_rem1',
    rem2:   'ntf_rem2',
    rem3:   'ntf_rem3',
  };

  // Elementos
  const elEnable = document.getElementById('ntf-enable');
  const elBcc    = document.getElementById('ntf-bcc');
  const elRem1   = document.getElementById('ntf-rem1');
  const elRem2   = document.getElementById('ntf-rem2');
  const elRem3   = document.getElementById('ntf-rem3');
  const fEmail   = document.getElementById('ntfEmailForm');
  const fRem     = document.getElementById('ntfRemForm');

  // Helpers localStorage
  const ls = {
    set:(k,v)=>{ try{ localStorage.setItem(k,v); }catch{} },
    get:(k)=>{ try{ return localStorage.getItem(k); }catch{ return null; } }
  };

  // Cargar estado guardado
  if (elEnable) elEnable.checked = ls.get(K.enable) === '1';
  if (elBcc)    elBcc.value = ls.get(K.bcc) ?? '';

  if (elRem1)   elRem1.value = ls.get(K.rem1) ?? elRem1.value;
  if (elRem2)   elRem2.value = ls.get(K.rem2) ?? elRem2.value;
  if (elRem3)   elRem3.value = ls.get(K.rem3) ?? elRem3.value;

  // Persistir en cambios
  elEnable?.addEventListener('change', ()=> ls.set(K.enable, elEnable.checked ? '1' : '0'));
  elBcc?.addEventListener('change',   ()=> ls.set(K.bcc, elBcc.value.trim()));
  elRem1?.addEventListener('change',  ()=> ls.set(K.rem1, elRem1.value));
  elRem2?.addEventListener('change',  ()=> ls.set(K.rem2, elRem2.value));
  elRem3?.addEventListener('change',  ()=> ls.set(K.rem3, elRem3.value));

  // Guardar (demo): imprime payload; aquí harías tu llamada al backend
  fEmail?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const payload = {
      receiveEmails: elEnable?.checked ?? false,
      bcc: elBcc?.value.trim() ?? ''
    };
    console.log('[Notificaciones > Email] Guardar:', payload);
    fEmail.querySelector('.btn-primary-xl')?.blur();
  });

  fRem?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const payload = {
      first:  elRem1?.value ?? '',
      second: elRem2?.value ?? '',
      third:  elRem3?.value ?? ''
    };
    console.log('[Notificaciones > Recordatorios] Guardar:', payload);
    fRem.querySelector('.btn-primary-xl')?.blur();
  });
});


/* =========================================================
   FIRMA ELECTRÓNICA — lógica UI + persistencia
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  /* ---- Dropzone verificación PDF ---- */
  const dz = document.getElementById('pdfVerify');
  const pdfInput = document.getElementById('pdfFile');

  const openPicker = ()=> pdfInput?.click();
  const setDrag = (on)=> { if(dz) dz.classList.toggle('is-drag', !!on); };

  dz?.addEventListener('click', openPicker);
  dz?.addEventListener('dragover', (e)=>{ e.preventDefault(); setDrag(true); });
  dz?.addEventListener('dragleave', ()=> setDrag(false));
  dz?.addEventListener('drop', (e)=>{
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer?.files?.[0];
    if(!file) return;
    if(file.type !== 'application/pdf'){ alert('Sube un archivo PDF.'); return; }
    console.log('[Firma] Verificar PDF:', file.name, file);
    // TODO: envía al backend para validar
  });
  pdfInput?.addEventListener('change', ()=>{
    const f = pdfInput.files?.[0];
    if(!f) return;
    console.log('[Firma] Verificar PDF:', f.name, f);
    // TODO: envía al backend para validar
    pdfInput.value = '';
  });

  /* ---- Certificados: “Hacer predeterminado” ---- */
  const certTable = document.getElementById('certTable');
  const DEFAULT_KEY = 'sign_cert_default_row';

  function markDefaultRow(tr){
    // quitar estado previo
    certTable?.querySelectorAll('tbody tr').forEach(row=>{
      const pill = row.querySelector('.pill-state');
      const btn  = row.querySelector('.js-make-default') || row.querySelector('.btn-chip');
      if(pill) pill.remove();
      if(btn){ btn.disabled = false; btn.classList.add('js-make-default'); }
    });
    // marcar nuevo
    const stateTd = tr.children[2];
    const pill = document.createElement('span');
    pill.className = 'pill-state is-default';
    pill.textContent = 'Predeterminado';
    stateTd.appendChild(pill);

    const actionsTd = tr.querySelector('.t-actions');
    const btn = actionsTd?.querySelector('button');
    if(btn){ btn.disabled = true; btn.classList.remove('js-make-default'); }

    // guardar
    try{ localStorage.setItem(DEFAULT_KEY, tr.getAttribute('data-id') || 'trust'); }catch{}
  }

  // restaurar default guardado
  (function restoreDefault(){
    const saved = (()=>{ try{return localStorage.getItem(DEFAULT_KEY);}catch{return null;}})();
    if(!saved) return;
    const tr = certTable?.querySelector(`tbody tr[data-id="${saved}"]`);
    if(tr){ markDefaultRow(tr); }
  })();

  certTable?.addEventListener('click', (e)=>{
    const btn = e.target.closest('.js-make-default');
    if(!btn) return;
    const tr = btn.closest('tr');
    if(!tr) return;
    markDefaultRow(tr);
    console.log('[Firma] Certificado predeterminado ->', tr.getAttribute('data-id') || 'trust');
  });

  // Botón “Subir certificado” (placeholder)
  document.getElementById('btnUploadCert')?.addEventListener('click', ()=>{
    // Abre un <input type=file> temporal para demo
    const f = document.createElement('input');
    f.type = 'file';
    f.accept = '.pem,.crt,.cer,.p12,.pfx';
    f.onchange = ()=> {
      const file = f.files?.[0];
      if(file) console.log('[Firma] Subir certificado:', file.name);
      // TODO: subir a backend y refrescar tabla
    };
    f.click();
  });

  /* ---- TSA URL ---- */
  const TSA_KEY = 'sign_tsa_url';
  const tsaForm = document.getElementById('tsaForm');
  const tsaUrl  = document.getElementById('tsaUrl');

  // restaurar
  if(tsaUrl){
    try{
      const val = localStorage.getItem(TSA_KEY);
      if(val !== null) tsaUrl.value = val;
    }catch{}
  }
  tsaUrl?.addEventListener('change', ()=>{ try{ localStorage.setItem(TSA_KEY, tsaUrl.value.trim()); }catch{} });

  tsaForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const payload = { tsaUrl: tsaUrl?.value.trim() || '' };
    console.log('[Firma] Guardar TSA:', payload);
    // TODO: enviar al backend
    tsaForm.querySelector('.btn-primary-xl')?.blur();
  });

  /* ---- Preferencias ---- */
  const PREFS = {
    multi:   'sp-multi',
    flatten: 'sp-flatten',
    fname:   'sp-filename'
  };

  const spMulti   = document.getElementById('sp-multi');
  const spFlatten = document.getElementById('sp-flatten');
  const spFname   = document.getElementById('sp-filename');
  const spForm    = document.getElementById('signPrefsForm');

  // restaurar
  try{ spMulti.checked   = (localStorage.getItem(PREFS.multi)   === '1'); }catch{}
  try{ spFlatten.checked = (localStorage.getItem(PREFS.flatten) === '1'); }catch{}
  try{
    const sv = localStorage.getItem(PREFS.fname);
    if(sv) spFname.value = sv;
  }catch{}

  spMulti?.addEventListener('change',   ()=>{ try{ localStorage.setItem(PREFS.multi,   spMulti.checked?'1':'0'); }catch{} });
  spFlatten?.addEventListener('change', ()=>{ try{ localStorage.setItem(PREFS.flatten, spFlatten.checked?'1':'0'); }catch{} });
  spFname?.addEventListener('change',   ()=>{ try{ localStorage.setItem(PREFS.fname,   spFname.value); }catch{} });

  spForm?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const payload = {
      multipleSignatures: spMulti?.checked ?? false,
      flattenPdf:         spFlatten?.checked ?? false,
      filenameFormat:     spFname?.value ?? 'docname.pdf'
    };
    console.log('[Firma] Guardar preferencias:', payload);
    // TODO: enviar al backend
    spForm.querySelector('.btn-primary-xl')?.blur();
  });
});
// ---------- Personalización: acordeones ----------
document.querySelectorAll('#sec-personalizacion .acc-head').forEach(head=>{
  head.addEventListener('click', ()=>{
    const id = head.dataset.acc;
    const panel = document.getElementById(id);
    const open = !panel.hasAttribute('hidden');

    // cerrar hermanos del mismo grupo
    const group = head.parentElement;
    group.querySelectorAll('.acc-panel').forEach(p=>p.setAttribute('hidden',''));
    group.querySelectorAll('.acc-head').forEach(h=>h.classList.remove('is-open'));

    // alternar actual
    if (!open){
      panel.removeAttribute('hidden');
      head.classList.add('is-open');
    }
  });
});

// ---------- Editor de plantillas (toggle Text/HTML + guardar en localStorage) ----------
function bindTplEditor(prefixKey, subjId, textId, htmlId){
  const subj   = document.getElementById(subjId);
  const taText = document.getElementById(textId);
  const taHtml = document.getElementById(htmlId);

  // Cargar guardados
  try{
    const s = localStorage.getItem(prefixKey + '_subject');
    const t = localStorage.getItem(prefixKey + '_text');
    const h = localStorage.getItem(prefixKey + '_html');
    if (s !== null && subj)   subj.value = s;
    if (t !== null && taText) taText.value = t;
    if (h !== null && taHtml) taHtml.value = h;
  }catch{}

  const editor = (taText?.closest('.editor') || taHtml?.closest('.editor'));
  editor?.querySelectorAll('.et-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      editor.querySelectorAll('.et-btn').forEach(b=>b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const mode = btn.dataset.mode;
      taText.hidden = mode !== 'text';
      taHtml.hidden = mode !== 'html';
    });
  });

  editor?.querySelector('.btn-save')?.addEventListener('click', ()=>{
    try{
      localStorage.setItem(prefixKey + '_subject', subj?.value ?? '');
      localStorage.setItem(prefixKey + '_text',    taText?.value ?? '');
      localStorage.setItem(prefixKey + '_html',    taHtml?.value ?? '');
    }catch{}
    console.log('[Personalización] Guardado:', prefixKey);
  });
}

bindTplEditor('tpl_signature_request', 'sr-subject', 'sr-body-text', 'sr-body-html');
bindTplEditor('tpl_form_completed',   'fc-subject', 'fc-body-text', 'fc-body-html');

// ---------- Logo empresa (preview + persistencia opcional) ----------
(function(){
  const brandBtn  = document.getElementById('brandLogoBtn');
  const brandFile = document.getElementById('brandLogoFile');
  const brandImg  = document.getElementById('brandLogoImg');

  function preview(file){
    const url = URL.createObjectURL(file);
    brandImg.src = url;
    // Guardar como dataURL (opcional)
    const reader = new FileReader();
    reader.onload = ()=>{ try{ localStorage.setItem('brand_logo_dataurl', reader.result); }catch{} };
    reader.readAsDataURL(file);
  }

  brandBtn?.addEventListener('click', ()=> brandFile?.click());
  brandFile?.addEventListener('change', ()=>{
    const f = brandFile.files?.[0];
    if(!f) return;
    preview(f);
  });

  // Cargar guardado si existe
  try{
    const data = localStorage.getItem('brand_logo_dataurl');
    if (data) brandImg.src = data;
  }catch{}
})();

// ---------- Formulario de envío (campos simples + confeti) ----------
(function(){
  const ids = ['fm-body','fr-text','fr-url','fl-privacy','fl-terms','fc-css'];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    try{
      const sv = localStorage.getItem('pers_' + id);
      if (sv !== null) el.value = sv;
    }catch{}
    el.addEventListener('input', ()=>{
      try{ localStorage.setItem('pers_' + id, el.value); }catch{}
    });
  });

  const confetti = document.getElementById('pf-confetti');
  if (confetti){
    try{
      const sv = localStorage.getItem('form_confetti');
      if (sv !== null) confetti.checked = sv === '1';
    }catch{}
    confetti.addEventListener('change', ()=>{
      try{ localStorage.setItem('form_confetti', confetti.checked ? '1' : '0'); }catch{}
    });
  }

  // Botones GUARDAR dentro de cada panel
  document.querySelectorAll('#sec-personalizacion .acc-panel .btn-save')
    .forEach(btn=>btn.addEventListener('click', ()=> btn.blur()));
})();

//USUARIOS//

document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('usersTbody');
  if (!tableBody) return; // La sección no está en esta página

  // ⚠️ DESACTIVADO: Ahora users.js maneja esto con el backend real
  console.warn('⚠️ settings.js: Gestión de usuarios desactivada - usa users.js');
  return;
  
  const btnNew    = document.getElementById('btnNewUser');

  const umodal    = document.getElementById('userModal');
  const umClose   = document.getElementById('umClose');
  const umCancel  = document.getElementById('umCancel');
  const umSubmit  = document.getElementById('umSubmit');

  const fId    = document.getElementById('um-id');
  const fFirst = document.getElementById('um-first');
  const fLast  = document.getElementById('um-last');
  const fMail  = document.getElementById('um-email');
  const fPass  = document.getElementById('um-pass');
  const fRole  = document.getElementById('um-role');
  const umTitle= document.getElementById('um-title');

  const LS_KEY = 'demo_users_list';

  // ---------- Estado único
  let users = loadUsers();
  saveUsers(users); // asegura que exista en LS

  // ---------- Storage helpers
  function loadUsers() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    // semilla
    return [{
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      first: 'PKI', last: 'SERVICES',
      email: 'info@pkiservices.co',
      role: 'superadmin',
      lastLogin: '15 de oct 13:55'
    }];
  }

  function saveUsers(list){
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
  }

  // ---------- UI helpers
  function rolePill(role){
    const map = {
      superadmin: { cls: 'role-superadmin', label: 'Superadministrador' },
      admin:      { cls: 'role-admin',      label: 'Administrador' },
      editor:     { cls: 'role-editor',     label: 'Colaborador' },
      viewer:     { cls: 'role-viewer',     label: 'Lector' },
    };
    const r = map[role] || map.viewer;
    return `<span class="role-pill ${r.cls}">${r.label}</span>`;
  }

  function render(){
    tableBody.innerHTML = users.map(u => `
      <tr>
        <td>${u.first} ${u.last}</td>
        <td>${u.email}</td>
        <td>${rolePill(u.role)}</td>
        <td>${u.lastLogin || '—'}</td>
        <td style="text-align:right">
          <button class="user-action js-edit" data-id="${u.id}">Editar</button>
        </td>
      </tr>
    `).join('');
  }

  function openModal(mode='new', user=null){
    umodal.style.display = 'flex';
    umodal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';

    umTitle.textContent = mode === 'edit' ? 'Editar usuario' : 'Nuevo usuario';
    if (mode === 'edit' && user){
      fId.value    = user.id;
      fFirst.value = user.first;
      fLast.value  = user.last;
      fMail.value  = user.email;
      fPass.value  = '';                // por seguridad no se muestra
      fRole.value  = user.role || 'admin';
    } else {
      fId.value = '';
      fFirst.value = '';
      fLast.value  = '';
      fMail.value  = '';
      fPass.value  = '';
      fRole.value  = 'admin';
    }
  }

  function closeModal(){
    umodal.style.display = 'none';
    umodal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  // ---------- Eventos
  btnNew?.addEventListener('click', ()=> openModal('new'));

  // Delegación de eventos: detecta el botón Editar por clase y usa data-id
  tableBody.addEventListener('click', (e)=>{
    const btn = e.target.closest('.js-edit');
    if (!btn) return;
    const id = btn.dataset.id;
    const u = users.find(x=>x.id === id);
    if (u) openModal('edit', u);
  });

  umClose?.addEventListener('click', closeModal);
  umCancel?.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });
  umodal?.addEventListener('click', (e)=>{ if(e.target === umodal) closeModal(); });
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && umodal.style.display==='flex') closeModal(); });

  umSubmit?.addEventListener('click', (e)=>{
    e.preventDefault();

    if(!fFirst.value.trim() || !fLast.value.trim() || !fMail.value.trim()){
      alert('Completa nombre, apellido y correo.'); return;
    }

    const now = new Date();
    const payload = {
      id: fId.value || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      first: fFirst.value.trim(),
      last:  fLast.value.trim(),
      email: fMail.value.trim(),
      role:  fRole.value,
      lastLogin: now.toLocaleDateString('es-CO', { day:'2-digit', month:'short' }) + ' ' +
                 now.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' })
    };

    const idx = users.findIndex(x=>x.id === payload.id);
    if (idx >= 0) {
      users[idx] = { ...users[idx], ...payload };
    } else {
      users.push(payload);
    }

    saveUsers(users);
    render();
    closeModal();

    // Aquí harías la llamada real al backend (PUT/POST).
  });

  // ---------- Init
  render();
});

// ============================
// Inquilinos (demo con localStorage)
// ============================
(function () {
  const key = 'demo_tenants';
  const tListEl = document.getElementById('tenantList');
  const mDocs = document.getElementById('tm-docs');
  const mTemplates = document.getElementById('tm-templates');
  const mUsers = document.getElementById('tm-users');
  const mTenants = document.getElementById('tm-tenants');

  // -------- helpers storage
  function cryptoId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function loadTenants() {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {}
    const seed = [
      {
        id: cryptoId(),
        name: 'Pki Teem',
        slug: 'pki-team',
        email: 'info@pkiservices.co',
        lang: 'es',
        tz: 'America/Bogota',
        inheritStorage: true,
        inheritBrand: true,
        metrics: { docs: 204, templates: 23, users: 1 },
        logo: null
      }
    ];
    saveTenants(seed);
    return seed;
  }
  function saveTenants(list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch {}
  }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let tenants = loadTenants();

  // -------- render
  function renderMetrics() {
    const totals = tenants.reduce(
      (acc, t) => {
        acc.docs += t.metrics?.docs || 0;
        acc.templates += t.metrics?.templates || 0;
        acc.users += t.metrics?.users || 0;
        return acc;
      },
      { docs: 0, templates: 0, users: 0 }
    );
    if (mDocs) mDocs.textContent = totals.docs;
    if (mTemplates) mTemplates.textContent = totals.templates;
    if (mUsers) mUsers.textContent = totals.users;
    if (mTenants) mTenants.textContent = tenants.length;
  }

  function renderList() {
    if (!tListEl) return;
    tListEl.innerHTML = '';
    tenants.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'tt-row';
      row.innerHTML = `
        <div class="tt-col name">${escapeHtml(t.name)}</div>
        <div class="tt-col actions">
          <button class="pill-action" data-action="logo" data-id="${t.id}">LOGOTIPO</button>
          <button class="pill-action" data-action="edit" data-id="${t.id}">EDITAR</button>
          <button class="pill-action" data-action="view" data-id="${t.id}">VISTA</button>
        </div>
      `;
      tListEl.appendChild(row);
    });
  }

  // -------- util modales (clase .show en CSS)
  function showModal(mod) {
    mod?.classList.add('show');
    mod?.setAttribute('aria-hidden', 'false');
  }
  function hideModal(mod) {
    mod?.classList.remove('show');
    mod?.setAttribute('aria-hidden', 'true');
  }

  // ----- CREAR
  const btnNew = document.getElementById('tNewBtn');
  const createModal = document.getElementById('tenantCreateModal');
  const createClose = createModal?.querySelector('[data-close="tc"]');
  const createBtn = document.getElementById('tc-create');

  function openCreateModal() {
    if (!createModal) return;
    document.getElementById('tc-name').value = '';
    document.getElementById('tc-sub').value = '';
    document.getElementById('tc-email').value = '';
    document.getElementById('tc-lang').value = 'es';
    document.getElementById('tc-tz').value = 'America/Bogota';
    document.getElementById('tc-inherit-storage').checked = true;
    document.getElementById('tc-inherit-brand').checked = true;
    showModal(createModal);
    setTimeout(() => document.getElementById('tc-name').focus(), 30);
  }

  btnNew?.addEventListener('click', openCreateModal);
  createClose?.addEventListener('click', () => hideModal(createModal));
  createModal?.addEventListener('click', (e) => {
    if (e.target === createModal) hideModal(createModal);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal(createModal);
  });

  createBtn?.addEventListener('click', () => {
    const name = document.getElementById('tc-name').value.trim();
    const slug = document.getElementById('tc-sub').value.trim();
    if (!name || !slug) {
      document.getElementById('tc-name').focus();
      return;
    }
    const item = {
      id: cryptoId(),
      name,
      slug,
      email: document.getElementById('tc-email').value.trim(),
      lang: document.getElementById('tc-lang').value,
      tz: document.getElementById('tc-tz').value,
      inheritStorage: document.getElementById('tc-inherit-storage').checked,
      inheritBrand: document.getElementById('tc-inherit-brand').checked,
      metrics: { docs: 0, templates: 0, users: 0 },
      logo: null
    };
    tenants = [item, ...tenants];
    saveTenants(tenants);
    renderMetrics();
    renderList();
    hideModal(createModal);
  });

  // ----- EDITAR
  const editModal = document.getElementById('tenantEditModal');
  const editClose = editModal?.querySelector('[data-close="te"]');
  const editSave = document.getElementById('te-save');

  function openEditModal(t) {
    if (!editModal) return;
    document.getElementById('te-id').value = t.id;
    document.getElementById('te-name').value = t.name;
    document.getElementById('te-sub').value = t.slug;
    document.getElementById('te-email').value = t.email || '';
    document.getElementById('te-lang').value = t.lang || 'es';
    document.getElementById('te-tz').value = t.tz || 'America/Bogota';
    document.getElementById('te-inherit-storage').checked = !!t.inheritStorage;
    document.getElementById('te-inherit-brand').checked = !!t.inheritBrand;
    showModal(editModal);
    setTimeout(() => document.getElementById('te-name').focus(), 30);
  }

  editClose?.addEventListener('click', () => hideModal(editModal));
  editModal?.addEventListener('click', (e) => {
    if (e.target === editModal) hideModal(editModal);
  });

  editSave?.addEventListener('click', () => {
    const id = document.getElementById('te-id').value;
    const idx = tenants.findIndex((x) => x.id === id);
    if (idx < 0) return;
    tenants[idx].name = document.getElementById('te-name').value.trim();
    tenants[idx].slug = document.getElementById('te-sub').value.trim();
    tenants[idx].email = document.getElementById('te-email').value.trim();
    tenants[idx].lang = document.getElementById('te-lang').value;
    tenants[idx].tz = document.getElementById('te-tz').value;
    tenants[idx].inheritStorage = document.getElementById('te-inherit-storage').checked;
    tenants[idx].inheritBrand = document.getElementById('te-inherit-brand').checked;
    saveTenants(tenants);
    renderList();
    hideModal(editModal);
  });

  // ----- LOGO
  const logoModal = document.getElementById('tenantLogoModal');
  const logoClose = logoModal?.querySelector('[data-close="tl"]');
  const logoPick = document.getElementById('tl-pick');
  const logoFile = document.getElementById('tl-file');
  const logoSave = document.getElementById('tl-save');
  const logoPrev = document.getElementById('tl-preview')?.querySelector('img');
  let currentLogoTenantId = null;

  function openLogoModal(t) {
    if (!logoModal) return;
    currentLogoTenantId = t.id;
    if (t.logo && logoPrev) {
      logoPrev.src = t.logo;
      document.getElementById('tl-preview').hidden = false;
    } else {
      logoPrev?.removeAttribute('src');
      document.getElementById('tl-preview').hidden = true;
    }
    showModal(logoModal);
  }

  logoClose?.addEventListener('click', () => hideModal(logoModal));
  logoModal?.addEventListener('click', (e) => {
    if (e.target === logoModal) hideModal(logoModal);
  });

  logoPick?.addEventListener('click', () => logoFile?.click());
  logoFile?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (logoPrev) {
        logoPrev.src = reader.result;
        document.getElementById('tl-preview').hidden = false;
      }
    };
    reader.readAsDataURL(file);
  });

  logoSave?.addEventListener('click', () => {
    if (!currentLogoTenantId || !logoPrev?.src) return;
    const idx = tenants.findIndex((x) => x.id === currentLogoTenantId);
    if (idx < 0) return;
    tenants[idx].logo = logoPrev.src; // DEMO: guarda DataURL; en prod -> subir y guardar URL
    saveTenants(tenants);
    hideModal(logoModal);
  });

  // eventos de acciones en lista
  tListEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const t = tenants.find((x) => x.id === id);
    if (!t) return;

    switch (btn.dataset.action) {
      case 'logo':
        openLogoModal(t);
        break;
      case 'edit':
        openEditModal(t);
        break;
      case 'view':
        alert(`Vista del inquilino: ${t.name} (${t.slug})`);
        break;
    }
  });

  // inicial
  renderMetrics();
  renderList();
})();

/* ============================
   PERMISOS: Ocultar secciones según rol
============================ */
(function applyRolePermissions() {
  // Esperar a que permissions esté disponible
  if (!window.permissions) {
    console.warn('⚠️ window.permissions no disponible aún');
    setTimeout(applyRolePermissions, 100);
    return;
  }

  const currentUser = window.permissions.getCurrentUser();
  if (!currentUser) {
    console.warn('⚠️ Usuario no encontrado');
    return;
  }

  const userRole = currentUser.role_name;
  console.log('🔐 Aplicando permisos de configuración para:', userRole);

  // Admin y Tenant Admin: solo pueden ver Perfil e Inquilinos
  if (userRole === 'Admin' || userRole === 'Tenant Admin') {
    const allowedSections = ['perfil', 'inquilinos'];
    
    // Ocultar botones del sidebar que no están permitidos
    document.querySelectorAll('#settingsNav .sn-item').forEach(btn => {
      const section = btn.dataset.section;
      if (!allowedSections.includes(section)) {
        btn.style.display = 'none';
        console.log('🔒 Sección oculta:', section);
      }
    });

    // Ocultar también las secciones del contenido
    document.querySelectorAll('.set-section').forEach(sec => {
      const sectionId = sec.id.replace('sec-', '');
      if (!allowedSections.includes(sectionId)) {
        sec.style.display = 'none';
      }
    });

    console.log('✅ Permisos aplicados: Solo Perfil e Inquilinos visibles');
  } else {
    console.log('✅ Superadministrador: Acceso completo a todas las secciones');
  }
})();


  // Cerrar el dropdown al hacer clic fuera
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('userMenu');
    if (!dd) return;
    if (!dd.contains(e.target)) dd.removeAttribute('open');
  });

  // Cerrar sesión (usa permissions.logout si existe; si no, limpia storage)
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#logoutBtn')) return;
    try { if (window.permissions?.logout) await window.permissions.logout(); } catch {}
    try {
      localStorage.removeItem('auth_user');
      localStorage.removeItem('current_user');
      localStorage.removeItem('token');
    } catch {}
    location.href = '/login.html';
  });

  // (Opcional) iniciales en el avatar si tienes permissions.js
  document.addEventListener('DOMContentLoaded', () => {
    try { window.permissions?.updateAllAvatars?.(); } catch {}
  });
