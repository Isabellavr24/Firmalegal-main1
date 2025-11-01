/*********************************************************
 * TRACKING VIEW - SISTEMA DE SEGUIMIENTO DE DOCUMENTOS
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

// ====== OBTENER DATOS DE LA URL ======
function getDocumentDataFromURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get('id') || 'demo-doc-1',
    name: params.get('name') || 'contrato de arrendamiento 2DO PISO',
    folder: params.get('folder') || 'Pki Services'
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
function renderRecipients(recipients) {
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

  recipients.forEach(recipient => {
    const card = createRecipientCard(recipient);
    container.appendChild(card);
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

  card.innerHTML = `
    <div class="recipient-info">
      <div class="status-badge ${statusClass}">
        ${statusText}
      </div>
      <div class="recipient-emails">
        <p class="recipient-email">${displayEmail}</p>
        ${recipient.name && recipient.name !== recipient.email ? `<p class="recipient-name" style="font-size: 12px; color: #666; margin-top: 4px;">${recipient.name}</p>` : ''}
      </div>
    </div>
    <div class="recipient-actions">
      <button class="recipient-btn copy" data-action="copy" data-id="${recipient.id}" data-token="${recipient.token || ''}" title="Copiar enlace de firma">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        COPIAR
      </button>
      <button class="recipient-btn view" data-action="view" data-id="${recipient.id}">
        VISTA
      </button>
      <button class="recipient-btn download" data-action="download" data-id="${recipient.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        DESCARGAR
      </button>
    </div>
  `;

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
  // ✅ Redirigir a modo preparación para editar campos
  window.location.href = `/sign.html?mode=prepare&id=${docData.id}&name=${encodeURIComponent(docData.name)}`;
}

function handleExportAction() {
  console.log('📤 Exportando lista de destinatarios');
  ToastManager.info('Exportando', 'Preparando archivo para descarga...');

  // Aquí iría la lógica para exportar
  setTimeout(() => {
    ToastManager.success('Exportación completa', 'El archivo se descargó exitosamente');
  }, 1000);
}

function handleAddRecipient() {
  console.log('➕ Agregar nuevo destinatario');
  
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

function handleRecipientDownload(recipientId) {
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

  // Crear URL de descarga
  const downloadUrl = `/api/documents/${docData.id}/recipients/${recipientId}/download?user_id=${userId}`;
  
  console.log(`🔗 URL de descarga: ${downloadUrl}`);
  
  // Usar window.open para forzar la descarga
  window.open(downloadUrl, '_blank');
  
  // Actualizar toast después de un momento
  setTimeout(() => {
    ToastManager.success('¡Descarga iniciada!', 'El documento se está descargando');
  }, 500);
}

function handleRecipientView(recipientId) {
  console.log('👁️ Viendo detalles del destinatario:', recipientId);

  const docData = getDocumentDataFromURL();
  window.location.href = `./sign.html?id=${docData.id}&recipient=${recipientId}`;
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
  if (e.target.closest('#exportBtn')) handleExportAction();
  if (e.target.closest('#addRecipientBtn')) handleAddRecipient();

  // Botones de destinatarios
  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    const action = actionBtn.dataset.action;
    const recipientId = actionBtn.dataset.id;
    const token = actionBtn.dataset.token; // Para el enlace de firma

    switch(action) {
      case 'copy':
        handleRecipientCopy(recipientId, token);
        break;
      case 'download':
        handleRecipientDownload(recipientId);
        break;
      case 'view':
        handleRecipientView(recipientId);
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

  try { await window.permissions?.logout?.(); } catch {}
  try {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('current_user');
    localStorage.removeItem('token');
  } catch {}

  location.href = './login.html';
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

// ====== INICIALIZAR ======
document.addEventListener('DOMContentLoaded', () => {
  console.log('📊 Inicializando vista de seguimiento...');

  // Cargar perfil de usuario
  updateUserProfile();

  // Obtener datos del documento desde URL
  const docData = getDocumentDataFromURL();

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

    if (fields.length === 0) {
      // Sin campos → Mostrar banner
      showUnassignedBanner(docId, docName);
      stopAutoRefresh(); // Detener auto-refresh si no hay campos
    } else {
      // Con campos → Ocultar banner y mostrar tracking
      hideUnassignedBanner();
      
      // Cargar destinatarios reales desde el backend
      loadRecipients(docId);
      
      // Activar auto-refresh para actualizar estados en tiempo real
      startAutoRefresh(docId);
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
      renderRecipients(data.data.recipients);
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
      window.location.href = `/sign.html?id=${docId}&name=${encodeURIComponent(docName)}&mode=prepare`;
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
    
    // Limpiar campos
    document.getElementById('emailInput').value = '';
    document.getElementById('phoneInput').value = '';
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

// Agregar destinatarios
document.getElementById('recipientsAdd')?.addEventListener('click', async () => {
  console.log('📤 Enviando documento a destinatarios...');
  
  const activeTab = document.querySelector('.recipients-tab.active')?.dataset.tab;
  const recipients = [];
  
  // Obtener destinatarios según la pestaña activa
  if (activeTab === 'email') {
    const emailText = document.getElementById('emailInput').value.trim();
    if (!emailText) {
      ToastManager.warning('Sin destinatarios', 'Debes agregar al menos un email');
      return;
    }
    
    // Separar por líneas, comas o espacios
    const emails = emailText.split(/[\n,\s]+/).filter(e => e.trim());
    
    // Validar emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of emails) {
      if (!emailRegex.test(email)) {
        ToastManager.error('Email inválido', `El email "${email}" no es válido`);
        return;
      }
      recipients.push({ email: email.trim() });
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
