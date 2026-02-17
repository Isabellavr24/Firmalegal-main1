/**
 * 🎨 Sistema de Notificaciones Toast
 * Sistema moderno de notificaciones estilo toast para reemplazar alert() nativo
 * Diseño coherente con PKI Services branding
 */

class ToastNotification {
    constructor() {
        this.container = null;
        this.queue = [];
        this.isProcessing = false;
        this.activeToasts = new Map(); // Mapa para prevenir duplicados
        this.init();
    }

    /**
     * Inicializar el contenedor de toasts
     */
    init() {
        // Crear contenedor si no existe
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    /**
     * Mostrar una notificación
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duración en ms (default: 4000)
     */
    show(message, type = 'info', duration = 4000) {
        // Crear clave única para este mensaje
        const toastKey = `${type}:${message}`;

        // Si ya existe un toast con este mensaje, no crear otro
        if (this.activeToasts.has(toastKey)) {
            console.log('🔔 Toast duplicado prevenido:', message);
            return this.activeToasts.get(toastKey);
        }

        const toast = this.createToast(message, type);
        this.container.appendChild(toast);

        // Registrar toast activo
        this.activeToasts.set(toastKey, toast);

        // Animación de entrada
        setTimeout(() => {
            toast.classList.add('toast-show');
        }, 10);

        // Auto-cerrar después de la duración especificada
        const autoCloseTimeout = setTimeout(() => {
            this.hide(toast, toastKey);
        }, duration);

        // Guardar timeout en el toast para poder cancelarlo si es necesario
        toast._autoCloseTimeout = autoCloseTimeout;
        toast._toastKey = toastKey;

        return toast;
    }

    /**
     * Crear elemento toast
     */
    createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Icono según el tipo
        const icon = this.getIcon(type);

        // Contenido
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="toast-close" aria-label="Cerrar">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        `;

        // Botón de cerrar
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.hide(toast);
        });

        return toast;
    }

    /**
     * Obtener icono SVG según el tipo
     */
    getIcon(type) {
        const icons = {
            success: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M8 12l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`,
            error: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            warning: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 20h20L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                <path d="M12 10v4M12 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            info: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>`
        };
        return icons[type] || icons.info;
    }

    /**
     * Ocultar toast
     */
    hide(toast, toastKey = null) {
        // Cancelar auto-close si existe
        if (toast._autoCloseTimeout) {
            clearTimeout(toast._autoCloseTimeout);
        }

        // Usar la key guardada en el toast si no se proporciona
        const key = toastKey || toast._toastKey;

        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }

            // Eliminar del registro de toasts activos
            if (key && this.activeToasts.has(key)) {
                this.activeToasts.delete(key);
            }
        }, 300);
    }

    /**
     * Escapar HTML para prevenir XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Métodos de conveniencia
     */
    success(message, duration = 4000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 4500) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 4000) {
        return this.show(message, 'info', duration);
    }

    /**
     * Limpiar todos los toasts
     */
    clear() {
        const toasts = this.container.querySelectorAll('.toast');
        toasts.forEach(toast => this.hide(toast));
    }

    /**
     * Mostrar diálogo de confirmación
     * @param {string} message - Mensaje de confirmación
     * @param {object} options - Opciones { confirmText, cancelText, onConfirm, onCancel }
     * @returns {Promise<boolean>}
     */
    confirm(message, options = {}) {
        return new Promise((resolve) => {
            const {
                confirmText = 'Aceptar',
                cancelText = 'Cancelar',
                type = 'warning'
            } = options;

            // Crear overlay
            const overlay = document.createElement('div');
            overlay.className = 'toast-confirm-overlay';

            // Crear modal
            const modal = document.createElement('div');
            modal.className = `toast-confirm-modal toast-confirm-${type}`;

            modal.innerHTML = `
                <div class="toast-confirm-icon">${this.getIcon(type)}</div>
                <div class="toast-confirm-message">${this.escapeHtml(message)}</div>
                <div class="toast-confirm-buttons">
                    <button class="toast-confirm-btn toast-confirm-cancel">${cancelText}</button>
                    <button class="toast-confirm-btn toast-confirm-confirm">${confirmText}</button>
                </div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Animación de entrada
            setTimeout(() => {
                overlay.classList.add('show');
            }, 10);

            // Función para cerrar
            const close = (result) => {
                overlay.classList.remove('show');
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                    resolve(result);
                }, 200);
            };

            // Event listeners
            const confirmBtn = modal.querySelector('.toast-confirm-confirm');
            const cancelBtn = modal.querySelector('.toast-confirm-cancel');

            confirmBtn.addEventListener('click', () => close(true));
            cancelBtn.addEventListener('click', () => close(false));

            // Cerrar con ESC
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    close(false);
                    document.removeEventListener('keydown', handleEsc);
                }
            };
            document.addEventListener('keydown', handleEsc);

            // Cerrar al hacer clic fuera del modal
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    close(false);
                }
            });
        });
    }
}

// Instancia global
const toast = new ToastNotification();

// Exportar para uso global
window.toast = toast;

// También crear función showToast para compatibilidad
window.showToast = (message, type = 'info', duration = 4000) => {
    return toast.show(message, type, duration);
};
