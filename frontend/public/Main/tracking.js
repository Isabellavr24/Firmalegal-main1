/*********************************************************
 * TRACKING VIEW - SISTEMA DE SEGUIMIENTO DE DOCUMENTOS
 * v20260317b
 **********************************************************/
console.log('🔖 tracking.js v20260317b cargado');

// ====== VARIABLES GLOBALES ======
let currentDocumentType = 'normal'; // ✅ Tipo de documento actual: 'normal' o 'pagare'
let _viOwnerVinculado = null; // Cache: null=no consultado, true/false

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

// ====== OBTENER DATOS DE LA URL ======
function toggleFinalSigner() {
  var toggle = document.getElementById('finalSignerToggle');
  var knob = document.getElementById('finalSignerToggleKnob');
  var fields = document.getElementById('finalSignerFields');
  var label = document.getElementById('finalSignerToggleLabel');
  if (!toggle) return;
  var active = toggle.dataset.active === 'true';
  active = !active;
  toggle.dataset.active = active ? 'true' : 'false';
  toggle.style.background = active ? '#2b0e31' : '#d1d5db';
  knob.style.left = active ? '18px' : '2px';
  fields.style.display = active ? 'block' : 'none';
  label.textContent = active
    ? 'Con firmante definitivo — recibirá notificación para sellar todos los pagarés'
    : 'Sin firmante definitivo — los pagarés se sellarán automáticamente cuando todos firmen';
}

function getDocumentDataFromURL() {
  const params = new URLSearchParams(window.location.search);
  const documentType = params.get('type') || 'normal'; // ✅ Capturar tipo de documento

  console.log(`📋 Tipo de documento desde URL: ${documentType}`);

  return {
    id: params.get('id') || params.get('docId') || 'demo-doc-1', // Soportar ?id= y ?docId=
    name: params.get('name') || 'Documento',
    folder: params.get('folder') || 'Mis Plantillas',
    type: documentType // ✅ Agregar tipo
  };
}

// ====== DATOS DEMO ======
const demoData = {
  document: {
    id: 'demo-doc-1',
    name: 'contrato de arrendamiento 2DO PISO',
    folder: 'Pki Services',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-20')
  },
  recipients: [
    {
      id: 'rec-1',
      emails: [
        'solucionesintegralipssas@gmail.com',
        'logisticasuministrosls@gmail.com',
        'inversionesgarciapalomares@gmail.com',
        'maho.1991.maro@gmail.com',
        'teacherlorenapalomares@gmail.com',
        'jmotta30@yahoo.es',
        'nancyealonso@hotmail.com',
        'jorgecafetunja@gmail.com'
      ],
      status: 'completed',
      sentAt: new Date('2024-01-16'),
      completedAt: new Date('2024-01-20')
    }
  ]
};

// ====== RENDERIZAR DESTINATARIOS ======
function renderRecipients(recipients, tvGuidsByGroup, pagareSealed) {
  // tvGuidsByGroup: { viewer_group_id: guid, ... } o null/{}
  if (!tvGuidsByGroup || typeof tvGuidsByGroup !== 'object') tvGuidsByGroup = {};
  // Compatibilidad: si se pasa string (legado), ignorar
  const tvGuid = null; // no usado directamente, se usa por grupo
  const container = document.getElementById('recipientsContainer');
  const emptyState = document.getElementById('emptyState');

  if (!recipients || recipients.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  container.style.display = 'block';
  emptyState.style.display = 'none';
  container.innerHTML = '';

  // Separar firmante definitivo, viewers de pagaré y recipients normales
  const finalSigner = recipients.find(r => r.is_final_signer === 1);
  const viewers = recipients.filter(r => r.viewer_group_id && !r.is_final_signer);
  const normals = recipients.filter(r => !r.viewer_group_id && !r.is_final_signer);

  // ── Sección normal (documentos sin pagaré) ──
  normals.forEach(recipient => {
    container.appendChild(createRecipientCard(recipient));
  });

  // ── Sección de grupos de pagaré ──
  if (viewers.length > 0 || finalSigner) {
    // Agrupar viewers por viewer_group_id
    const groups = {};
    viewers.forEach(r => {
      if (!groups[r.viewer_group_id]) groups[r.viewer_group_id] = [];
      groups[r.viewer_group_id].push(r);
    });

    const groupIds = Object.keys(groups).sort((a, b) => parseInt(a) - parseInt(b));
    const docId = getDocumentDataFromURL().id;

    // ── Botón de descarga masiva ZIP (solo si TODOS los pagarés completaron) ──
    const allGroupsDone = groupIds.every(gid => groups[gid].every(r => r.status === 'completed'));
    // finalSignerDoneGlobal: si hay firmante definitivo, debe estar completed;
    // si no hay, usar pagareSealed (sellado automático sin firmante definitivo)
    const finalSignerDoneGlobal = finalSigner
      ? finalSigner.status === 'completed'
      : (pagareSealed || allGroupsDone);
    const showZipBtn = allGroupsDone && finalSignerDoneGlobal && groupIds.length > 0 && docId;

    // ── Datos para botones de e-título en barra superior ──
    const pendingEtituloGroups = groupIds.filter(gid => {
      const grp = groups[gid];
      return grp.every(r => r.status === 'completed') && finalSignerDoneGlobal && !tvGuidsByGroup[gid];
    });
    const sentEtituloGroups = groupIds.filter(gid => {
      const grp = groups[gid];
      return grp.every(r => r.status === 'completed') && finalSignerDoneGlobal && !!tvGuidsByGroup[gid];
    });

    // Insertar/actualizar botones en section-actions (evitar duplicados)
    const sectionActions = document.querySelector('.section-actions');
    if (sectionActions && showZipBtn) {
      // Botón ZIP
      let zipBtn = document.getElementById('downloadAllZipBtn');
      if (!zipBtn) {
        zipBtn = document.createElement('button');
        zipBtn.id = 'downloadAllZipBtn';
        zipBtn.className = 'action-btn secondary';
        zipBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          DESCARGAR TODO
        `;
        sectionActions.insertBefore(zipBtn, sectionActions.firstChild);

        zipBtn.addEventListener('click', async () => {
          const userStr = localStorage.getItem('currentUser');
          if (!userStr) return;
          const user = JSON.parse(userStr);
          const url = `/api/documents/${docId}/pagares/download-all-zip?user_id=${user.user_id}`;
          zipBtn.disabled = true;
          zipBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10">
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
            Generando...
          `;
          try {
            const resp = await fetch(url);
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              alert(err.message || 'Error al generar el ZIP');
              return;
            }
            const blob = await resp.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const cd = resp.headers.get('Content-Disposition') || '';
            const fnMatch = cd.match(/filename="([^"]+)"/);
            a.download = fnMatch ? fnMatch[1] : `Pagares_${docId}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
          } catch (e) {
            alert('Error al descargar el ZIP de pagarés');
          } finally {
            zipBtn.disabled = false;
            zipBtn.innerHTML = `
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              DESCARGAR TODO
            `;
          }
        });
      }

      // Botón ENVIAR AL BAÚL (masivo) — solo si hay pagarés pendientes de enviar
      let etituloBtn = document.getElementById('enviarBaulMasivoBtn');
      if (!etituloBtn && pendingEtituloGroups.length > 0) {
        etituloBtn = document.createElement('button');
        etituloBtn.id = 'enviarBaulMasivoBtn';
        etituloBtn.className = 'action-btn secondary';
        etituloBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
          ENVIAR AL BAÚL
        `;
        sectionActions.insertBefore(etituloBtn, sectionActions.firstChild);

        etituloBtn.addEventListener('click', () => {
          showEtituloMasivoModal(docId, pendingEtituloGroups, etituloBtn);
        });
      }

      // Badge TÍTULO VALOR ENVIADO — si todos los pagarés ya fueron enviados
      let sentBadge = document.getElementById('tvEnviadoBadge');
      if (!sentBadge && sentEtituloGroups.length > 0 && pendingEtituloGroups.length === 0) {
        sentBadge = document.createElement('span');
        sentBadge.id = 'tvEnviadoBadge';
        sentBadge.className = 'action-btn secondary';
        sentBadge.style.cssText = 'background:#d1fae5;color:#065f46;border-color:#86efac;cursor:default;';
        sentBadge.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          TÍTULO VALOR ENVIADO
        `;
        sectionActions.insertBefore(sentBadge, sectionActions.firstChild);
      }
    }

    groupIds.forEach((groupId, idx) => {
      const groupRecipients = groups[groupId];
      const groupAllCompleted = groupRecipients.every(r => r.status === 'completed');
      // Si hay firmante definitivo: requiere que esté completed
      // Si no hay: el pagaré está completo cuando todos del grupo firmaron Y está sellado
      const finalSignerCompleted = finalSigner
        ? finalSigner.status === 'completed'
        : (pagareSealed || groupAllCompleted);
      const pagareFullyComplete = groupAllCompleted && finalSignerCompleted;

      // ── Datos calculados ──────────────────────────────────────────────────
      const allParticipants = [...groupRecipients, ...(finalSigner ? [finalSigner] : [])];
      const participantEmails = allParticipants.map(r => r.email).filter(Boolean);
      // ¿Al menos uno tiene trazabilidad VI embebida en el PDF?
      const hasViValidation = allParticipants.some(r => r.vi_traza_path);

      // ── Acordeón wrapper ──────────────────────────────────────────────────
      // Restaurar estado previo si el DOM fue reconstruido por auto-refresh
      const stateKey = `pagare-accordion-open-${groupId}`;
      const wasOpen = sessionStorage.getItem(stateKey) === 'true';

      const accordion = document.createElement('div');
      accordion.style.cssText = `
        margin: ${idx === 0 ? '16px' : '12px'} 0 0;
        border: 1px solid #e9dfe7;
        border-left: 4px solid #4a1e5c;
        border-radius: 10px;
        overflow: hidden;
      `;

      // ── Cabecera (clickeable) ─────────────────────────────────────────────
      const groupHeader = document.createElement('div');
      groupHeader.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px;
        background: linear-gradient(90deg, #f9f5f2 0%, #f3edf0 100%);
        cursor: pointer; user-select: none;
      `;

      const chevronId = `chev-pagare-${idx}`;
      const previewId  = `prev-pagare-${idx}`;

      // Texto resumen visible cuando está cerrado
      const previewText = pagareFullyComplete
        ? `Firmas de <em>${participantEmails.join(', ')}</em> · sellado PKI${hasViValidation ? ' · trazabilidad de validación de identidad' : ''}`
        : `${participantEmails.length} participante${participantEmails.length !== 1 ? 's' : ''}: <em>${participantEmails.join(', ')}</em>`;

      groupHeader.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;">
          <div style="display:flex;align-items:center;gap:10px;">
            <svg width="18" height="18" viewBox="0 0 100 100" fill="none" stroke="#4a1e5c" stroke-width="7">
              <line x1="50" y1="8" x2="50" y2="85"/>
              <rect x="28" y="85" width="44" height="8" rx="2" fill="#4a1e5c" stroke="none"/>
              <line x1="12" y1="20" x2="88" y2="20"/>
              <circle cx="50" cy="20" r="4" fill="#4a1e5c" stroke="none"/>
              <line x1="20" y1="20" x2="16" y2="48"/>
              <line x1="80" y1="20" x2="84" y2="48"/>
              <path d="M8 48 Q16 60 24 48" fill="#4a1e5c" stroke="none"/>
              <path d="M76 48 Q84 60 92 48" fill="#4a1e5c" stroke="none"/>
            </svg>
            <span style="font-weight:700;color:#2b0e31;font-size:14px;">Pagaré #${idx + 1}</span>
            ${pagareFullyComplete
              ? `<span style="background:#d1fae5;color:#065f46;border-radius:10px;padding:2px 10px;font-size:11px;font-weight:700;">COMPLETADO</span>`
              : `<span style="background:#fef3c7;color:#92400e;border-radius:10px;padding:2px 10px;font-size:11px;font-weight:700;">EN PROCESO</span>`
            }
          </div>
          <!-- Preview: visible solo cuando está cerrado -->
          <div id="${previewId}" style="font-size:11px;color:#4a1e5c;padding-left:28px;line-height:1.5;
               transition:opacity 0.2s ease,max-height 0.25s ease;max-height:40px;opacity:1;overflow:hidden;">
            ${previewText}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;padding-left:10px;align-self:center;">
          ${pagareFullyComplete && docId
            ? `<button class="pagare-download-complete-btn" data-group-id="${groupId}" data-doc-id="${docId}"
                 style="display:flex;align-items:center;gap:6px;background:#2b0e31;
                        color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;
                        font-weight:700;cursor:pointer;letter-spacing:0.3px;">
                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                   <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                   <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                 </svg>
                 DESCARGAR PAGARÉ COMPLETO
               </button>`
            : ''
          }
          <svg id="${chevronId}" width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="#4a1e5c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
               style="flex-shrink:0;transition:transform 0.25s ease;transform:rotate(-90deg);">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      `;
      accordion.appendChild(groupHeader);

      // ── Contenido colapsable ──────────────────────────────────────────────
      const body = document.createElement('div');
      body.style.cssText = `
        padding: ${wasOpen ? '10px 10px 12px' : '0 10px'};
        background: #fff;
        overflow: hidden;
        transition: max-height 0.3s ease, opacity 0.25s ease, padding 0.25s ease;
        max-height: ${wasOpen ? '2000px' : '0'}; opacity: ${wasOpen ? '1' : '0'};
      `;

      // Cards de los viewers del grupo
      groupRecipients.forEach(r => body.appendChild(createRecipientCard(r)));

      // Si el pagaré está completo, firmante definitivo dentro del grupo
      if (pagareFullyComplete && finalSigner) {
        const divider = document.createElement('div');
        divider.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;padding:0 4px;';
        divider.innerHTML = `
          <div style="flex:1;height:1px;background:#e5e7eb;"></div>
          <span style="font-size:11px;color:#9333ea;font-weight:600;white-space:nowrap;">⚖️ Firmante Definitivo</span>
          <div style="flex:1;height:1px;background:#e5e7eb;"></div>
        `;
        body.appendChild(divider);
        body.appendChild(createRecipientCard(finalSigner));
      }

      // Infobox cuando el pagaré está completo (dentro del cuerpo)
      if (pagareFullyComplete) {
        const viSuffix = hasViValidation
          ? ', junto con el sellado PKI y la trazabilidad de validación de identidad de todos los participantes.'
          : ', junto con el sellado PKI.';
        const infoBox = document.createElement('div');
        infoBox.style.cssText = `
          margin: 6px 0 0; padding: 9px 12px;
          background: #faf5ff; border: 1px solid #e9dfe7; border-radius: 8px;
          font-size: 11px; color: #6b21a8; line-height: 1.5;
          display: flex; align-items: flex-start; gap: 8px;
        `;
        infoBox.innerHTML = `
          <svg style="flex-shrink:0;margin-top:1px;" width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="#4a1e5c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span><strong>Pagaré completo:</strong> El documento consolidado incluye las firmas de
          <em>${participantEmails.join(', ')}</em>${viSuffix}</span>
        `;
        body.appendChild(infoBox);
      }

      accordion.appendChild(body);
      container.appendChild(accordion);

      // ── Toggle acordeón ───────────────────────────────────────────────────
      let open = wasOpen;
      // Inicializar chevron y preview según estado restaurado
      const chevInit = groupHeader.querySelector(`#${chevronId}`);
      const prevInit = groupHeader.querySelector(`#${previewId}`);
      if (chevInit) chevInit.style.transform = open ? 'rotate(0deg)' : 'rotate(-90deg)';
      if (prevInit) { prevInit.style.maxHeight = open ? '0' : '40px'; prevInit.style.opacity = open ? '0' : '1'; }

      groupHeader.addEventListener('click', (e) => {
        // No disparar si se hace clic en el botón de descarga
        if (e.target.closest('.pagare-download-complete-btn')) return;
        open = !open;
        // Persistir estado para sobrevivir al auto-refresh
        sessionStorage.setItem(stateKey, String(open));

        const chev    = groupHeader.querySelector(`#${chevronId}`);
        const preview = groupHeader.querySelector(`#${previewId}`);
        if (open) {
          body.style.maxHeight = '2000px';
          body.style.opacity = '1';
          body.style.paddingTop = '10px';
          body.style.paddingBottom = '12px';
          if (chev) chev.style.transform = 'rotate(0deg)';
          if (preview) { preview.style.maxHeight = '0'; preview.style.opacity = '0'; }
        } else {
          body.style.maxHeight = '0';
          body.style.opacity = '0';
          body.style.paddingTop = '0';
          body.style.paddingBottom = '0';
          if (chev) chev.style.transform = 'rotate(-90deg)';
          if (preview) { preview.style.maxHeight = '40px'; preview.style.opacity = '1'; }
        }
      });
    });

    // Si el firmante definitivo aún no ha completado, mostrar su card suelta al final
    if (finalSigner && finalSigner.status !== 'completed') {
      const divider = document.createElement('div');
      divider.style.cssText = 'display:flex;align-items:center;gap:8px;margin:16px 0 6px;padding:0 4px;';
      divider.innerHTML = `
        <div style="flex:1;height:1px;background:#e5e7eb;"></div>
        <span style="font-size:11px;color:#9333ea;font-weight:600;white-space:nowrap;">⚖️ Firmante Definitivo</span>
        <div style="flex:1;height:1px;background:#e5e7eb;"></div>
      `;
      container.appendChild(divider);
      container.appendChild(createRecipientCard(finalSigner));
    }
  }

  // Event listeners para botones de descarga completa
  container.querySelectorAll('.pagare-download-complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const groupId = btn.dataset.groupId;
      const dId = btn.dataset.docId;
      const userStr = localStorage.getItem('currentUser');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      const url = `/api/documents/${dId}/pagares/${groupId}/download-complete?user_id=${user.user_id}`;
      btn.disabled = true;
      btn.textContent = 'Generando...';
      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          alert(err.message || 'Error al generar el pagaré completo');
          return;
        }
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const cd = resp.headers.get('Content-Disposition') || '';
        const fnMatch = cd.match(/filename="([^"]+)"/);
        a.download = fnMatch ? fnMatch[1] : `Pagare_Completo_${dId}_${groupId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      } catch (e) {
        alert('Error al descargar el pagaré completo');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> DESCARGAR PAGARÉ COMPLETO`;
      }
    });
  });
}

function showEtituloMasivoModal(docId, groupIds, triggerBtn) {
  var prev = document.getElementById('etitulo-modal');
  if (prev) prev.remove();
  var count = groupIds.length;
  var modal = document.createElement('div');
  modal.id = 'etitulo-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
  var countLabel = count === 1 ? '1 pagaré' : count + ' pagarés';
  modal.innerHTML = `
<div id="etitulo-box" style="background:#fff;border-radius:16px;padding:32px 36px;max-width:460px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,0.18);position:relative;">
  <!-- VISTA: Formulario -->
  <div id="etitulo-view-form">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <div style="background:#f3edf0;border-radius:10px;padding:10px;flex-shrink:0;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2b0e31" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
      </div>
      <h3 style="margin:0;font-size:17px;font-weight:700;color:#1f2937;">Enviar al baúl e-título valor</h3>
    </div>
    <div style="background:#f3edf0;border:1px solid #e9dfe7;border-radius:10px;padding:13px 16px;margin-bottom:18px;display:flex;align-items:center;gap:10px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a1e5c" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span style="font-size:13px;color:#2b0e31;font-weight:600;">Se enviarán <strong>${countLabel}</strong> al baúl de e-título valor.</span>
    </div>
    <p style="font-size:13px;color:#6b7280;margin:0 0 16px;line-height:1.5;">Ingresa el ID del baúl asignado por PKI Services.</p>
    <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px;">ID del Baúl (BeneficiarioId)</label>
    <input id="etitulo-baul-id" type="number" placeholder="Ej: 2145852140"
      style="width:100%;padding:11px 13px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;margin-bottom:6px;transition:border-color 0.2s;"
      onfocus="this.style.borderColor='#2b0e31'" onblur="this.style.borderColor='#d1d5db'"/>
    <div id="etitulo-error" style="color:#dc2626;font-size:12px;min-height:18px;margin-bottom:4px;"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
      <button id="etitulo-cancel" style="padding:10px 22px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;color:#374151;">Cancelar</button>
      <button id="etitulo-confirm" style="padding:10px 24px;border:none;border-radius:8px;background:#2b0e31;color:#fff;cursor:pointer;font-size:13px;font-weight:700;display:flex;align-items:center;gap:7px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
        Enviar al baúl
      </button>
    </div>
  </div>

  <!-- VISTA: Enviando (oculta inicialmente) -->
  <div id="etitulo-view-sending" style="display:none;text-align:center;padding:10px 0;">
    <div style="margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:#f3edf0;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
        <svg id="etitulo-spin-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2b0e31" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:etituloSpin 1.2s linear infinite;"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
      </div>
      <div id="etitulo-send-title" style="font-size:16px;font-weight:700;color:#1f2937;margin-bottom:6px;">Enviando al baúl...</div>
      <div id="etitulo-send-sub" style="font-size:13px;color:#6b7280;">Generando PDF y enviando a e-título valor</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span id="etitulo-progress-text" style="font-size:12px;color:#6b7280;font-weight:500;"></span>
        <span id="etitulo-progress-pct" style="font-size:12px;color:#2b0e31;font-weight:700;"></span>
      </div>
      <div style="height:8px;background:#e9dfe7;border-radius:6px;overflow:hidden;">
        <div id="etitulo-progress-bar" style="height:100%;width:0%;background:#2b0e31;border-radius:6px;transition:width 0.4s ease;"></div>
      </div>
    </div>
    <div id="etitulo-items-log" style="margin-top:14px;text-align:left;max-height:120px;overflow-y:auto;"></div>
  </div>

  <!-- VISTA: Resultado (oculta inicialmente) -->
  <div id="etitulo-view-result" style="display:none;text-align:center;padding:10px 0;">
    <div id="etitulo-result-icon" style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"></div>
    <div id="etitulo-result-title" style="font-size:18px;font-weight:700;color:#1f2937;margin-bottom:8px;"></div>
    <div id="etitulo-result-sub" style="font-size:13px;color:#6b7280;line-height:1.6;margin-bottom:24px;"></div>
    <div id="etitulo-result-errors" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;margin-bottom:16px;text-align:left;font-size:12px;color:#991b1b;"></div>
    <button id="etitulo-close-btn" style="padding:11px 32px;border:none;border-radius:8px;background:#2b0e31;color:#fff;cursor:pointer;font-size:14px;font-weight:700;">Cerrar</button>
  </div>
</div>
<style>
@keyframes etituloSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes fadeIn { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
@keyframes etituloPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
</style>`;
  document.body.appendChild(modal);

  var input = modal.querySelector('#etitulo-baul-id');
  var errorDiv = modal.querySelector('#etitulo-error');
  var confirmBtn = modal.querySelector('#etitulo-confirm');
  var cancelBtn = modal.querySelector('#etitulo-cancel');
  var viewForm = modal.querySelector('#etitulo-view-form');
  var viewSending = modal.querySelector('#etitulo-view-sending');
  var viewResult = modal.querySelector('#etitulo-view-result');
  var progressBar = modal.querySelector('#etitulo-progress-bar');
  var progressText = modal.querySelector('#etitulo-progress-text');
  var progressPct = modal.querySelector('#etitulo-progress-pct');
  var itemsLog = modal.querySelector('#etitulo-items-log');
  var sendTitle = modal.querySelector('#etitulo-send-title');
  var sendSub = modal.querySelector('#etitulo-send-sub');

  input.focus();
  cancelBtn.addEventListener('click', function() { modal.remove(); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  confirmBtn.addEventListener('click', async function() {
    var beneficiarioId = input.value.trim();
    if (!beneficiarioId || isNaN(beneficiarioId)) {
      errorDiv.textContent = 'Ingresa un ID de baúl válido.';
      return;
    }
    errorDiv.textContent = '';

    // Cambiar a vista "enviando"
    viewForm.style.display = 'none';
    viewSending.style.display = 'block';

    var sent = 0, errors = 0, errs = [];
    for (var i = 0; i < groupIds.length; i++) {
      var gid = groupIds[i];
      var num = i + 1;
      progressText.textContent = 'Pagaré ' + num + ' de ' + count;
      progressPct.textContent = Math.round((i / count) * 100) + '%';
      sendTitle.textContent = 'Enviando pagaré ' + num + ' de ' + count + '...';
      sendSub.textContent = 'Generando PDF y enviando a e-título valor, por favor espera';

      // Barra con animación de pulso mientras espera respuesta
      var baseW = Math.round((i / count) * 100);
      progressBar.style.transition = 'width 0.3s ease';
      progressBar.style.width = baseW + '%';
      progressBar.style.animation = 'etituloPulse 1.2s ease-in-out infinite';
      progressPct.textContent = baseW + '%';

      try {
        var resp = await fetch('/api/documents/' + docId + '/enviar-etitulo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ beneficiarioId: parseInt(beneficiarioId), viewerGroupId: parseInt(gid) })
        });
        var data = await resp.json();
        // Detener pulso y avanzar al 100% de este pagaré
        progressBar.style.animation = 'none';
        progressBar.style.transition = 'width 0.4s ease';
        progressBar.style.width = Math.round(((i + 1) / count) * 100) + '%';
        progressPct.textContent = Math.round(((i + 1) / count) * 100) + '%';
        if (data.success) {
          sent++;
          itemsLog.innerHTML += '<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid #f3edf0;font-size:12px;color:#166534;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Pagaré #' + num + ' enviado correctamente</div>';
        } else {
          errors++;
          errs.push('Pagaré #' + num + ': ' + (data.message || 'Error desconocido'));
          itemsLog.innerHTML += '<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid #f3edf0;font-size:12px;color:#991b1b;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            'Pagaré #' + num + ': ' + (data.message || 'Error') + '</div>';
        }
      } catch(e) {
        errors++;
        errs.push('Pagaré #' + num + ': Error de conexión');
        progressBar.style.animation = 'none';
        progressBar.style.transition = 'width 0.4s ease';
        progressBar.style.width = Math.round(((i + 1) / count) * 100) + '%';
        progressPct.textContent = Math.round(((i + 1) / count) * 100) + '%';
      }
      itemsLog.scrollTop = itemsLog.scrollHeight;
    }

    // Cambiar a vista resultado
    viewSending.style.display = 'none';
    viewResult.style.display = 'block';
    var resultIcon = modal.querySelector('#etitulo-result-icon');
    var resultTitle = modal.querySelector('#etitulo-result-title');
    var resultSub = modal.querySelector('#etitulo-result-sub');
    var resultErrors = modal.querySelector('#etitulo-result-errors');

    if (errors === 0) {
      resultIcon.style.background = '#dcfce7';
      resultIcon.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      resultTitle.textContent = sent === 1 ? '¡Pagaré enviado al baúl!' : '¡' + sent + ' pagarés enviados al baúl!';
      resultTitle.style.color = '#166534';
      resultSub.textContent = 'El' + (sent > 1 ? ' los' : '') + ' pagaré' + (sent > 1 ? 's han' : ' ha') + ' sido custodiado' + (sent > 1 ? 's' : '') + ' exitosamente en e-título valor.';
    } else if (sent > 0) {
      resultIcon.style.background = '#fef9c3';
      resultIcon.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      resultTitle.textContent = sent + ' enviado' + (sent > 1 ? 's' : '') + ', ' + errors + ' con error';
      resultTitle.style.color = '#92400e';
      resultSub.textContent = 'Algunos pagarés no pudieron enviarse. Revisa los errores a continuación.';
      resultErrors.style.display = 'block';
      resultErrors.innerHTML = errs.map(function(e) { return '• ' + e; }).join('<br>');
    } else {
      resultIcon.style.background = '#fee2e2';
      resultIcon.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      resultTitle.textContent = 'Error al enviar';
      resultTitle.style.color = '#991b1b';
      resultSub.textContent = 'No se pudo enviar al baúl. Verifica el ID del baúl e intenta de nuevo.';
      resultErrors.style.display = 'block';
      resultErrors.innerHTML = errs.map(function(e) { return '• ' + e; }).join('<br>');
    }

    modal.querySelector('#etitulo-close-btn').addEventListener('click', function() {
      modal.remove();
      var docId2 = new URLSearchParams(window.location.search).get('id');
      if (docId2) loadRecipients(docId2);
    });
  });
}


function createRecipientCard(recipient) {
  const card = document.createElement('div');
  card.className = 'recipient-card';
  card.dataset.recipientId = recipient.id;

  const statusClass = getStatusClass(recipient.status);
  const statusText = getStatusText(recipient.status);

  // Formatear email/nombre
  const displayName = recipient.name || recipient.email;
  const displayEmail = recipient.email;

  // Bloque de Validación de Identidad
  // Mostrar bloque VI cuando:
  // - status 'pending': email en espera de validación VI (viewers y firmante definitivo pendiente)
  // - is_final_signer=1 con status 'sent' y sin vi_validated_at: firmante definitivo que recibió
  //   email antes del flujo VI (casos legacy) o cuyo correo ya se envió pero aún no verifica
  const isFinalSignerUnverified = recipient.is_final_signer === 1 && !recipient.vi_validated_at
    && (recipient.status === 'sent' || recipient.status === 'pending');
  const showViBlock = (recipient.status === 'pending' && !recipient.vi_validated_at) || isFinalSignerUnverified;
  const viValidatedBadge = recipient.vi_validated_at
    ? `<div style="margin-top:10px;display:flex;align-items:center;gap:6px;font-size:12px;color:#2b9348;font-weight:600;">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
         Identidad verificada
       </div>`
    : '';

  // Correo enviado pero identidad no verificada (casos anteriores al flujo VI)
  const sentWithoutVi = recipient.status === 'sent' && !recipient.vi_validated_at;

  // Badge de estado
  const badgeHtml = showViBlock
    ? `<div class="status-badge" style="background:#fdecea;color:#c0392b;border:1px solid #f5c6cb;">NO VERIFICADO</div>`
    : sentWithoutVi
      ? `<div class="status-badge" style="background:#fff3cd;color:#856404;border:1px solid #ffc107;">ENVIADO</div>`
      : `<div class="status-badge ${statusClass}">${statusText}</div>`;

  // Texto informativo bajo el email
  const viInfoText = showViBlock
    ? `<p style="font-size:11px;color:#c0392b;margin:3px 0 0;font-weight:600;">Identidad no verificada — correo en espera</p>`
    : sentWithoutVi
      ? `<p style="font-size:11px;color:#856404;margin:3px 0 0;font-weight:600;">Correo enviado — identidad no verificada</p>`
      : viValidatedBadge;

  // Botones a la derecha: VI cuando no verificado, normales cuando sí
  const actionsHtml = showViBlock
    ? `<div class="recipient-actions" style="flex-direction:column;align-items:center;gap:8px;min-width:220px;">
         <button class="vi-start-btn recipient-btn" style="padding:13px 20px;background:#2a0d31;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.5px;width:100%;text-align:center;">
           INICIAR VALIDACIÓN DE IDENTIDAD
         </button>
         <button class="vi-skip-btn" style="background:none;border:none;color:#888;font-size:12px;cursor:pointer;padding:0;text-decoration:underline;width:100%;text-align:center;">
           omitir validación de identidad
         </button>
       </div>`
    : `<div class="recipient-actions">
         <button class="recipient-btn copy" data-action="copy" data-id="${recipient.id}" data-token="${recipient.token || ''}" title="Copiar enlace de firma">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
             <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
             <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
           </svg>
           COPIAR
         </button>
         <button class="recipient-btn view" data-action="view" data-id="${recipient.id}" data-status="${recipient.status || 'pending'}">
           VISTA
         </button>
         <div class="download-dropdown-wrap" style="position:relative;display:inline-block;">
           <button class="recipient-btn download download-main-btn" data-action="download" data-id="${recipient.id}" style="display:flex;align-items:center;gap:4px;padding-right:8px;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
               <polyline points="7 10 12 15 17 10"/>
               <line x1="12" y1="15" x2="12" y2="3"/>
             </svg>
             DESCARGAR
             ${recipient.status === 'completed' && recipient.vi_traza_path ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-left:2px;"><polyline points="6 9 12 15 18 9"/></svg>` : ''}
           </button>
           ${recipient.status === 'completed' && recipient.vi_traza_path ? `
           <div class="download-dropdown-menu" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:9999;min-width:210px;overflow:hidden;">
             <button class="download-option-btn" data-action="download" data-id="${recipient.id}" style="width:100%;text-align:left;padding:11px 16px;border:none;background:none;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px;color:#1f2937;">
               <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4a1e5c" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
               <div><div style="font-weight:600;">Con trazabilidad</div><div style="font-size:11px;color:#6b7280;">Incluye trazabilidad de identidad</div></div>
             </button>
             <div style="height:1px;background:#f3f4f6;margin:0 12px;"></div>
             <button class="download-option-btn" data-action="download-sealed" data-id="${recipient.id}" style="width:100%;text-align:left;padding:11px 16px;border:none;background:none;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:10px;color:#1f2937;">
               <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
               <div><div style="font-weight:600;">Sin trazabilidad</div><div style="font-size:11px;color:#6b7280;">Solo documento sellado PKI</div></div>
             </button>
           </div>` : ''}
         </div>
       </div>`;

  card.innerHTML = `
    <div class="recipient-info" style="flex:1;">
      ${badgeHtml}
      <div class="recipient-emails">
        <p class="recipient-email">${displayEmail}</p>
        ${recipient.name && recipient.name !== recipient.email ? `<p class="recipient-name" style="font-size: 12px; color: #666; margin-top: 4px;">${recipient.name}</p>` : ''}
        ${viInfoText}
      </div>
    </div>
    ${actionsHtml}
  `;

  // Event listeners para botones de VI
  const startBtn = card.querySelector('.vi-start-btn');
  const skipBtn = card.querySelector('.vi-skip-btn');
  if (startBtn) startBtn.addEventListener('click', () => handleViStart(recipient));
  if (skipBtn) skipBtn.addEventListener('click', () => handleViSkip(recipient, card));

  // Dropdown de descarga (Con trazabilidad / Sin trazabilidad)
  const mainDownloadBtn = card.querySelector('.download-main-btn');
  const dropdownMenu = card.querySelector('.download-dropdown-menu');
  if (mainDownloadBtn && dropdownMenu) {
    // Click en el botón principal → abrir/cerrar dropdown
    mainDownloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdownMenu.style.display !== 'none';
      // Cerrar todos los otros dropdowns abiertos
      document.querySelectorAll('.download-dropdown-menu').forEach(m => { m.style.display = 'none'; });
      dropdownMenu.style.display = isOpen ? 'none' : 'block';
    });
    // Click en opciones del dropdown
    dropdownMenu.querySelectorAll('.download-option-btn').forEach(optBtn => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.style.display = 'none';
        const action = optBtn.dataset.action;
        const rid = optBtn.dataset.id;
        if (action === 'download') handleRecipientDownload(rid);
        else if (action === 'download-sealed') handleRecipientDownloadSealed(rid);
      });
    });
  } else if (mainDownloadBtn && !dropdownMenu) {
    // Recipient no completado: click directo descarga normal
    mainDownloadBtn.addEventListener('click', () => handleRecipientDownload(recipient.id));
  }

  // Cerrar dropdown al hacer click fuera
  if (dropdownMenu) {
    document.addEventListener('click', () => { dropdownMenu.style.display = 'none'; }, { once: false });
  }

  return card;
}

function getStatusClass(status) {
  const statusMap = {
    'sent': 'pending',        // Enviado → azul
    'opened': 'viewed',       // Abierto → amarillo
    'completed': 'completed', // Completado → verde
    'rejected': 'rejected',   // Rechazado → rojo
    'pending': 'pending'      // Por si acaso
  };
  return statusMap[status?.toLowerCase()] || 'pending';
}

function getStatusText(status) {
  const statusTextMap = {
    'sent': 'ENVIADO',
    'opened': 'ABIERTO',
    'completed': 'COMPLETADO',
    'rejected': 'RECHAZADO',
    'pending': 'PENDIENTE'
  };
  return statusTextMap[status?.toLowerCase()] || 'PENDIENTE';
}

// ====== ACCIONES DE DOCUMENTO ======
function handleLinkAction() {
  const docData = getDocumentDataFromURL();
  const link = `${window.location.origin}/public/Main/tracking.html?id=${docData.id}&name=${encodeURIComponent(docData.name)}`;

  navigator.clipboard.writeText(link).then(() => {
    ToastManager.success('Enlace copiado', 'El enlace del documento se copió al portapapeles');
  }).catch(() => {
    ToastManager.error('Error', 'No se pudo copiar el enlace');
  });
}

function handleArchiveAction() {
  const docData = getDocumentDataFromURL();

  if (confirm(`¿Deseas archivar el documento "${docData.name}"?`)) {
    console.log('📦 Archivando documento:', docData.id);
    ToastManager.info('Documento archivado', 'El documento se movió a archivados');

    // Aquí iría la lógica para archivar en el backend
    setTimeout(() => {
      window.location.href = './index.html';
    }, 1500);
  }
}

function handleCloneAction() {
  const docData = getDocumentDataFromURL();

  console.log('📋 Clonando documento:', docData.id);
  ToastManager.success('Documento clonado', 'Se creó una copia del documento');

  // Aquí iría la lógica para clonar en el backend
}

function handleEditAction() {
  const docData = getDocumentDataFromURL();

  console.log('✏️ Editando documento:', docData.id);
  console.log('📋 Tipo de documento:', currentDocumentType);
  // ✅ Redirigir a modo preparación para editar campos
  window.location.href = `/sign.html?mode=prepare&id=${docData.id}&name=${encodeURIComponent(docData.name)}&documentType=${currentDocumentType}`;
}


async function handleAddRecipient() {
  console.log('➕ Agregar nuevo destinatario');

  // Cargar roles del documento antes de abrir el modal
  const docData = getDocumentDataFromURL();
  console.log('📄 Datos del documento desde URL:', docData);
  console.log('   ID extraído:', docData.id);

  await loadDocumentRoles(docData.id);

  // ✅ Mostrar pestaña de pagaré si es necesario
  const pagareTab = document.getElementById('pagareTab');
  if (currentDocumentType === 'pagare' && pagareTab) {
    // ✅ OCULTAR las otras pestañas (Email, Teléfono, Subir lista) para documentos tipo pagaré
    document.querySelectorAll('.recipients-tab').forEach(tab => {
      if (tab.dataset.tab !== 'pagare') {
        tab.style.display = 'none';
      }
      tab.classList.remove('active');
    });

    // Mostrar y activar solo la pestaña de pagaré
    pagareTab.style.display = 'inline-flex';
    pagareTab.classList.add('active');

    // Mostrar contenido de pagaré y ocultar otros
    document.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = 'none';
    });
    document.getElementById('tab-pagare').style.display = 'block';

    // ✅ Cargar información de campos del pagaré
    await loadPagareFieldsInfo(docData.id);

    console.log('✅ Pestaña de pagaré activada - otras pestañas ocultadas');
  } else if (pagareTab) {
    // Para documentos normales, mostrar las pestañas estándar y ocultar pagaré
    pagareTab.style.display = 'none';
    document.querySelectorAll('.recipients-tab').forEach(tab => {
      if (tab.dataset.tab !== 'pagare') {
        tab.style.display = 'inline-flex';
      }
    });
  }

  // Abrir modal de destinatarios
  const modal = document.getElementById('recipientsModal');
  console.log('Modal encontrado:', modal);

  if (modal) {
    const modalBox = modal.querySelector('.modal');
    console.log('Caja del modal (.modal):', modalBox);
    console.log('Caja display:', modalBox ? window.getComputedStyle(modalBox).display : 'N/A');
    console.log('Caja visibility:', modalBox ? window.getComputedStyle(modalBox).visibility : 'N/A');
    console.log('Caja opacity:', modalBox ? window.getComputedStyle(modalBox).opacity : 'N/A');

    console.log('Clases antes:', modal.className);
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    console.log('Clases después:', modal.className);
    console.log('Display style:', window.getComputedStyle(modal).display);
  } else {
    console.error('❌ Modal no encontrado en el DOM');
  }
}

// ====== CARGAR ROLES/PARTES DEL DOCUMENTO ======
let documentRoles = [];

async function loadDocumentRoles(docId) {
  try {
    console.log('📋 Cargando roles/partes del documento:', docId);
    console.log('   Tipo:', typeof docId);
    console.log('   URL actual:', window.location.href);

    // Convertir a número si es string
    const numericId = parseInt(docId);
    console.log('   ID numérico:', numericId);

    // Validar que el docId sea válido
    if (!docId || docId === 'null' || docId === 'undefined' || isNaN(numericId) || numericId <= 0) {
      console.error('❌ ID de documento inválido:', { docId, numericId });
      hidePartSelectors();
      return;
    }

    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      console.error('❌ No hay usuario autenticado');
      return;
    }

    const user = JSON.parse(userStr);
    console.log('👤 Usuario:', user);
    console.log('   user_id:', user.user_id);

    // 🔥 NUEVO: Primero verificar si los CAMPOS tienen partes asignadas
    console.log(`🌐 Verificando campos del documento...`);
    const fieldsResponse = await fetch(`/api/documents/${numericId}/fields?user_id=${user.user_id}`);

    if (fieldsResponse.ok) {
      const fieldsData = await fieldsResponse.json();
      const fields = fieldsData.data?.fields || [];

      // Verificar si algún campo tiene part_id asignado
      // ✅ CORREGIDO: El backend devuelve "partId" (camelCase), no "part_id"
      const hasFieldsWithParts = fields.some(f => f.partId !== null && f.partId !== undefined);

      console.log(`📋 Campos encontrados: ${fields.length}`);
      console.log(`🔍 ¿Algún campo tiene parte asignada? ${hasFieldsWithParts}`);

      if (!hasFieldsWithParts) {
        // Si NINGÚN campo tiene parte asignada, mostrar textarea simple
        console.log('ℹ️ No hay campos con partes asignadas → Mostrando textarea simple');
        documentRoles = [];
        hidePartSelectors();
        return;
      }
    }

    // Llamar al endpoint de roles solo si hay campos con partes
    console.log(`🌐 Haciendo petición a: /api/documents/${numericId}/roles?user_id=${user.user_id}`);
    const response = await fetch(`/api/documents/${numericId}/roles?user_id=${user.user_id}`);

    console.log('📨 Respuesta:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error('Error al obtener roles');
    }

    const data = await response.json();

    if (data.success && data.roles && data.roles.length > 0) {
      documentRoles = data.roles;
      console.log(`✅ ${documentRoles.length} roles cargados:`, documentRoles);

      // Actualizar los selectores de partes
      populatePartSelectors();
    } else {
      console.log('ℹ️ No hay roles configurados para este documento');
      documentRoles = [];
      hidePartSelectors();
    }

  } catch (error) {
    console.error('❌ Error al cargar roles:', error);
    documentRoles = [];
    hidePartSelectors();
  }
}

function populatePartSelectors() {
  // Renderizar formulario de email con roles/partes
  renderEmailTabWithRoles();
  console.log('✅ Formulario de partes renderizado');
}

function hidePartSelectors() {
  // Mostrar textarea simple sin roles
  renderEmailTabWithoutRoles();
}

// ✅ Cargar información de campos para pagarés
async function loadPagareFieldsInfo(docId) {
  try {
    console.log('📋 Cargando información de campos del pagaré:', docId);

    const numericId = parseInt(docId);
    if (!docId || isNaN(numericId) || numericId <= 0) {
      console.error('❌ ID de documento inválido:', docId);
      return;
    }

    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      console.error('❌ No hay usuario autenticado');
      return;
    }

    const user = JSON.parse(userStr);

    // Obtener campos del documento
    const fieldsResponse = await fetch(`/api/documents/${numericId}/fields?user_id=${user.user_id}`);

    if (!fieldsResponse.ok) {
      throw new Error('Error al obtener campos del documento');
    }

    const fieldsData = await fieldsResponse.json();
    const fields = fieldsData.data?.fields || [];

    // 🔍 DEBUG: Ver todos los campos
    console.log('🔍 [PAGARE] Total campos recibidos:', fields.length);
    console.table(fields.map(f => ({
      id: f.field_id || f.id,
      type: f.type,
      label: f.label,
      partId: f.partId
    })));

    // Contar viewers únicos (basado en partId)
    const viewerIds = new Set();
    const textFields = [];

    fields.forEach(field => {
      if (field.partId !== null && field.partId !== undefined) {
        viewerIds.add(field.partId);
      }
      // 🔥 CORRECCIÓN: usar field.type en lugar de field.fieldType
      if (field.type === 'text' && field.label) {
        textFields.push({
          label: field.label,
          viewer: field.partId || null
        });
      }
    });

    // Actualizar UI
    document.getElementById('pagareViewersCount').textContent = viewerIds.size || 0;
    document.getElementById('pagareTextFieldsCount').textContent = textFields.length || 0;

    // Detectar firmante definitivo
    const hasFinalSignatureField = fields.some(f => f.type === 'final_signature');
    const finalSignerStep = document.getElementById('finalSignerStep');
    if (finalSignerStep) {
      finalSignerStep.style.display = hasFinalSignatureField ? 'block' : 'none';
      finalSignerStep.dataset.active = hasFinalSignatureField ? 'true' : 'false';
    }
    console.log('🔍 [PAGARE] Firmante definitivo detectado:', hasFinalSignatureField);

    // Mostrar lista de campos con diseño mejorado
    const fieldsList = document.getElementById('pagareFieldsList');
    if (textFields.length > 0) {
      fieldsList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; margin-top: 8px;">
          ${textFields.map(f => `
            <div style="
              background: white;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 8px 10px;
              font-size: 12px;
              color: #374151;
              display: flex;
              align-items: center;
              gap: 6px;
            ">
              <svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span style="font-weight: 500;">${f.label}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      fieldsList.innerHTML = '<div style="color: #f59e0b;"><svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> No hay campos de texto mapeados. Ve a EDITAR para mapear campos.</div>';
    }

    console.log(`✅ Pagaré: ${viewerIds.size} firmantes, ${textFields.length} campos de texto`);

  } catch (error) {
    console.error('❌ Error al cargar información de campos del pagaré:', error);
    ToastManager.error('Error', 'No se pudo cargar la información del pagaré');
  }
}

// Renderizar pestaña "por Email" con diseño de roles (como en sign.html)
function renderEmailTabWithRoles() {
  const emailTabContent = document.getElementById('emailTabContent');

  if (!emailTabContent) {
    console.error('❌ No se encontró el contenedor emailTabContent');
    return;
  }

  if (!documentRoles || documentRoles.length === 0) {
    console.log('⚠️ Sin roles - Mostrando textarea simple');
    renderEmailTabWithoutRoles();
    return;
  }

  console.log('✅ Roles detectados - Mostrando formulario detallado en Email');

  emailTabContent.innerHTML = documentRoles.map(role => `
    <div class="role-recipient-group" data-role-id="${role.roleId}">
      <label class="role-label">
        <div class="role-color-indicator" style="background: ${role.color};"></div>
        <span>${role.name}</span>
        <span class="recipient-name-preview" data-role-id="${role.roleId}"></span>
      </label>
      <div class="role-inputs-container" data-role-id="${role.roleId}">
        <input
          type="email"
          class="form-input role-email-input"
          data-role-id="${role.roleId}"
          placeholder="Correo electrónico"
          style="width: 100%; border: 2px solid ${role.color};"
        />
        <div class="vi-status-badge" data-role-id="${role.roleId}" style="display:none; margin-top:6px; font-size:12px; padding:5px 10px; border-radius:20px; display:none; align-items:center; gap:6px; width:fit-content;"></div>
      </div>
    </div>
  `).join('');

  // Verificar si el owner está vinculado a VI (con cache)
  async function getOwnerVinculado() {
    if (_viOwnerVinculado !== null) return _viOwnerVinculado;
    try {
      const r = await fetch('/api/integration/vi-link-status');
      _viOwnerVinculado = r.ok ? (await r.json()).vinculado === true : false;
    } catch (_) { _viOwnerVinculado = false; }
    return _viOwnerVinculado;
  }

  // Verificar VI de un email y actualizar badge
  async function checkAndShowViBadge(email, roleId) {
    const badge = document.querySelector(`.vi-status-badge[data-role-id="${roleId}"]`);
    if (!badge) return;

    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!email || !isValid) {
      badge.style.display = 'none';
      return;
    }

    const vinculado = await getOwnerVinculado();
    if (!vinculado) return; // Owner no usa VI — no mostrar nada

    badge.style.display = 'flex';
    badge.innerHTML = `<span style="opacity:0.6">Verificando...</span>`;

    try {
      const resp = await fetch('/api/recipients/check-vi-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: [email.toLowerCase()] })
      });
      const data = await resp.json();
      const verifiedAt = data.verified?.[email.toLowerCase()];

      if (verifiedAt) {
        const fecha = new Date(verifiedAt).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
        badge.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:6px; font-size:12px; padding:5px 10px; border-radius:20px; background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; width:fit-content;';
        badge.innerHTML = `<svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Identidad verificada <span style="opacity:0.7">${fecha}</span>`;
      } else {
        badge.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:6px; font-size:12px; padding:5px 10px; border-radius:20px; background:#fff7ed; color:#92400e; border:1px solid #fcd34d; width:fit-content;';
        badge.innerHTML = `<svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Identidad no verificada`;
      }
    } catch (_) {
      badge.style.display = 'none';
    }
  }

  // Debounce helper
  const debounceTimers = {};

  // Event listeners para cada input
  const emailInputs = document.querySelectorAll('.role-email-input');
  emailInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const roleId = input.dataset.roleId;
      const email = e.target.value.trim();

      // Preview del nombre
      const previewSpan = document.querySelector(`.recipient-name-preview[data-role-id="${roleId}"]`);
      if (previewSpan) previewSpan.textContent = email ? `(${email})` : '';

      // Verificación VI con debounce
      clearTimeout(debounceTimers[roleId]);
      debounceTimers[roleId] = setTimeout(() => checkAndShowViBadge(email, roleId), 600);
    });
  });
}

// Renderizar pestaña "por Email" sin roles (textarea simple)
function renderEmailTabWithoutRoles() {
  const emailTabContent = document.getElementById('emailTabContent');

  if (!emailTabContent) {
    console.error('❌ No se encontró el contenedor emailTabContent');
    return;
  }

  console.log('⚠️ Sin roles - Mostrando textarea simple');
  emailTabContent.innerHTML = `
    <textarea
      id="emailInput"
      class="recipients-textarea"
      placeholder="Escribe correos electrónicos aquí (uno por línea)..."
      rows="6"
    ></textarea>
  `;
}

// ====== ACCIONES DE DESTINATARIOS ======
function handleRecipientCopy(recipientId, token) {
  console.log('📋 Copiando enlace de firma para:', recipientId);
  
  // Si no hay token, mostrar error
  if (!token || token === '') {
    ToastManager.error('Error', 'No se encontró el token de firma');
    return;
  }
  
  const signUrl = `${window.location.origin}/public/Main/public-sign.html?token=${token}`;
  
  navigator.clipboard.writeText(signUrl).then(() => {
    ToastManager.success('¡Enlace copiado!', 'El enlace de firma se copió al portapapeles');
  }).catch(err => {
    console.error('Error al copiar:', err);
    ToastManager.error('Error', 'No se pudo copiar el enlace');
  });
}

async function handleRecipientDownload(recipientId) {
  console.log('💾 Descargando documento firmado por:', recipientId);

  const docData = getDocumentDataFromURL();

  // Obtener user_id desde localStorage
  const user = getCurrentUser();
  if (!user || !user.user_id) {
    ToastManager.error('Error', 'No hay sesión activa');
    console.error('❌ No se pudo obtener user_id del usuario');
    return;
  }

  const userId = user.user_id;
  console.log(`📥 Descargando para doc: ${docData.id}, recipient: ${recipientId}, user: ${userId}`);

  // Mostrar toast de descarga
  ToastManager.info('Descargando', 'Preparando el documento...', 0);

  try {
    // 🔥 CAMBIO: Primero obtener información del documento para verificar si tiene PDF firmado final
    const docResponse = await fetch(`/api/documents/${docData.id}?user_id=${userId}`);

    if (docResponse.ok) {
      const docInfo = await docResponse.json();

      // Si el documento tiene signed_file_path, descargar ese (PDF con todas las firmas + sello PKI)
      if (docInfo.data && docInfo.data.signed_file_path) {
        console.log('✅ Documento tiene PDF firmado final con sello PKI');

        let signedPdfUrl = docInfo.data.signed_file_path;

        // Asegurar que sea una URL completa
        if (!signedPdfUrl.startsWith('http://') && !signedPdfUrl.startsWith('https://')) {
          const origin = window.location.origin;
          const path = signedPdfUrl.startsWith('/') ? signedPdfUrl.substring(1) : signedPdfUrl;
          signedPdfUrl = `${origin}/${path}`;
        }

        console.log(`🔗 Descargando PDF firmado final desde: ${signedPdfUrl}`);

        // Crear elemento <a> temporal para forzar descarga
        const link = document.createElement('a');
        link.href = signedPdfUrl;
        link.download = `${docData.name}_firmado.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        ToastManager.success('¡Descarga iniciada!', 'Documento firmado con todas las firmas y sello PKI');
        return;
      }
    }

    // Si no hay PDF firmado final, usar el endpoint de descarga individual
    console.log('📄 Usando endpoint de descarga individual');
    const downloadUrl = `/api/documents/${docData.id}/recipients/${recipientId}/download?user_id=${userId}`;
    console.log(`🔗 URL de descarga: ${downloadUrl}`);

    window.open(downloadUrl, '_blank');

    setTimeout(() => {
      ToastManager.success('¡Descarga iniciada!', 'El documento se está descargando');
    }, 500);

  } catch (error) {
    console.error('❌ Error al preparar descarga:', error);

    // En caso de error, intentar con el método original
    const downloadUrl = `/api/documents/${docData.id}/recipients/${recipientId}/download?user_id=${userId}`;
    window.open(downloadUrl, '_blank');

    ToastManager.success('¡Descarga iniciada!', 'El documento se está descargando');
  }
}

async function handleRecipientDownloadSealed(recipientId) {
  const docData = getDocumentDataFromURL();
  const userStr = localStorage.getItem('currentUser');
  if (!userStr) return;
  const user = JSON.parse(userStr);
  const userId = user.user_id;

  const downloadUrl = `/api/documents/${docData.id}/recipients/${recipientId}/download?user_id=${userId}&no_traza=1`;
  try {
    const resp = await fetch(downloadUrl);
    if (!resp.ok) {
      ToastManager.error('Error', 'No se pudo descargar el documento sellado');
      return;
    }
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const cd = resp.headers.get('Content-Disposition') || '';
    const fnMatch = cd.match(/filename="([^"]+)"/);
    a.download = fnMatch ? decodeURIComponent(fnMatch[1]) : `documento_sellado_${docData.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    ToastManager.success('¡Descarga iniciada!', 'Documento sellado sin trazabilidad');
  } catch (e) {
    console.error('❌ Error descargando documento sellado:', e);
    ToastManager.error('Error', 'No se pudo descargar el documento sellado');
  }
}

function handleRecipientView(recipientId, status) {
  console.log('👁️ Viendo detalles del destinatario:', recipientId, 'Estado:', status);

  const docData = getDocumentDataFromURL();

  // ✅ Obtener el token del destinatario desde el botón
  const recipientCard = document.querySelector(`[data-recipient-id="${recipientId}"]`);
  const token = recipientCard?.querySelector('[data-token]')?.dataset.token;

  if (!token) {
    ToastManager.error('Error', 'No se pudo obtener el enlace del documento');
    console.error('❌ Token no encontrado para recipient:', recipientId);
    return;
  }

  // ✅ Redirigir a public-sign.html con el token (funciona tanto para completados como pendientes)
  console.log(`📄 Abriendo documento con token: ${token}`);
  window.location.href = `./public-sign.html?token=${token}`;
}

function handleRecipientDelete(recipientId) {
  if (confirm('¿Deseas eliminar este envío?')) {
    console.log('🗑️ Eliminando destinatario:', recipientId);

    // Eliminar del DOM
    const card = document.querySelector(`[data-recipient-id="${recipientId}"]`);
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateX(-20px)';
      setTimeout(() => {
        card.remove();

        // Verificar si quedan destinatarios
        const remainingCards = document.querySelectorAll('.recipient-card');
        if (remainingCards.length === 0) {
          document.getElementById('recipientsContainer').style.display = 'none';
          document.getElementById('emptyState').style.display = 'block';
        }
      }, 300);
    }

    ToastManager.success('Envío eliminado', 'El destinatario fue eliminado de la lista');

    // Aquí iría la lógica para eliminar en el backend
  }
}

// ====== EVENT DELEGATION ======
document.addEventListener('click', (e) => {
  // Botones de documento
  if (e.target.closest('#linkBtn')) handleLinkAction();
  if (e.target.closest('#archiveBtn')) handleArchiveAction();
  if (e.target.closest('#cloneBtn')) handleCloneAction();
  if (e.target.closest('#editBtn')) handleEditAction();
  if (e.target.closest('#addRecipientBtn')) handleAddRecipient();

  // Botones de destinatarios
  // Ignorar el botón principal del dropdown y las opciones dentro del dropdown
  // (son manejados por los event listeners propios de cada card)
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn && (actionBtn.classList.contains('download-main-btn') || actionBtn.classList.contains('download-option-btn'))) return;
  if (actionBtn) {
    const action = actionBtn.dataset.action;
    const recipientId = actionBtn.dataset.id;
    const token = actionBtn.dataset.token; // Para el enlace de firma
    const status = actionBtn.dataset.status; // Para verificar estado en VISTA

    switch(action) {
      case 'copy':
        handleRecipientCopy(recipientId, token);
        break;
      case 'download':
        handleRecipientDownload(recipientId);
        break;
      case 'download-sealed':
        handleRecipientDownloadSealed(recipientId);
        break;
      case 'view':
        handleRecipientView(recipientId, status);
        break;
      case 'delete':
        handleRecipientDelete(recipientId);
        break;
    }
  }
});

// ====== LOGOUT ======
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

// ====== CARGAR DATOS DEL USUARIO ======
function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
    if (!userStr) {
      console.warn('⚠️ No hay usuario en localStorage');
      return null;
    }
    const user = JSON.parse(userStr);
    console.log('👤 Usuario actual:', user.first_name, user.last_name);
    return user;
  } catch (error) {
    console.error('❌ Error al obtener usuario:', error);
    return null;
  }
}

function updateUserProfile() {
  const user = getCurrentUser();

  if (!user) {
    // Datos demo si no hay usuario
    updateProfileUI({
      first_name: 'Usuario',
      last_name: 'Demo'
    });
    return;
  }

  updateProfileUI(user);
}

function updateProfileUI(user) {
  const firstName = user.first_name || 'Usuario';
  const lastName = user.last_name || '';

  // Generar iniciales
  const initials = (firstName.charAt(0) + (lastName.charAt(0) || '')).toUpperCase();

  // Actualizar avatar con iniciales
  const userInitials = document.getElementById('userInitials');
  if (userInitials) {
    userInitials.textContent = initials;
  }

  // Hacer visible el avatar después de actualizarlo
  const userMenu = document.getElementById('userMenu');
  if (userMenu) {
    userMenu.style.opacity = '1';
  }

  console.log('✅ Iniciales actualizadas:', initials);
}

// ====== CERRAR MENÚ AL HACER CLIC FUERA ======
document.addEventListener('click', (e) => {
  const userMenu = document.getElementById('userMenu');
  if (userMenu && userMenu.hasAttribute('open')) {
    if (!userMenu.contains(e.target)) {
      userMenu.removeAttribute('open');
    }
  }
});

// ====== VERIFICAR PERMISOS Y OCULTAR ELEMENTOS RESTRINGIDOS ======
function checkUserPermissions() {
  const currentUserStr = localStorage.getItem('currentUser');
  if (!currentUserStr) return;

  try {
    const currentUser = JSON.parse(currentUserStr);
    const roleName = currentUser.role_name;

    // Roles que no pueden acceder a configuración
    const restrictedRoles = ['Editor', 'Member', 'Agent', 'Viewer'];

    if (restrictedRoles.includes(roleName)) {
      // Ocultar el elemento de Perfil del menú
      const profileMenuItem = document.getElementById('profileMenuItem');
      if (profileMenuItem) {
        profileMenuItem.style.display = 'none';
      }

      // Ocultar link de Configuración en el header
      const configLink = document.getElementById('configLink');
      if (configLink) {
        configLink.style.display = 'none';
      }

      console.log(`🔒 Elementos restringidos ocultados para rol: ${roleName}`);
    } else {
      // Si tiene permisos, mostrar el link de Configuración
      const configLink = document.getElementById('configLink');
      // Verificar si PERMISSIONS existe antes de usarlo
      if (configLink) {
        if (typeof PERMISSIONS !== 'undefined' && PERMISSIONS[roleName]?.canAccessConfig) {
          configLink.style.display = '';
        } else if (typeof PERMISSIONS === 'undefined') {
          // Si PERMISSIONS no está cargado, mostrar por defecto
          configLink.style.display = '';
        }
      }
    }
  } catch (error) {
    console.error('Error al verificar permisos:', error);
  }
}

// ====== INICIALIZAR ======
document.addEventListener('DOMContentLoaded', () => {
  console.log('📊 Inicializando vista de seguimiento...');

  // Verificar permisos del usuario
  checkUserPermissions();

  // Cargar perfil de usuario
  updateUserProfile();

  // Obtener datos del documento desde URL
  const docData = getDocumentDataFromURL();

  // ✅ Guardar tipo de documento en variable global
  currentDocumentType = docData.type || 'normal';
  console.log(`📋 Tipo de documento establecido: ${currentDocumentType}`);

  // ✅ Mostrar badge si es pagaré
  if (currentDocumentType === 'pagare') {
    const badge = document.getElementById('documentTypeBadge');
    if (badge) {
      badge.style.display = 'inline-flex';
      console.log('✅ Badge de pagaré mostrado');
    }
  }

  // ✅ Verificar si hay un documento válido
  if (!docData.id || docData.id === 'null' || docData.id === 'undefined') {
    console.log('⚠️ No hay documento válido en la URL');
    showNoDocumentState();
    return;
  }

  // Actualizar título
  const titleEl = document.getElementById('documentTitle');
  if (titleEl) titleEl.textContent = docData.name;

  const folderEl = document.getElementById('folderName');
  if (folderEl) folderEl.textContent = docData.folder;

  // Mostrar/ocultar botón de trazabilidad
  toggleAuditButton();

  // Verificar si el documento tiene campos asignados
  checkDocumentFields(docData.id, docData.name);

  console.log('✅ Vista de seguimiento lista');
});

// ====== MOSTRAR ESTADO: NO HAY DOCUMENTO ======
function showNoDocumentState() {
  const noDocState = document.getElementById('noDocumentState');
  const docHeader = document.getElementById('documentHeader');
  const trackingSection = document.getElementById('trackingSection');
  const emptyState = document.getElementById('emptyState');
  const banner = document.getElementById('unassignedBanner');

  if (noDocState) noDocState.style.display = 'block';
  if (docHeader) docHeader.style.display = 'none';
  if (trackingSection) trackingSection.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';
  if (banner) banner.style.display = 'none';

  console.log('📄 Mostrando estado: Sin documento');
}

// ====== VERIFICAR CAMPOS DEL DOCUMENTO ======
async function checkDocumentFields(docId, docName) {
  console.log('🔍 Verificando campos del documento:', docId);
  
  try {
    // ✅ CORREGIDO: Usar currentUser en lugar de token
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      console.error('❌ No hay usuario autenticado');
      return;
    }

    const user = JSON.parse(userStr);

    const response = await fetch(`/api/documents/${docId}/fields?user_id=${user.user_id}`);

    if (!response.ok) {
      throw new Error('Error al obtener campos');
    }

    const data = await response.json();
    const fields = data.data?.fields || [];

    console.log(`📋 Campos encontrados: ${fields.length}`);

    // 🔥 CAMBIO: Verificar si hay destinatarios antes de mostrar el banner
    const recipientsResponse = await fetch(`/api/documents/${docId}/recipients?user_id=${user.user_id}`);
    const recipientsData = await recipientsResponse.json();
    const hasRecipients = recipientsData.success && recipientsData.data?.recipients && recipientsData.data.recipients.length > 0;

    if (fields.length === 0 && !hasRecipients) {
      // Sin campos Y sin destinatarios → Mostrar banner
      showUnassignedBanner(docId, docName);
      stopAutoRefresh();
    } else {
      // Con campos O con destinatarios → Ocultar banner y mostrar tracking
      hideUnassignedBanner();

      // Cargar destinatarios reales desde el backend
      loadRecipients(docId);

      // Activar auto-refresh solo si hay campos (para actualizar estados de firma)
      if (fields.length > 0) {
        startAutoRefresh(docId);
      }
    }

  } catch (error) {
    console.error('❌ Error al verificar campos:', error);
    // En caso de error, mostrar empty state
    hideUnassignedBanner();
    renderRecipients([]);
    stopAutoRefresh();
  }
}

// ====== CARGAR DESTINATARIOS DESDE EL BACKEND ======
async function loadRecipients(docId) {
  try {
    console.log('👥 Cargando destinatarios del documento:', docId);
    
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      console.error('❌ No hay usuario autenticado');
      renderRecipients([]);
      return;
    }

    const user = JSON.parse(userStr);

    // Llamar al endpoint de destinatarios
    const response = await fetch(`/api/documents/${docId}/recipients?user_id=${user.user_id}`);
    const data = await response.json();
    
    if (data.success && data.data && data.data.recipients) {
      console.log(`✅ ${data.data.recipients.length} destinatarios cargados`);
      renderRecipients(data.data.recipients, data.data.tv_guids_by_group || {}, data.data.pagare_sealed || false);
    } else {
      console.log('ℹ️ No hay destinatarios para este documento');
      renderRecipients([]);
    }

  } catch (error) {
    console.error('❌ Error al cargar destinatarios:', error);
    renderRecipients([]);
  }
}

// Auto-refresh cada 10 segundos para actualizar estados
let autoRefreshInterval = null;

function startAutoRefresh(docId) {
  // Limpiar intervalo anterior si existe
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  
  // Crear nuevo intervalo
  autoRefreshInterval = setInterval(() => {
    console.log('🔄 Auto-refresh de destinatarios...');
    loadRecipients(docId);
  }, 10000); // 10 segundos
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ====== MOSTRAR BANNER "NO ASIGNADO" ======
function showUnassignedBanner(docId, docName) {
  console.log('⚠️ Mostrando banner de sin campos asignados');

  const banner = document.getElementById('unassignedBanner');
  const trackingSection = document.getElementById('trackingSection');

  if (banner) {
    banner.style.display = 'flex';
  }

  if (trackingSection) {
    trackingSection.style.display = 'none';
  }

  // Configurar botón "EDITAR Y ASIGNAR CAMPOS"
  const editBtn = document.getElementById('editFieldsBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      console.log('🎨 Redirigiendo a editor de campos...');
      console.log('📋 Tipo de documento:', currentDocumentType);
      window.location.href = `/sign.html?id=${docId}&name=${encodeURIComponent(docName)}&mode=prepare&documentType=${currentDocumentType}`;
    };
  }
}

// ====== OCULTAR BANNER "NO ASIGNADO" ======
function hideUnassignedBanner() {
  const banner = document.getElementById('unassignedBanner');
  const trackingSection = document.getElementById('trackingSection');
  
  if (banner) {
    banner.style.display = 'none';
  }
  
  if (trackingSection) {
    trackingSection.style.display = 'block';
  }
}

// ====== MODAL DE DESTINATARIOS ======

// Cerrar modal
function closeRecipientsModal() {
  const modal = document.getElementById('recipientsModal');
  if (modal) {
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    
    // Limpiar campos si existen (en modo sin roles)
    const emailInput = document.getElementById('emailInput');
    const phoneInput = document.getElementById('phoneInput');
    if (emailInput) emailInput.value = '';
    if (phoneInput) phoneInput.value = '';
    
    // Limpiar inputs de roles si existen (en modo con roles)
    document.querySelectorAll('.role-email-input').forEach(input => {
      input.value = '';
    });
  }
}

// Event listeners del modal
document.getElementById('recipientsClose')?.addEventListener('click', closeRecipientsModal);
document.getElementById('recipientsCancel')?.addEventListener('click', closeRecipientsModal);

// Cerrar al hacer click fuera del modal
document.getElementById('recipientsModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'recipientsModal') {
    closeRecipientsModal();
  }
});

// Cambiar pestañas
document.querySelectorAll('.recipients-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    
    // Desactivar todas las pestañas
    document.querySelectorAll('.recipients-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Activar la pestaña seleccionada
    tab.classList.add('active');
    document.getElementById(`tab-${tabName}`)?.classList.add('active');
  });
});

// ✅ Función para enviar pagarés masivos
async function sendPagaresBulk() {
  try {
    console.log('📋 Iniciando envío masivo de pagarés');

    // Validar que se haya cargado el CSV
    if (!window.pagareCsvData || window.pagareCsvData.length === 0) {
      ToastManager.error('Error', 'Debes cargar un archivo CSV primero');
      return;
    }

    // Firmante definitivo (solo si el documento tiene campo final_signature)
    const finalSignerStep = document.getElementById('finalSignerStep');
    const finalSignerActive = finalSignerStep && finalSignerStep.dataset.active === 'true';
    const finalSignerEmail = finalSignerActive ? (document.getElementById('finalSignerEmail')?.value.trim() || '') : '';
    const finalSignerName = finalSignerActive ? (document.getElementById('finalSignerName')?.value.trim() || '') : '';

    if (finalSignerActive) {
      if (!finalSignerEmail || !finalSignerName) {
        ToastManager.error('Error', 'Debes completar los datos del firmante definitivo');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(finalSignerEmail)) {
        ToastManager.error('Error', 'El email del firmante definitivo no es válido');
        return;
      }
    }

    const docData = getDocumentDataFromURL();
    const userStr = localStorage.getItem('currentUser');
    const user = JSON.parse(userStr);

    // Enviar al backend
    const response = await fetch(`/api/documents/${docData.id}/pagare/send-bulk?user_id=${user.user_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        csvData: window.pagareCsvData,
        finalSignerEmail,
        finalSignerName,
        user_id: user.user_id
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al procesar pagarés');
    }

    ToastManager.success('Pagarés procesados', result.message);
    console.log('✅ Pagarés enviados:', result);

    // Cerrar modal y recargar
    const modal = document.getElementById('recipientsModal');
    modal?.classList.remove('show');
    modal?.setAttribute('aria-hidden', 'true');

    // Recargar destinatarios
    setTimeout(() => {
      window.location.reload();
    }, 1500);

  } catch (error) {
    console.error('❌ Error al enviar pagarés:', error);
    ToastManager.error('Error', error.message || 'No se pudieron enviar los pagarés');
  }
}

// Agregar destinatarios
const recipientsAddBtn = document.getElementById('recipientsAdd');
console.log('🔍 [TRACKING.JS INIT] Buscando botón recipientsAdd:', recipientsAddBtn);

if (!recipientsAddBtn) {
  console.error('❌ [TRACKING.JS INIT] Botón recipientsAdd NO encontrado!');
} else {
  console.log('✅ [TRACKING.JS INIT] Botón recipientsAdd encontrado, agregando event listener');
}

recipientsAddBtn?.addEventListener('click', async (event) => {
  console.log('📤 [TRACKING.JS] Click en botón AGREGAR DESTINATARIOS');
  console.log('📤 [TRACKING.JS] Event:', event);
  console.log('📤 [TRACKING.JS] Target:', event.target);

  // ✅ MODO PAGARÉ: Enviar pagarés masivos
  const currentActiveTab = document.querySelector('.recipients-tab.active')?.dataset.tab;
  if (currentDocumentType === 'pagare' && currentActiveTab === 'pagare') {
    console.log('📋 Modo pagaré detectado - Enviando pagarés masivos');
    await sendPagaresBulk();
    return; // Salir para no ejecutar la lógica normal
  }

  // 🔥 VERIFICAR PRIMERO: Si hay destinatarios cargados desde CSV (modo masivo)
  // Esto debe ir ANTES de la validación de roles para evitar falsos positivos
  const hasBulkRecipients = typeof window.bulkRecipients !== 'undefined' &&
                            Array.isArray(window.bulkRecipients) &&
                            window.bulkRecipients.length > 0;

  console.log('🔍 Debug envío masivo:');
  console.log('   window.bulkRecipients:', window.bulkRecipients);
  console.log('   hasBulkRecipients:', hasBulkRecipients);
  console.log('   window.sendBulkEmails existe:', typeof window.sendBulkEmails === 'function');

  // Si hay destinatarios bulk cargados Y la función sendBulkEmails existe
  if (hasBulkRecipients && typeof window.sendBulkEmails === 'function') {
    // Validar unicidad de emails en bulkRecipients
    const emails = window.bulkRecipients.map(r => r.email && r.email.trim().toLowerCase()).filter(Boolean);
    const emailSet = new Set();
    let duplicateEmail = null;
    for (const email of emails) {
      if (emailSet.has(email)) {
        duplicateEmail = email;
        break;
      }
      emailSet.add(email);
    }
    if (duplicateEmail) {
      ToastManager.error('Email duplicado','El email "' + duplicateEmail + '" está repetido en la lista.');
      return;
    }
    await window.sendBulkEmails();
    return; // Salir para no ejecutar la lógica de envío individual
  }

  console.log('📤 Modo envío individual - procesando destinatarios...');

  // 🔥 VALIDACIÓN DE ROLES (solo si NO es envío masivo por CSV)
  // Validar que existan partes/roles si el documento lo requiere
  if (documentRoles && Array.isArray(documentRoles) && documentRoles.length > 0) {
    // Validar que cada parte tenga un email asignado (en modo roles manual)
    const roleEmailInputs = document.querySelectorAll('.role-email-input');
    let missingRole = false;
    documentRoles.forEach(role => {
      const input = Array.from(roleEmailInputs).find(inp => parseInt(inp.dataset.roleId) === role.roleId);
      if (!input || !input.value.trim()) {
        missingRole = true;
      }
    });
    if (missingRole) {
      ToastManager.error('Faltan destinatarios','Debes asignar un email a cada parte/rol antes de enviar.');
      return;
    }
  }

  const activeTab = document.querySelector('.recipients-tab.active')?.dataset.tab;
  const recipients = [];

  // Obtener destinatarios según la pestaña activa
  if (activeTab === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Verificar si hay roles/partes configuradas
    if (documentRoles && documentRoles.length > 0) {
      // Modo con roles: recolectar de inputs por rol
      console.log('📋 Modo con roles activado');
      const roleEmailInputs = document.querySelectorAll('.role-email-input');

      if (roleEmailInputs.length === 0) {
        ToastManager.warning('Sin destinatarios', 'Debes agregar al menos un email');
        return;
      }

      // Validar unicidad de emails en roles
      const emails = [];
      roleEmailInputs.forEach(input => {
        const email = input.value.trim();
        const roleId = parseInt(input.dataset.roleId);

        if (email) {
          if (!emailRegex.test(email)) {
            ToastManager.error('Email inválido', `El email "${email}" no es válido`);
            throw new Error('Email inválido');
          }
          emails.push(email.toLowerCase());
          recipients.push({
            email: email,
            roleId: roleId
          });
        }
      });
      // Validar duplicados
      const emailSet = new Set();
      let duplicateEmail = null;
      for (const email of emails) {
        if (emailSet.has(email)) {
          duplicateEmail = email;
          break;
        }
        emailSet.add(email);
      }
      if (duplicateEmail) {
        ToastManager.error('Email duplicado', `El email "${duplicateEmail}" está repetido entre los roles.`);
        return;
      }

      if (recipients.length === 0) {
        ToastManager.warning('Sin destinatarios', 'Debes agregar al menos un email');
        return;
      }

    } else {
      // Modo sin roles: usar textarea simple
      console.log('📝 Modo sin roles activado');
      const emailText = document.getElementById('emailInput')?.value.trim();

      if (!emailText) {
        ToastManager.warning('Sin destinatarios', 'Debes agregar al menos un email');
        return;
      }

      // Separar por líneas, comas o espacios
      const emails = emailText.split(/[\n,\s]+/).filter(e => e.trim());

      // Validar emails y unicidad
      const emailSet = new Set();
      for (const email of emails) {
        if (!emailRegex.test(email)) {
          ToastManager.error('Email inválido', `El email "${email}" no es válido`);
          return;
        }
        const lower = email.trim().toLowerCase();
        if (emailSet.has(lower)) {
          ToastManager.error('Email duplicado', `El email "${email}" está repetido.`);
          return;
        }
        emailSet.add(lower);
        recipients.push({ email: email.trim() });
      }
    }
  } else if (activeTab === 'phone') {
    const phoneText = document.getElementById('phoneInput').value.trim();
    if (!phoneText) {
      ToastManager.warning('Sin destinatarios', 'Debes agregar al menos un teléfono');
      return;
    }

    // Obtener rol/parte seleccionada
    const selectedRoleId = document.getElementById('phonePartSelect')?.value;

    // Validar que se haya seleccionado una parte si hay roles configurados
    if (documentRoles.length > 0 && !selectedRoleId) {
      ToastManager.warning('Parte requerida', 'Debes seleccionar una parte para los destinatarios');
      return;
    }

    // Separar por líneas, comas o espacios
    const phones = phoneText.split(/[\n,\s]+/).filter(p => p.trim());

    for (const phone of phones) {
      const recipient = { phone: phone.trim() };

      // Agregar roleId si está seleccionado
      if (selectedRoleId) {
        recipient.roleId = parseInt(selectedRoleId);
      }

      recipients.push(recipient);
    }
  } else if (activeTab === 'detailed') {
    const name = document.querySelector('#tab-detailed input[placeholder="Nombre completo"]').value.trim();
    const email = document.querySelector('#tab-detailed input[placeholder="Correo electrónico"]').value.trim();

    if (!email) {
      ToastManager.warning('Email requerido', 'Debes proporcionar un email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      ToastManager.error('Email inválido', `El email "${email}" no es válido`);
      return;
    }

    recipients.push({ email: email, name: name || email });
  } else {
    ToastManager.info('En desarrollo', 'Esta opción estará disponible pronto');
    return;
  }

  if (recipients.length === 0) {
    ToastManager.warning('Sin destinatarios', 'Debes agregar al menos un destinatario');
    return;
  }

  console.log(`   📧 Destinatarios: ${recipients.length}`, recipients);
  
  // Obtener datos del documento
  const docData = getDocumentDataFromURL();
  if (!docData.id) {
    ToastManager.error('Error', 'No se pudo identificar el documento');
    return;
  }
  
  // Obtener usuario actual
  const user = getCurrentUser();
  if (!user || !user.user_id) {
    ToastManager.error('Error', 'No hay sesión activa');
    window.location.href = './login.html';
    return;
  }
  
  try {
    // Enviar al backend
    const response = await fetch(`/api/documents/${docData.id}/send?user_id=${user.user_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipients })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Error al enviar documento');
    }
    
    console.log('✅ Documento enviado:', data);
    
    ToastManager.success(
      '¡Documento enviado!',
      `Se envió a ${recipients.length} destinatario(s)`
    );
    
    // Cerrar modal
    closeRecipientsModal();
    
    // Recargar destinatarios y activar auto-refresh
    loadRecipients(docData.id);
    startAutoRefresh(docData.id);
    
  } catch (error) {
    console.error('❌ Error al enviar documento:', error);
    ToastManager.error('Error', error.message || 'No se pudo enviar el documento');
  }
});

// ====== FUNCIONES DE ACTUALIZACIÓN DE DOCUMENTOS ======

/**
 * Actualizar documento (cambiar title, status, etc.)
 */
async function updateDocument(docId, updates) {
  const user = getCurrentUser();
  if (!user) return false;

  try {
    console.log(`📝 [API] Actualizando documento ${docId}:`, updates);
    
    const response = await fetch(`/api/documents/${docId}?user_id=${user.user_id}`, {
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
 * Duplicar documento
 */
async function duplicateDocument(docId) {
  const user = getCurrentUser();
  if (!user) return null;

  try {
    console.log(`📋 [API] Duplicando documento ${docId}`);
    
    const response = await fetch(`/api/documents/${docId}/duplicate?user_id=${user.user_id}`, {
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
 * Modal de confirmación
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
 * Modal de edición de nombre
 */
function showEditModal(currentName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('editModal');
    const input = document.getElementById('edit-name-input');
    const saveBtn = document.getElementById('edit-save');
    const cancelBtn = document.getElementById('edit-cancel');
    const closeBtn = document.getElementById('edit-close');

    if (!modal || !input) {
      console.error('❌ Modal de edición no encontrado');
      resolve(null);
      return;
    }

    input.value = currentName;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    
    // Focus en el input después de un momento
    setTimeout(() => input.focus(), 100);

    const close = () => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    };

    const handleSave = () => {
      const newName = input.value.trim();
      close();
      resolve(newName);
    };

    const handleCancel = () => {
      close();
      resolve(null);
    };

    saveBtn.onclick = handleSave;
    cancelBtn.onclick = handleCancel;
    closeBtn.onclick = handleCancel;
    
    // También permitir guardar con Enter
    input.onkeypress = (e) => {
      if (e.key === 'Enter') {
        handleSave();
      }
    };
  });
}

// ====== LISTENERS DE BOTONES DE ACCIÓN ======

// Botón ARCHIVAR
document.getElementById('archiveBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  const docData = getDocumentDataFromURL();
  
  const confirmed = await showConfirmModal(
    'Archivar documento',
    `¿Estás seguro de que deseas archivar "${docData.name}"? Podrás restaurarlo desde la pestaña Archivadas.`
  );
  
  if (confirmed) {
    const success = await updateDocument(docData.id, { status: 'archived' });
    if (success) {
      ToastManager.show({
        type: 'info',
        title: 'Documento archivado',
        message: 'El documento se movió a archivados'
      });
      // Redirigir al index
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1500);
    } else {
      ToastManager.show({
        type: 'error',
        title: 'Error',
        message: 'No se pudo archivar el documento'
      });
    }
  }
});

// Botón CLONAR
document.getElementById('cloneBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  const docData = getDocumentDataFromURL();
  
  ToastManager.show({
    type: 'info',
    title: 'Duplicando documento',
    message: 'Creando una copia del documento...'
  });
  
  try {
    const duplicated = await duplicateDocument(docData.id);
    if (duplicated) {
      ToastManager.show({
        type: 'success',
        title: 'Documento duplicado',
        message: 'Se creó una copia del documento'
      });
      // Redirigir al index para ver la copia
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 1500);
    } else {
      ToastManager.show({
        type: 'error',
        title: 'Error al duplicar',
        message: 'El archivo original no fue encontrado en el servidor. Es posible que el documento esté corrupto o haya sido eliminado.'
      });
    }
  } catch (error) {
    console.error('Error al duplicar:', error);
    ToastManager.show({
      type: 'error',
      title: 'Error al duplicar',
      message: error.message || 'No se pudo duplicar el documento. Verifica que el archivo original exista.'
    });
  }
});

// Botón EDITAR (renombrar)
document.getElementById('editBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  const docData = getDocumentDataFromURL();
  const titleEl = document.getElementById('documentTitle');
  
  // Usar modal personalizado en lugar de prompt
  const newName = await showEditModal(docData.name);
  
  if (newName && newName !== docData.name) {
    const success = await updateDocument(docData.id, { title: newName });
    if (success) {
      if (titleEl) titleEl.textContent = newName;
      // Actualizar URL también
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('name', newName);
      window.history.replaceState({}, '', newUrl);
      
      ToastManager.show({
        type: 'success',
        title: 'Documento renombrado',
        message: 'El nombre se actualizó correctamente'
      });
    } else {
      ToastManager.show({
        type: 'error',
        title: 'Error',
        message: 'No se pudo renombrar el documento'
      });
    }
  }
});


// ====== GESTIÓN DE PLANTILLA CSV PARA SUBIR LISTA ======

// Variable global para almacenar info de la plantilla y campos detectados
let currentTemplateData = null;

// Función para cargar información de la plantilla al abrir el modal
async function loadTemplateInfoForUpload(documentId) {
  console.log('📋 Cargando información de plantilla para documento:', documentId);
  
  try {
    const user = getCurrentUser();
    if (!user || !user.user_id) {
      console.error('❌ No hay usuario autenticado');
      return;
    }

    // Obtener información del documento y sus campos
    const response = await fetch(`/api/templates/${documentId}?user_id=${user.user_id}`);
    
    if (!response.ok) {
      throw new Error('Error al cargar template');
    }

    const data = await response.json();
    const template = data.data;
    
    console.log('✅ Template cargado:', template);
    
    // Guardar datos de la plantilla
    currentTemplateData = template;
    
    // Actualizar UI de la sección "Subir lista"
    updateUploadListUI(template);
    
  } catch (error) {
    console.error('❌ Error al cargar template info:', error);
    currentTemplateData = null;
  }
}

// Función para actualizar la UI del tab "Subir lista"
function updateUploadListUI(template) {
  const templateNameDisplay = document.getElementById('templateNameDisplay');
  const templateIdDisplay = document.getElementById('templateIdDisplay');
  const templateFieldsInfo = document.getElementById('templateFieldsInfo');
  const sendModeSelector = document.getElementById('sendModeSelector');
  const csvColumnsPreviewManual = document.getElementById('csvColumnsPreviewManual');
  const csvColumnsPreviewFull = document.getElementById('csvColumnsPreviewFull');
  
  if (!templateNameDisplay || !sendModeSelector) {
    console.warn('⚠️ Elementos UI no encontrados');
    console.warn('templateNameDisplay:', templateNameDisplay);
    console.warn('sendModeSelector:', sendModeSelector);
    return;
  }

  // Actualizar nombre e ID de la plantilla
  templateNameDisplay.textContent = template.title || 'Sin nombre';
  if (templateIdDisplay) {
    templateIdDisplay.textContent = `ID: ${template.id}`;
  }

  // Filtrar solo campos de texto (no signature ni seal)
  const textFields = template.fields.filter(f => 
    f.field_type === 'text' || f.field_type === 'date' || f.field_type === 'number'
  );

  console.log(`📝 Campos de texto detectados: ${textFields.length} de ${template.fields.length} totales`);

  // Mostrar info de campos detectados
  if (templateFieldsInfo) {
    templateFieldsInfo.style.display = 'block';
    const fieldsCount = document.getElementById('fieldsCount');
    if (fieldsCount) {
      fieldsCount.textContent = textFields.length;
    }
  }

  if (textFields.length === 0) {
    // Sin campos de texto → Ocultar selector
    console.log('⚠️ No hay campos de texto, ocultando selector');
    sendModeSelector.style.display = 'none';
  } else {
    // Con campos de texto → Mostrar selector y generar previews
    console.log('✅ Hay campos de texto, mostrando selector');
    sendModeSelector.style.display = 'block';
    
    // Preview para modo CSV (roles + campos)
    if (csvColumnsPreviewFull) {
      const roleColumns = [];
      template.parts.forEach(p => {
        roleColumns.push(`${p.name} - Nombre`);
        roleColumns.push(`${p.name} - Email`);
      });
      const fieldColumns = textFields.map(f => f.field_label || `Campo ${f.id}`);
      const allColumns = [...roleColumns, ...fieldColumns];
      
      csvColumnsPreviewFull.innerHTML = `
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${allColumns.map(col => `
            <span style="background: #dbeafe; color: #1e3a8a; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">
              ${col}
            </span>
          `).join('')}
        </div>
      `;
    }

    // ✅ NUEVO: Cargar valores asignados si existen en document_field_values
    loadAssignedFieldValues(template.id);
  }
}

// ✅ NUEVA FUNCIÓN: Cargar valores asignados desde la BD
async function loadAssignedFieldValues(documentId) {
  try {
    const user = getCurrentUser();
    if (!user || !user.user_id) return;

    const response = await fetch(`/api/documents/${documentId}/field-values?user_id=${user.user_id}`);
    const result = await response.json();

    if (result.success && result.fieldValues && Object.keys(result.fieldValues).length > 0) {
      console.log('✅ Valores asignados cargados:', result.fieldValues);

      // Actualizar indicador usando la función de tracking.html
      if (typeof window.updateAssignedFieldsIndicator === 'function') {
        window.updateAssignedFieldsIndicator(result.fieldValues);
      }
    } else {
      console.log('ℹ️ No hay valores asignados para este documento');
      // Resetear indicador
      if (typeof window.updateAssignedFieldsIndicator === 'function') {
        window.updateAssignedFieldsIndicator({});
      }
    }
  } catch (error) {
    console.error('❌ Error cargando valores asignados:', error);
  }
}

// Evento para descargar plantilla CSV
document.getElementById('downloadCsvTemplateBtn')?.addEventListener('click', async () => {
  console.log('📥 Descargando plantilla CSV...');
  
  if (!currentTemplateData) {
    ToastManager.error('Error', 'No hay datos de plantilla cargados');
    return;
  }

  try {
    // Generar CSV con columnas dinámicas
    const csvContent = generateCSVTemplate(currentTemplateData);
    
    // Crear blob y descargar
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plantilla_${currentTemplateData.title.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    ToastManager.success('Descarga completada', 'La plantilla CSV se descargó correctamente');
    
  } catch (error) {
    console.error('❌ Error al descargar CSV:', error);
    ToastManager.error('Error', 'No se pudo descargar la plantilla CSV');
  }
});

// Event listeners para cambiar entre modos
document.getElementById('modeManualBtn')?.addEventListener('click', function() {
  const csvBtn = document.getElementById('modeCsvBtn');

  // Agregar clase 'active' al botón manual y quitársela al CSV
  this.classList.add('active');
  csvBtn.classList.remove('active');

  // Activar botón manual (estilos visuales)
  this.style.background = '#16a34a';
  this.style.color = 'white';
  csvBtn.style.background = 'white';
  csvBtn.style.color = '#16a34a';

  // Mostrar contenido manual
  document.getElementById('manualModeContent').style.display = 'block';
  document.getElementById('csvModeContent').style.display = 'none';

  console.log('📝 Modo MANUAL activado');
});

document.getElementById('modeCsvBtn')?.addEventListener('click', function() {
  const manualBtn = document.getElementById('modeManualBtn');

  // Agregar clase 'active' al botón CSV y quitársela al manual
  this.classList.add('active');
  manualBtn.classList.remove('active');

  // Activar botón CSV (estilos visuales)
  this.style.background = '#16a34a';
  this.style.color = 'white';
  manualBtn.style.background = 'white';
  manualBtn.style.color = '#16a34a';

  // Mostrar contenido CSV
  document.getElementById('manualModeContent').style.display = 'none';
  document.getElementById('csvModeContent').style.display = 'block';

  console.log('📊 Modo CSV activado');
});

// Botón para asignar valores a campos de texto (modo manual)
document.getElementById('fillFieldsManualBtn')?.addEventListener('click', () => {
  console.log('✏️ Abriendo modal para asignar valores a campos...');
  
  if (!currentTemplateData) {
    ToastManager.error('Error', 'No hay datos de plantilla cargados');
    return;
  }

  // Exponer currentTemplateData globalmente para que openDynamicFillModal pueda acceder
  window.currentTemplateData = currentTemplateData;
  
  // Llamar a la función global openDynamicFillModal
  if (typeof window.openDynamicFillModal === 'function') {
    window.openDynamicFillModal();
  } else {
    ToastManager.error('Error', 'Función de modal no disponible');
    console.error('❌ openDynamicFillModal no está definida');
  }
});

// Descargar CSV COMPLETO (roles + campos)
document.getElementById('downloadCsvFullBtn')?.addEventListener('click', async () => {
  console.log('📥 Descargando CSV completo (roles + campos)...');
  
  if (!currentTemplateData) {
    ToastManager.error('Error', 'No hay datos de plantilla cargados');
    return;
  }

  try {
    const csvContent = generateCSVFull(currentTemplateData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plantilla_completa_${currentTemplateData.title.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    ToastManager.success('Descarga completada', 'CSV completo descargado');
  } catch (error) {
    console.error('❌ Error al descargar CSV completo:', error);
    ToastManager.error('Error', 'No se pudo descargar el CSV');
  }
});

// Función para generar CSV COMPLETO (roles + campos con labels reales extraídos del PDF)
// Estructura: Parte, Email, Nombre | Campo1, Campo2, Campo3...
async function generateCSVFull(template) {
  console.log('🔍 [generateCSVFull] Generando CSV completo...');
  console.log('📊 Template recibido:', template);
  console.log('👥 Partes:', template.parts);
  console.log('📋 Campos totales:', template.fields);
  console.log('📋 ¿Tiene fields?:', template.fields ? 'SÍ' : 'NO');
  console.log('📋 ¿Es array?:', Array.isArray(template.fields));
  console.log('📋 Length:', template.fields?.length);

  // 1. Headers base: depende si hay partes o no
  const hasParts = template.parts && Array.isArray(template.parts) && template.parts.length > 0;

  const headers = hasParts
    ? ['Parte', 'Email', 'Nombre']  // Con partes: incluir columna "Parte"
    : ['Email', 'Nombre'];           // Sin partes: solo Email y Nombre

  console.log(`✅ Headers base agregados (${hasParts ? 'CON' : 'SIN'} partes):`, headers);

  // 2. Filtrar campos de texto
  const textFields = template.fields.filter(f =>
    f.field_type === 'text' || f.field_type === 'date' || f.field_type === 'number'
  );

  console.log(`📝 Campos de texto filtrados: ${textFields.length}`, textFields);

  // 3. Obtener labels extraídos del PDF (igual que en el modal "Rellenar campos")
  let labels = {};
  const templateId = template.document_id || template.id;
  try {
    console.log(`🌐 Obteniendo labels del PDF para template ${templateId}...`);
    // ✅ NO usar force=true para respetar labels guardados desde sign.html
    const labelResponse = await fetch(`/api/templates/${templateId}/extract-labels`);
    const labelResult = await labelResponse.json();
    labels = labelResult.success ? labelResult.data.labels : {};
    console.log('🏷️ Labels extraídos del PDF - objeto completo:', labels);
    console.log('🏷️ Cantidad de labels:', Object.keys(labels).length);
    console.log('🏷️ IDs de campos con labels:', Object.keys(labels));
    console.log('🏷️ Valores de labels:', Object.values(labels));
    console.log('🏷️ Fuente de labels:', labelResult.data?.source || 'PDF');
  } catch (error) {
    console.warn('⚠️ No se pudieron extraer labels del PDF:', error);
  }


  // 4. Agregar columnas de campos con sus labels reales, manejando duplicados automáticamente
  const usedLabels = new Map(); // Mapa: label → contador de ocurrencias
  const fieldLabelsMap = new Map(); // Mapa: field.id → label final único

  textFields.forEach(field => {
    let baseLabel = labels[field.id] || field.field_label || field.field_key || field.name || `Campo ${field.id}`;

    if (!baseLabel || baseLabel.trim() === "") {
      baseLabel = `Campo ${field.id}`;
    }

    baseLabel = baseLabel.trim();

    // Si el label ya existe, agregar sufijo numérico
    let finalLabel = baseLabel;
    if (usedLabels.has(baseLabel)) {
      const count = usedLabels.get(baseLabel);
      usedLabels.set(baseLabel, count + 1);
      finalLabel = `${baseLabel} ${count + 1}`;
      console.log(`⚠️ Label duplicado "${baseLabel}" → renombrado a "${finalLabel}"`);
    } else {
      usedLabels.set(baseLabel, 1);
    }

    fieldLabelsMap.set(field.id, finalLabel);
    headers.push(finalLabel);
  });

  console.log('✅ Headers finales:', headers);
  console.log(`📊 Total de columnas: ${hasParts ? 3 : 2} (base) + ${textFields.length} campos = ${headers.length} total`);

  // 5. Generar CSV
  const csvRows = [];
  csvRows.push(headers.join(','));

  // 6. Agregar filas de ejemplo
  if (hasParts) {
    // Con partes: una fila por cada parte
    template.parts.forEach(part => {
      const row = [part.name, '', ''];  // Parte, Email vacío, Nombre vacío
      // Agregar celdas vacías para cada campo de texto
      for (let i = 0; i < textFields.length; i++) {
        row.push('');
      }
      csvRows.push(row.join(','));
    });
  } else {
    // Sin partes: agregar 1 fila de ejemplo vacía
    const row = ['', ''];  // Email vacío, Nombre vacío
    // Agregar celdas vacías para cada campo de texto
    for (let i = 0; i < textFields.length; i++) {
      row.push('');
    }
    csvRows.push(row.join(','));
    console.log('📝 Agregada 1 fila de ejemplo (sin partes)');
  }

  const csvContent = csvRows.join('\n');
  console.log('📄 CSV generado:');
  console.log(csvContent);

  return csvContent;
}

// Función para descargar la plantilla según el modo activo
async function downloadBulkTemplate() {
  console.log('🚀 [downloadBulkTemplate] Iniciando descarga de plantilla CSV...');
  console.log('📦 currentTemplateData:', currentTemplateData);

  if (!currentTemplateData) {
    console.error('❌ No hay currentTemplateData');
    ToastManager.error('Error', 'Selecciona primero una plantilla');
    return;
  }

  // Detectar modo activo
  const manualBtn = document.getElementById('modeManualBtn');
  const csvBtn = document.getElementById('modeCsvBtn');

  console.log('🔍 Botones encontrados:');
  console.log('   - modeManualBtn:', manualBtn);
  console.log('   - modeCsvBtn:', csvBtn);
  console.log('   - modeManualBtn.classList:', manualBtn?.classList);
  console.log('   - modeCsvBtn.classList:', csvBtn?.classList);

  let csvContent = '';
  let fileName = '';

  try {
    if (manualBtn && manualBtn.classList.contains('active')) {
      console.log('✅ Modo MANUAL activo');
      // Modo manual: solo roles (Nombre y Email por cada parte)
      csvContent = generateCSVManual(currentTemplateData);
      const templateId = currentTemplateData.document_id || currentTemplateData.id;
      fileName = `plantilla_firmantes_${templateId}.csv`;
    } else if (csvBtn && csvBtn.classList.contains('active')) {
      console.log('✅ Modo CSV COMPLETO activo');
      // Modo CSV completo: roles + campos de texto con labels (async)
      csvContent = await generateCSVFull(currentTemplateData);
      const templateId = currentTemplateData.document_id || currentTemplateData.id;
      fileName = `plantilla_completa_${templateId}.csv`;
    } else {
      console.error('❌ Ningún modo está activo');
      ToastManager.error('Error', 'Selecciona un modo (Manual o CSV)');
      return;
    }

    console.log('📄 CSV Content generado:', csvContent);
    console.log('📝 Nombre del archivo:', fileName);

    // Descargar el CSV con BOM para UTF-8 (para que Excel lo reconozca)
    const BOM = '\uFEFF'; // UTF-8 BOM
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    ToastManager.success('Descarga completada', 'Plantilla CSV descargada correctamente');
    console.log('✅ Descarga completada');
  } catch (error) {
    console.error('❌ Error al generar/descargar CSV:', error);
    ToastManager.error('Error', 'No se pudo generar el CSV');
  }
}

// Función para generar CSV MANUAL (solo roles)
// Estructura: Parte, Email, Nombre
function generateCSVManual(template) {
  console.log('🔍 [generateCSVManual] Generando CSV manual (solo partes)...');
  console.log('👥 Partes:', template.parts);

  // Headers base: Parte, Email, Nombre
  const headers = ['Parte', 'Email', 'Nombre'];

  // Generar CSV
  const csvRows = [];
  csvRows.push(headers.join(','));

  // Agregar filas con los nombres de las partes + celdas vacías
  template.parts.forEach(part => {
    csvRows.push(`${part.name},,`);  // Parte, Email vacío, Nombre vacío
  });

  console.log('📄 CSV manual generado:');
  console.log(csvRows.join('\n'));

  return csvRows.join('\n');
}

// ====== FUNCIONES PARA PAGARÉS ======

// Descargar plantilla CSV para pagarés
async function downloadPagareTemplate(docId) {
  try {
    console.log('📥 Generando plantilla CSV para pagaré:', docId);

    const numericId = parseInt(docId);
    if (!docId || isNaN(numericId) || numericId <= 0) {
      ToastManager.error('Error', 'ID de documento inválido');
      return;
    }

    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      ToastManager.error('Error', 'No hay usuario autenticado');
      return;
    }

    const user = JSON.parse(userStr);

    // Obtener campos del documento
    const fieldsResponse = await fetch(`/api/documents/${numericId}/fields?user_id=${user.user_id}`);

    if (!fieldsResponse.ok) {
      throw new Error('Error al obtener campos del documento');
    }

    const fieldsData = await fieldsResponse.json();
    const fields = fieldsData.data?.fields || [];

    // Contar firmantes únicos (basado en partId)
    const firmantesSet = new Set();
    const textFieldsArray = [];

    fields.forEach(field => {
      // Contar firmantes
      if (field.partId !== null && field.partId !== undefined) {
        firmantesSet.add(field.partId);
      }

      // Recopilar campos de texto (usando field.type en lugar de fieldType)
      if (field.type === 'text' && field.label) {
        textFieldsArray.push(field.label);
      }
    });

    const numFirmantes = firmantesSet.size;

    // Construir headers del CSV
    const headers = [];

    // ✅ NUEVO: Agregar columnas de emails: "email firma 1", "email firma 2", etc.
    for (let i = 1; i <= numFirmantes; i++) {
      headers.push(`email firma ${i}`);
    }

    // 🔥 Agregar columnas de campos de texto manejando duplicados
    // Si hay 2 campos "Nombre:", el primero será "Nombre:" y el segundo "Nombre:_1"
    const labelCounters = {};

    textFieldsArray.forEach(label => {
      if (labelCounters[label] !== undefined) {
        // Ya vimos este label antes, agregar sufijo
        labelCounters[label]++;
        headers.push(`${label}_${labelCounters[label]}`);
      } else {
        // Primera vez que vemos este label
        labelCounters[label] = 0;
        headers.push(label);
      }
    });

    // Función para escapar valores CSV (manejar comas y comillas)
    const escapeCsvValue = (value) => {
      const str = String(value);
      // Si contiene comas, comillas o saltos de línea, envolver en comillas
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Crear CSV usando comas como separador
    const csvRows = [headers.map(escapeCsvValue).join(',')];

    // Agregar 3 filas de ejemplo
    for (let i = 1; i <= 3; i++) {
      const row = [];

      // Agregar emails de ejemplo para cada firmante
      for (let f = 1; f <= numFirmantes; f++) {
        row.push(`firmante${f}_pagare${i}@example.com`);
      }

      // Agregar valores de ejemplo para campos de texto
      textFieldsArray.forEach(label => {
        row.push(`Valor ${label} ${i}`);
      });

      csvRows.push(row.map(escapeCsvValue).join(','));
    }

    const csvContent = csvRows.join('\n');

    // Descargar archivo
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plantilla-pagares-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    ToastManager.success('Plantilla generada', 'CSV descargado exitosamente');
    console.log('✅ Plantilla CSV generada:', csvRows.join('\n'));

  } catch (error) {
    console.error('❌ Error al generar plantilla CSV:', error);
    ToastManager.error('Error', 'No se pudo generar la plantilla CSV');
  }
}

// Manejar carga de CSV de pagarés
function handlePagareCsvUpload(file) {
  console.log('📤 Procesando CSV de pagarés:', file.name);

  if (!file.name.endsWith('.csv')) {
    ToastManager.error('Error', 'Solo se permiten archivos CSV');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const csvContent = e.target.result;

    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        _processPagareCsvData(results, file.name).catch(err => console.error('Error procesando CSV pagaré:', err));
      },
      error: (error) => {
        console.error('❌ Error al parsear CSV:', error);
        ToastManager.error('Error', 'No se pudo procesar el archivo CSV');
      }
    });
  };

  reader.readAsText(file);
}

async function _processPagareCsvData(results, fileName) {
  const rows = results.data;
  console.log(`📊 CSV parseado: ${rows.length} filas`);

  if (rows.length === 0) {
    ToastManager.error('Error', 'El archivo CSV está vacío');
    return;
  }

  const hasEmailColumns = results.meta.fields.some(field => field.startsWith('email firma'));
  if (!hasEmailColumns) {
    ToastManager.error('Error', 'El CSV debe tener columnas "email firma 1", "email firma 2", etc.');
    return;
  }

  // Procesar cada fila del CSV
  const pagaresData = [];
  rows.forEach((row, index) => {
    const firmantes = [];
    let firmIndex = 1;
    while (row[`email firma ${firmIndex}`]) {
      const email = row[`email firma ${firmIndex}`].trim();
      if (email) {
        firmantes.push({ email, partId: firmIndex, roleName: `Firmante N${firmIndex}` });
      }
      firmIndex++;
    }

    const textFields = {};
    Object.keys(row).forEach(key => {
      if (!key.startsWith('email firma')) {
        const value = row[key];
        if (value && value.trim()) textFields[key] = value.trim();
      }
    });

    pagaresData.push({ rowIndex: index + 2, firmantes, textFields });
  });

  window.pagareCsvData = pagaresData;

  // Estadísticas
  const totalPagares = pagaresData.length;
  const firmantesPromedio = pagaresData.length > 0 ? pagaresData[0].firmantes.length : 0;
  const totalEmails = pagaresData.reduce((sum, p) => sum + p.firmantes.length, 0);
  const firmantesConsistentes = pagaresData.every(p => p.firmantes.length === firmantesPromedio);
  const emailsValidos = pagaresData.every(p => p.firmantes.every(f => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)));
  const camposTexto = Object.keys(pagaresData[0]?.textFields || {}).length;

  // Consultar estado VI
  let ownerVinculadoVI = false;
  let viVerified = {};
  try {
    const viResp = await fetch('/api/integration/vi-link-status');
    if (viResp.ok) ownerVinculadoVI = (await viResp.json()).vinculado === true;
  } catch (_) {}

  if (ownerVinculadoVI) {
    // Recopilar todos los emails únicos de firmantes
    const allEmails = [...new Set(pagaresData.flatMap(p => p.firmantes.map(f => f.email)))];
    try {
      const checkResp = await fetch('/api/recipients/check-vi-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: allEmails })
      });
      if (checkResp.ok) viVerified = (await checkResp.json()).verified || {};
    } catch (_) {}
  }

  // Mostrar preview básico
  document.getElementById('pagareCsvFileName').textContent = fileName;
  document.getElementById('pagareCsvRowsCount').textContent = totalPagares;
  document.getElementById('pagareFirmantesCount').textContent = firmantesPromedio;

  // Validaciones
  const validationEl = document.getElementById('pagareCsvValidation');
  const validaciones = [];
  if (emailsValidos) validaciones.push('✓ Todos los emails son válidos');
  else validaciones.push('⚠ Algunos emails no son válidos');
  if (firmantesConsistentes) validaciones.push(`✓ Todos los pagarés tienen ${firmantesPromedio} firmante(s)`);
  else validaciones.push('⚠ Número inconsistente de firmantes entre filas');
  if (camposTexto > 0) validaciones.push(`✓ ${camposTexto} campo(s) de texto detectado(s)`);
  validaciones.push(`✓ Se enviarán ${totalEmails} email(s) en total`);

  // Resumen VI en validaciones
  if (ownerVinculadoVI) {
    const allEmailsList = [...new Set(pagaresData.flatMap(p => p.firmantes.map(f => f.email)))];
    const verCount = allEmailsList.filter(e => !!viVerified[e.toLowerCase()]).length;
    const noVerCount = allEmailsList.length - verCount;
    if (verCount > 0) validaciones.push(`✓ ${verCount} email(s) con identidad ya verificada — firmarán sin traza VI`);
    if (noVerCount > 0) validaciones.push(`⚠ ${noVerCount} email(s) sin verificar — generarán trazabilidad VI al firmar`);

    // Solo los NO verificados generan traza VI al firmar → esa traza se incorpora al PDF sellado
    // Los ya verificados omiten el proceso VI y no generan traza nueva
    let totalTrazasPendientes = 0;
    let pagaresConTrazas = 0;

    pagaresData.forEach(p => {
      const sinVer = p.firmantes.filter(f => !viVerified[f.email.toLowerCase()]).length;
      if (sinVer > 0) { totalTrazasPendientes += sinVer; pagaresConTrazas++; }
    });

    if (totalTrazasPendientes > 0) {
      validaciones.push(`⚠ ${totalTrazasPendientes} traza(s) VI se incorporarán al sello final (${pagaresConTrazas} pagaré(s) afectado(s))`);
    }
  }

  validationEl.innerHTML = validaciones.map(v =>
    `<div style="margin-bottom:4px;color:${v.startsWith('⚠') ? '#b45309' : '#16a34a'}">${v}</div>`
  ).join('');

  // Tabla VI por pagaré (solo si el owner está vinculado a VI)
  const viTableEl = document.getElementById('pagareCsvViTable');
  if (ownerVinculadoVI && pagaresData.length > 0) {
    const thStyle = 'padding:6px 10px;text-align:left;font-size:11px;color:#555;border-bottom:2px solid #d1fae5;white-space:nowrap;background:#f0fdf4;';
    const headerCols = `
      <th style="${thStyle}">Pagaré</th>
      ${Array.from({length: firmantesPromedio}, (_, i) =>
        `<th style="${thStyle}color:#2b0e31;">Firmante ${i+1}</th>
         <th style="${thStyle}color:#2b0e31;">ID Verificada</th>`
      ).join('')}
    `;
    const bodyRows = pagaresData.map((pagare, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#f9fafb';
      const firmCells = Array.from({length: firmantesPromedio}, (_, fi) => {
        const f = pagare.firmantes[fi];
        if (!f) return `<td style="padding:6px 10px;font-size:11px;">—</td><td style="padding:6px 10px;"></td>`;
        const isVer = !!viVerified[f.email.toLowerCase()];
        const badge = isVer
          ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#dcfce7;color:#16a34a;border:1px solid #86efac;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700;">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>VERIFICADO</span>`
          : `<span style="display:inline-flex;align-items:center;gap:3px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:700;">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>NO VERIF.</span>`;
        return `<td style="padding:6px 10px;font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.email}</td>
                <td style="padding:6px 10px;">${badge}</td>`;
      }).join('');
      return `<tr style="background:${bg};">
        <td style="padding:6px 10px;font-size:11px;font-weight:600;color:#374151;">Pagaré ${pagare.rowIndex - 1}</td>
        ${firmCells}
      </tr>`;
    }).join('');

    viTableEl.innerHTML = `
      <div style="overflow-x:auto;border:1px solid #bbf7d0;border-radius:6px;margin-top:6px;">
        <table style="width:100%;border-collapse:collapse;min-width:300px;">
          <thead><tr>${headerCols}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;
    viTableEl.style.display = 'block';
  } else {
    viTableEl.style.display = 'none';
    viTableEl.innerHTML = '';
  }

  document.getElementById('pagareCsvUploadZone').style.display = 'none';
  document.getElementById('pagareCsvPreview').style.display = 'block';

  ToastManager.success('CSV cargado', `${totalPagares} pagaré(s) detectado(s)`);
  console.log('✅ Datos del CSV guardados:', pagaresData);
}

// Cargar template info cuando el modal de destinatarios ya está abierto y se cambia al tab "upload"
document.addEventListener('DOMContentLoaded', () => {
  const uploadTab = document.querySelector('.recipients-tab[data-tab="upload"]');
  if (uploadTab) {
    uploadTab.addEventListener('click', () => {
      const docData = getDocumentDataFromURL();
      if (docData && docData.id && !currentTemplateData) {
        loadTemplateInfoForUpload(docData.id);
      }
    });
  }

  // ✅ Event listeners para pestaña de pagarés
  const downloadPagareTemplateBtn = document.getElementById('downloadPagareTemplateBtn');
  if (downloadPagareTemplateBtn) {
    downloadPagareTemplateBtn.addEventListener('click', async () => {
      console.log('📥 Descargando plantilla CSV para pagarés');
      const docData = getDocumentDataFromURL();
      await downloadPagareTemplate(docData.id);
    });
  }

  const pagareCsvFileInput = document.getElementById('pagareCsvFileInput');
  if (pagareCsvFileInput) {
    pagareCsvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handlePagareCsvUpload(file);
      }
    });
  }

  // Botón para cambiar archivo CSV
  const pagareCsvChangeBtn = document.getElementById('pagareCsvChangeBtn');
  if (pagareCsvChangeBtn) {
    pagareCsvChangeBtn.addEventListener('click', () => {
      // Resetear el input para permitir seleccionar el mismo archivo
      const input = document.getElementById('pagareCsvFileInput');
      if (input) {
        input.value = '';
        input.click();
      }
    });
  }

  // Verificación VI en tiempo real del firmante definitivo
  const finalSignerEmailInput = document.getElementById('finalSignerEmail');
  const finalSignerViBadge = document.getElementById('finalSignerViBadge');
  if (finalSignerEmailInput && finalSignerViBadge) {
    let finalSignerViTimeout = null;
    finalSignerEmailInput.addEventListener('input', () => {
      clearTimeout(finalSignerViTimeout);
      const email = finalSignerEmailInput.value.trim().toLowerCase();
      finalSignerViBadge.innerHTML = '';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

      finalSignerViBadge.innerHTML = `<span style="font-size:11px;color:#6b7280;">Verificando identidad...</span>`;

      finalSignerViTimeout = setTimeout(async () => {
        try {
          const resp = await fetch('/api/recipients/check-vi-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: [email] })
          });
          if (!resp.ok) { finalSignerViBadge.innerHTML = ''; return; }
          const data = await resp.json();
          const isVerified = !!(data.verified && data.verified[email]);
          if (isVerified) {
            finalSignerViBadge.innerHTML = `
              <span style="display:inline-flex;align-items:center;gap:4px;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:10px;padding:3px 10px;font-size:11px;font-weight:700;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                IDENTIDAD YA VERIFICADA
              </span>`;
          } else {
            finalSignerViBadge.innerHTML = `
              <span style="display:inline-flex;align-items:center;gap:4px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:10px;padding:3px 10px;font-size:11px;font-weight:700;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                NO VERIFICADO — Generará trazabilidad VI al sellar
              </span>`;
          }
        } catch (_) { finalSignerViBadge.innerHTML = ''; }
      }, 600);
    });
  }
});

// ==================== FUNCIONES DE TRAZABILIDAD ====================

// Variable global para almacenar el document_id actual
let currentAuditDocumentId = null;

/**
 * Abre el modal de trazabilidad y carga los eventos
 * @param {number} documentId - ID del documento a auditar
 */
async function openAuditModal(documentId) {
  currentAuditDocumentId = documentId;
  const modal = document.getElementById('auditModal');
  if (!modal) return;

  modal.style.display = 'flex';
  await loadDocumentActivityModal(documentId);
}

/**
 * Cierra el modal de trazabilidad
 */
function closeAuditModal() {
  const modal = document.getElementById('auditModal');
  if (modal) {
    modal.style.display = 'none';
  }
  currentAuditDocumentId = null;
}

/**
 * Carga los eventos de un documento desde el backend
 * @param {number} documentId - ID del documento
 */
async function loadDocumentActivityModal(documentId) {
  const container = document.getElementById('auditTimelineContainer');
  if (!container) return;

  // Mostrar loader
  container.innerHTML = '<div class="audit-loading">Cargando eventos...</div>';

  try {
    const response = await authFetch(`/api/signatures/documents/${documentId}/events`);

    if (!response.ok) {
      throw new Error('Error al cargar eventos');
    }

    const data = await response.json();

    if (!data.success || !data.events || data.events.length === 0) {
      container.innerHTML = '<div class="audit-empty">No hay eventos registrados para este documento</div>';
      return;
    }

    // Renderizar timeline
    renderTimelineModal(data.events, container);

  } catch (error) {
    console.error('Error cargando eventos:', error);
    container.innerHTML = `<div class="audit-empty">Error al cargar eventos: ${error.message}</div>`;
  }
}

/**
 * Renderiza el timeline de eventos
 * @param {Array} events - Array de eventos
 * @param {HTMLElement} container - Contenedor donde renderizar
 */
function renderTimelineModal(events, container) {
  // Mapeo de tipos de eventos a etiquetas en español
  const eventTypeLabels = {
    'document_created': 'Documento creado',
    'recipient_added': 'Destinatario agregado',
    'email_sent': 'Email enviado',
    'document_opened': 'Documento abierto',
    'field_completed': 'Campo completado',
    'document_signed': 'Documento firmado',
    'document_rejected': 'Documento rechazado',
    'reminder_sent': 'Recordatorio enviado',
    'document_completed': 'Documento completado',
    'document_voided': 'Documento anulado',
    'qr_code_generated': 'Código QR generado'
  };

  // Mapeo de tipos de eventos a iconos
  const _i = (d) => `<svg style="width:18px;height:18px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const eventTypeIcons = {
    'document_created': _i('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
    'recipient_added': _i('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'),
    'email_sent': _i('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
    'document_opened': _i('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    'field_completed': _i('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
    'document_signed': _i('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    'document_rejected': _i('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
    'reminder_sent': _i('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    'document_completed': _i('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
    'document_voided': _i('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    'qr_code_generated': _i('<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>')
  };

  // Mapeo de tipos de eventos a clases CSS
  const eventTypeClasses = {
    'document_created': 'info',
    'recipient_added': 'info',
    'email_sent': 'info',
    'document_opened': 'warning',
    'field_completed': 'warning',
    'document_signed': 'success',
    'document_rejected': 'error',
    'reminder_sent': 'info',
    'document_completed': 'success',
    'document_voided': 'error',
    'qr_code_generated': 'info'
  };

  // Ordenar eventos por fecha (más recientes primero)
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // Construir HTML del timeline
  let timelineHTML = '<div class="audit-timeline">';

  sortedEvents.forEach(event => {
    const eventLabel = eventTypeLabels[event.event_type] || event.event_type;
    const eventIcon = eventTypeIcons[event.event_type] || _i('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>');
    const eventClass = eventTypeClasses[event.event_type] || 'info';
    const eventDate = new Date(event.created_at);
    const formattedDate = eventDate.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Construir detalles del evento
    let detailsHTML = '<div class="audit-event-details">';

    if (event.recipient_email) {
      detailsHTML += `<div><strong>Destinatario:</strong> ${event.recipient_email}</div>`;
    }

    if (event.recipient_name && event.recipient_name !== event.recipient_email) {
      detailsHTML += `<div><strong>Nombre:</strong> ${event.recipient_name}</div>`;
    }

    if (event.part_name) {
      detailsHTML += `<div><strong>Rol:</strong> ${event.part_name}</div>`;
    }

    if (event.ip_address) {
      detailsHTML += `<div><strong>IP:</strong> ${event.ip_address}</div>`;
    }

    if (event.user_agent) {
      const browser = getBrowserFromUserAgent(event.user_agent);
      detailsHTML += `<div><strong>Navegador:</strong> ${browser}</div>`;
    }

    detailsHTML += `</div>`;

    timelineHTML += `
      <div class="audit-event">
        <div class="audit-event-marker ${eventClass}">${eventIcon}</div>
        <div class="audit-event-content">
          <div class="audit-event-title">${eventLabel}</div>
          ${detailsHTML}
          <span class="audit-event-time">${formattedDate}</span>
        </div>
      </div>
    `;
  });

  timelineHTML += '</div>';

  container.innerHTML = timelineHTML;
}

/**
 * Extrae el navegador del User Agent
 * @param {string} userAgent - String del User Agent
 * @returns {string} Nombre del navegador
 */
function getBrowserFromUserAgent(userAgent) {
  if (!userAgent) return 'Desconocido';

  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';

  return 'Otro';
}

/**
 * Descarga el PDF de auditoría del documento actual
 */
async function downloadAuditPDF() {
  if (!currentAuditDocumentId) {
    alert('No hay documento seleccionado');
    return;
  }

  try {
    const response = await authFetch(`/api/signatures/documents/${currentAuditDocumentId}/audit-pdf`);

    if (!response.ok) {
      throw new Error('Error al generar PDF');
    }

    // Convertir respuesta a blob
    const blob = await response.blob();

    // Crear link temporal para descarga
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-documento-${currentAuditDocumentId}.pdf`;
    document.body.appendChild(a);
    a.click();

    // Limpiar
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    console.log('✅ PDF de auditoría descargado');

  } catch (error) {
    console.error('❌ Error descargando PDF:', error);
    alert('Error al descargar el PDF de auditoría');
  }
}

/**
 * Abre el modal de trazabilidad desde la página de tracking
 * Usa el documentId del documento actualmente cargado
 */
function openAuditModalFromTracking() {
  const urlParams = new URLSearchParams(window.location.search);
  const documentId = urlParams.get('id');

  if (!documentId) {
    alert('No hay documento seleccionado');
    return;
  }

  openAuditModal(documentId);
}

/**
 * Muestra u oculta el botón de trazabilidad según si hay un documento cargado
 */
function toggleAuditButton() {
  const auditBtn = document.getElementById('auditBtn');
  const urlParams = new URLSearchParams(window.location.search);
  const documentId = urlParams.get('id');

  if (auditBtn) {
    auditBtn.style.display = documentId ? 'flex' : 'none';
  }
}

// ── INTEGRACIÓN VALIDACIÓN DE IDENTIDAD (FASE 2) ─────────────────────────────

function showToastMsg(message, type) {
  if (typeof ToastManager !== 'undefined') {
    if (type === 'error') ToastManager.error('', message, 5000);
    else ToastManager.success('', message, 5000);
  } else {
    const t = document.createElement('div');
    t.textContent = message;
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;background:${type==='error'?'#c0392b':'#2a0d31'};color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.18);`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }
}

async function handleViStart(recipient) {
  const card = document.querySelector(`[data-recipient-id="${recipient.id}"]`);
  const startBtn = card?.querySelector('.vi-start-btn');
  if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Verificando...'; }

  try {
    // Verificar si el owner está vinculado a VI
    const resp = await fetch(`/api/public/vi-status/${recipient.token}`, { credentials: 'include' });
    const data = await resp.json();

    if (!data.ownerVinculado) {
      showViSolicitudModal();
      return;
    }

    // Redirigir al operador a VI para crear la solicitud de validación manualmente.
    // El formulario se pre-llenará con asunto (título del documento) y email del firmante.
    // El redirect_token es el token de firma del firmante para que VI construya el redirect_url correcto.
    const documentTitle = document.querySelector('.document-title')?.textContent?.trim()
      || window.documentTitle || 'Documento para firma';
    const VI_BASE = '/validacion/desktop/crear-validacion.html';
    const params = new URLSearchParams({
      asunto: documentTitle,
      email: recipient.email,
      redirect_token: recipient.token
    });
    window.open(`${VI_BASE}?${params.toString()}`, '_blank');

  } catch (err) {
    console.error('Error iniciando VI:', err);
    showToastMsg('Error de conexión al iniciar validación', 'error');
  } finally {
    if (startBtn) { startBtn.disabled = false; startBtn.textContent = 'INICIAR VALIDACIÓN DE IDENTIDAD'; }
  }
}

// Omitir validación VI: envía el email de firma directamente al firmante
async function handleViSkip(recipient, card) {
  const skipBtn = card.querySelector('.vi-skip-btn');
  if (skipBtn) { skipBtn.disabled = true; skipBtn.textContent = 'Enviando...'; }

  try {
    const resp = await fetch(`/api/integration/vi-skip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ recipient_token: recipient.token })
    });
    const data = await resp.json();
    if (data.success) {
      showToastMsg('Correo enviado. Identidad pendiente de verificación.', 'success');
      // Recargar la tarjeta para mostrar botones normales (sin bloque VI)
      const docId = new URLSearchParams(window.location.search).get('id');
      if (docId) loadRecipients(docId);
    } else {
      showToastMsg(data.message || 'Error al omitir la validación', 'error');
    }
  } catch (err) {
    console.error('Error omitiendo VI:', err);
    showToastMsg('Error de conexión', 'error');
  } finally {
    if (skipBtn) { skipBtn.disabled = false; skipBtn.textContent = 'omitir validación de identidad'; }
  }
}

function showViSolicitudModal() {
  // Reusar el flujo de solicitud de vinculación de config.html si estamos en el mismo dominio
  // En tracking solo mostramos aviso de que el admin debe vincular primero
  const modal = document.getElementById('vi-solicitud-modal');
  if (modal) { modal.style.display = 'flex'; return; }

  const m = document.createElement('div');
  m.id = 'vi-solicitud-modal';
  m.style.cssText = 'display:flex;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.45);align-items:center;justify-content:center;';
  m.innerHTML = `
    <div style="background:#fff;border-radius:16px;max-width:440px;width:90%;padding:36px 32px;box-shadow:0 8px 32px rgba(0,0,0,0.18);">
      <h3 style="margin:0 0 12px;font-size:1.1rem;font-weight:800;color:#2a0d31;">Vinculación requerida</h3>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">
        Para iniciar la validación de identidad, tu cuenta de FirmaLegal debe estar vinculada con el sistema de Validación de Identidad de PKI Services.<br><br>
        Ve a <strong>Configuración → Perfil</strong> y usa el botón <strong>"Solicitar vinculación"</strong>. El equipo de FirmaLegal gestionará la vinculación y te notificará.
      </p>
      <div style="display:flex;gap:12px;justify-content:flex-end;">
        <button onclick="document.getElementById('vi-solicitud-modal').style.display='none'"
          style="padding:10px 24px;font-size:14px;font-weight:600;color:#666;background:none;border:1px solid #ddd;border-radius:8px;cursor:pointer;">
          Cerrar
        </button>
        <a href="/config.html#perfil" style="display:inline-block;padding:10px 24px;font-size:14px;font-weight:700;background:#2a0d31;color:#fff;border-radius:8px;text-decoration:none;">
          Ir a Configuración
        </a>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m) m.style.display = 'none'; });
}
