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

  card.innerHTML = `
    <div class="recipient-info">
      <div class="status-badge ${statusClass}">
        ${statusText}
      </div>
      <div class="recipient-emails">
        ${recipient.emails.map(email => `
          <p class="recipient-email">${email}</p>
        `).join('')}
      </div>
    </div>
    <div class="recipient-actions">
      <button class="recipient-btn download" data-action="download" data-id="${recipient.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        DESCARGAR
      </button>
      <button class="recipient-btn view" data-action="view" data-id="${recipient.id}">
        VISTA
      </button>
      <button class="recipient-btn delete" data-action="delete" data-id="${recipient.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `;

  return card;
}

function getStatusClass(status) {
  const statusMap = {
    'completed': 'completed',
    'pending': 'pending',
    'rejected': 'rejected',
    'viewed': 'viewed'
  };
  return statusMap[status] || 'pending';
}

function getStatusText(status) {
  const statusTextMap = {
    'completed': 'COMPLETADO',
    'pending': 'PENDIENTE',
    'rejected': 'RECHAZADO',
    'viewed': 'VISTO'
  };
  return statusTextMap[status] || 'PENDIENTE';
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
  window.location.href = `./sign.html?id=${docData.id}&name=${encodeURIComponent(docData.name)}`;
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
  ToastManager.info('Próximamente', 'Esta función estará disponible pronto');

  // Aquí se abriría un modal para agregar destinatarios
}

// ====== ACCIONES DE DESTINATARIOS ======
function handleRecipientDownload(recipientId) {
  console.log('💾 Descargando documento firmado por:', recipientId);
  ToastManager.success('Descargando', 'El documento firmado se está descargando');

  // Aquí iría la lógica para descargar el PDF firmado
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

    switch(action) {
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

  // Actualizar título
  const titleEl = document.getElementById('documentTitle');
  if (titleEl) titleEl.textContent = docData.name;

  const folderEl = document.getElementById('folderName');
  if (folderEl) folderEl.textContent = docData.folder;

  // Cargar destinatarios (demo por ahora)
  renderRecipients(demoData.recipients);

  console.log('✅ Vista de seguimiento lista');
});
