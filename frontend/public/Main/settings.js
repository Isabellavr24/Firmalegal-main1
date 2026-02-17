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
     EMAIL CONFIG (SENDGRID) - Configuración por Usuario
  ============================ */

  // Obtener usuario actual
  function getCurrentUser() {
    try {
      const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
      if (!userStr) return null;
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  // Toast notification system
  function showToast(type, message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#ff9800'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 10000;
      font-weight: 500;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Cargar configuración del usuario
  async function loadEmailConfig() {
    const user = getCurrentUser();
    if (!user) {
      console.error('No hay usuario autenticado');
      return;
    }

    try {
      console.log('🔄 Cargando configuración de email para user_id:', user.user_id);
      const response = await fetch(`/api/email-config?user_id=${user.user_id}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      console.log('📧 Respuesta del servidor:', data);

      if (data.success && data.configured) {
        // Llenar formulario con datos guardados (sin API Key por seguridad)
        const emailFromInput = document.getElementById('email-from');
        const emailFromNameInput = document.getElementById('email-from-name');
        const apiKeyInput = document.getElementById('sendgrid-api-key');

        if (emailFromInput) emailFromInput.value = data.data.email_from;
        if (emailFromNameInput) emailFromNameInput.value = data.data.email_from_name;
        if (apiKeyInput) apiKeyInput.placeholder = '••••••••••••••••••••••••••••';

        // Mostrar badge de configuración guardada
        const statusDiv = document.getElementById('emailConfigStatus');
        if (statusDiv) statusDiv.style.display = 'block';

        console.log('✅ Configuración de email cargada:', data.data.email_from);
      } else {
        console.log('⚠️ No hay configuración de email para este usuario');
      }
    } catch (error) {
      console.error('❌ Error al cargar configuración:', error);
    }
  }

  // Guardar configuración
  const smtpForm = document.getElementById('smtpForm');
  smtpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = getCurrentUser();
    if (!user) {
      showToast('error', 'No hay usuario autenticado');
      return;
    }

    const apiKey = document.getElementById('sendgrid-api-key').value.trim();
    const emailFrom = document.getElementById('email-from').value.trim();
    const emailFromName = document.getElementById('email-from-name').value.trim();

    // Validaciones
    if (!apiKey || !emailFrom || !emailFromName) {
      showToast('error', 'Todos los campos son requeridos');
      return;
    }

    if (!apiKey.startsWith('SG.')) {
      showToast('error', 'La API Key debe comenzar con "SG."');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailFrom)) {
      showToast('error', 'El formato del email es inválido');
      return;
    }

    const saveBtn = document.getElementById('saveEmailBtn');
    if (saveBtn) {
      saveBtn.textContent = 'GUARDANDO...';
      saveBtn.disabled = true;
    }

    try {
      const response = await fetch('/api/email-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sendgrid_api_key: apiKey,
          email_from: emailFrom,
          email_from_name: emailFromName,
          user_id: user.user_id
        })
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', '✓ Configuración guardada exitosamente');

        // Mostrar badge de éxito
        const statusDiv = document.getElementById('emailConfigStatus');
        if (statusDiv) statusDiv.style.display = 'block';

        // Limpiar API Key por seguridad
        document.getElementById('sendgrid-api-key').value = '';
        document.getElementById('sendgrid-api-key').placeholder = '••••••••••••••••••••••••••••';

        console.log('✅ Configuración guardada:', data);
      } else {
        showToast('error', data.error || 'Error al guardar configuración');
      }
    } catch (error) {
      console.error('❌ Error:', error);
      showToast('error', 'Error de conexión con el servidor');
    } finally {
      if (saveBtn) {
        saveBtn.textContent = 'GUARDAR CONFIGURACIÓN';
        saveBtn.disabled = false;
      }
    }
  });

  // Botón de prueba
  const testEmailBtn = document.getElementById('testEmailBtn');
  testEmailBtn?.addEventListener('click', async () => {
    const user = getCurrentUser();
    if (!user) {
      showToast('error', 'No hay usuario autenticado');
      return;
    }

    const emailFrom = document.getElementById('email-from').value.trim();
    if (!emailFrom) {
      showToast('error', 'Primero guarda tu configuración de email');
      return;
    }

    // Pedir email de destino
    const testEmail = prompt('¿A qué email quieres enviar la prueba?', emailFrom);
    if (!testEmail) return;

    testEmailBtn.textContent = 'ENVIANDO...';
    testEmailBtn.disabled = true;

    try {
      const response = await fetch('/api/email-config/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: testEmail,
          user_id: user.user_id
        })
      });

      const data = await response.json();

      if (data.success) {
        showToast('success', `✓ Email de prueba enviado a ${testEmail}`);
        alert(`Email enviado exitosamente!\n\nRevisa tu bandeja de entrada en: ${testEmail}\n\n(Puede tardar 1-2 minutos. Revisa también Spam/Correo no deseado)`);
      } else {
        showToast('error', data.error || 'Error al enviar email');
        alert(`Error: ${data.error}\n\n${data.details ? JSON.stringify(data.details, null, 2) : ''}`);
      }
    } catch (error) {
      console.error('❌ Error:', error);
      showToast('error', 'Error de conexión con el servidor');
    } finally {
      testEmailBtn.textContent = 'PROBAR EMAIL';
      testEmailBtn.disabled = false;
    }
  });

  // Cargar configuración al iniciar
  loadEmailConfig();

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

  // ========================================
  // GESTIÓN DE CERTIFICADOS DIGITALES
  // ========================================

  /**
   * Verificar estado del certificado al cargar la página
   */
  async function checkCertificateStatus() {
    try {
      const response = await fetch('/api/certificates/status');
      const data = await response.json();
      
      const statusBox = document.getElementById('certStatus');
      const statusTitle = document.getElementById('certStatusTitle');
      const statusDetails = document.getElementById('certStatusDetails');
      
      if (!statusBox || !statusTitle || !statusDetails) return;
      
      statusBox.style.display = 'block';
      
      if (data.certificateAvailable) {
        // Certificado activo
        statusBox.style.background = '#e8f5e9';
        statusBox.style.border = '1.5px solid #81c784';
        statusTitle.innerHTML = '<svg style="width:16px;height:16px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Certificado digital activo';
        statusTitle.style.color = '#2e7d32';
        
        const info = data.certificateInfo;
        const validUntil = new Date(info.validTo).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        // Calcular días hasta expiración
        const daysUntilExpiration = Math.ceil((new Date(info.validTo) - new Date()) / (1000 * 60 * 60 * 24));
        const expirationWarning = daysUntilExpiration <= 30 
          ? `<span style="color: #e65100; font-weight: bold;"><svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#e65100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Expira en ${daysUntilExpiration} días</span>`
          : `<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Válido`;
        
        statusDetails.innerHTML = `
          <p style="margin: 8px 0 0 0; color: #6d6270; font-size: .9rem;">
            <strong>Emisor:</strong> ${info.issuer?.split(',')[0] || 'PKI Services'}<br>
            <strong>Válido hasta:</strong> ${validUntil} ${expirationWarning}<br>
            <strong>TSA configurado:</strong> ${data.tsaUrl ? '<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Sí' : '<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#e65100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> No configurado'}
          </p>
        `;
      } else {
        // Sin certificado
        statusBox.style.background = '#fff3e0';
        statusBox.style.border = '1.5px solid #ffb74d';
        statusTitle.innerHTML = '<svg style="width:16px;height:16px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#e65100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Sin certificado digital';
        statusTitle.style.color = '#e65100';
        
        statusDetails.innerHTML = `
          <p style="margin: 8px 0 0 0; color: #6d6270; font-size: .9rem;">
            Sube tu certificado <strong>P12 o PFX</strong> para habilitar firmas digitales con timestamp.<br>
            Las firmas digitales garantizan la autenticidad e integridad de tus documentos.
          </p>
        `;
      }
    } catch (error) {
      console.error('❌ Error al verificar certificado:', error);
      
      const statusBox = document.getElementById('certStatus');
      const statusTitle = document.getElementById('certStatusTitle');
      const statusDetails = document.getElementById('certStatusDetails');
      
      if (statusBox && statusTitle && statusDetails) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#ffebee';
        statusBox.style.border = '1.5px solid #ef5350';
        statusTitle.innerHTML = '<svg style="width:16px;height:16px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#c62828" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Error de conexión';
        statusTitle.style.color = '#c62828';
        statusDetails.innerHTML = `
          <p style="margin: 8px 0 0 0; color: #6d6270; font-size: .9rem;">
            No se pudo verificar el estado del certificado. Verifica tu conexión al servidor.
          </p>
        `;
      }
    }
  }

  /**
   * Subir certificado P12/PFX
   */
  const certUploadForm = document.getElementById('certUploadForm');
  certUploadForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const fileInput = document.getElementById('certFile');
    const passwordInput = document.getElementById('certPassword');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!fileInput.files[0]) {
      alert('Por favor selecciona un archivo P12 o PFX');
      return;
    }
    
    // Validar extensión
    const fileName = fileInput.files[0].name.toLowerCase();
    if (!fileName.endsWith('.p12') && !fileName.endsWith('.pfx')) {
      alert('El archivo debe ser .p12 o .pfx');
      return;
    }

    // Validar tamaño (5 MB máximo)
    const maxSize = 5 * 1024 * 1024;
    if (fileInput.files[0].size > maxSize) {
      alert('El archivo es demasiado grande (máximo 5 MB)');
      return;
    }
    
    // Mostrar loading
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'CARGANDO...';
    submitBtn.style.opacity = '0.6';
    
    const formData = new FormData();
    formData.append('certificate', fileInput.files[0]);
    formData.append('password', passwordInput.value);
    
    try {
      const response = await fetch('/api/certificates/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('Certificado cargado exitosamente\n\n' +
              'Tu sistema ahora firmará PDFs digitalmente\n' +
              'Se agregará timestamp automáticamente\n' +
              'Las firmas serán válidas en Adobe Reader');
        
        // Limpiar formulario
        fileInput.value = '';
        passwordInput.value = '';
        
        // Actualizar estado
        await checkCertificateStatus();
      } else {
        alert('Error al cargar certificado:\n\n' +
              (data.error || 'Error desconocido') + '\n\n' +
              'Verifica que:\n' +
              '• El archivo sea un certificado válido P12/PFX\n' +
              '• La contraseña sea correcta\n' +
              '• El certificado no esté expirado');
      }
    } catch (error) {
      alert('Error de conexión:\n\n' + error.message + '\n\n' +
            'Verifica que el servidor esté funcionando correctamente.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      submitBtn.style.opacity = '1';
    }
  });

  /**
   * Configurar URL del TSA (Time Stamping Authority)
   */
  const tsaForm = document.getElementById('tsaForm');
  tsaForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tsaUrlInput = document.getElementById('tsaUrl');
    const tsaUrl = tsaUrlInput.value.trim();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    
    if (!tsaUrl) {
      alert('Por favor introduce la URL del servidor de timestamp (TSA)');
      return;
    }

    // Validar que sea una URL válida
    try {
      new URL(tsaUrl);
    } catch (error) {
      alert('La URL del TSA no es válida\n\n' +
            'Formato esperado: https://example.com/tsa');
      return;
    }
    
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'GUARDANDO...';
    submitBtn.style.opacity = '0.6';
    
    try {
      const response = await fetch('/api/certificates/tsa-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tsaUrl })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('URL del TSA configurada correctamente\n\n' +
              'Todas las firmas digitales incluirán timestamp\n' +
              'URL: ' + tsaUrl);
        
        // Actualizar estado
        await checkCertificateStatus();
      } else {
        alert('Error al configurar TSA:\n\n' + (data.error || 'Error desconocido'));
      }
    } catch (error) {
      alert('Error de conexión:\n\n' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      submitBtn.style.opacity = '1';
    }
  });

  /**
   * Verificar certificado al cargar la página de configuración
   */
  if (document.getElementById('certUploadForm')) {
    console.log('🔐 Verificando estado del certificado digital...');
    checkCertificateStatus();
  }

  // ========================================
  // FIN GESTIÓN DE CERTIFICADOS DIGITALES
  // ========================================

