/**
 * =============================================
 * HELPER DE AUTENTICACIÓN
 * Funciones para manejar sesiones con JWT en cookies
 * =============================================
 */

/**
 * Fetch con autenticación automática
 * Incluye la cookie JWT automáticamente
 */
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
        credentials: 'include',  // ⚠️ CRÍTICO: Envía la cookie JWT automáticamente
        headers
    });
}

/**
 * Verificar autenticación - Redirige a login si no hay usuario
 * Uso: Llamar al inicio de cada página protegida
 */
function requireAuth() {
    const user = getCurrentUser();
    if (!user) {
        console.warn('⚠️ Usuario no autenticado, redirigiendo a login');
        window.location.href = '/public/Main/login.html';
        return false;
    }
    return true;
}

/**
 * Verificar autenticación de forma asíncrona
 * Hace un request real al servidor para validar el JWT
 */
async function requireAuthAsync() {
    const user = getCurrentUser();
    if (!user) {
        console.warn('⚠️ No hay usuario en localStorage, redirigiendo a login');
        window.location.href = '/public/Main/login.html';
        return false;
    }

    try {
        // Verificar que el token JWT sigue siendo válido
        const response = await authFetch('/api/folders?level=0');

        if (response.ok) {
            console.log('✅ Sesión validada correctamente');
            return true;
        } else if (response.status === 401) {
            console.warn('⚠️ Token expirado, redirigiendo a login');
            localStorage.removeItem('user');
            localStorage.removeItem('currentUser');
            window.location.href = '/public/Main/login.html';
            return false;
        }
    } catch (error) {
        console.error('❌ Error al validar sesión:', error);
        // En caso de error de red, permitir continuar (offline tolerance)
        return true;
    }
}

/**
 * Obtener usuario actual desde localStorage
 */
function getCurrentUser() {
    try {
        const userStr = localStorage.getItem('currentUser') || localStorage.getItem('user');
        if (!userStr) return null;
        return JSON.parse(userStr);
    } catch (error) {
        console.error('❌ Error al obtener usuario:', error);
        return null;
    }
}

/**
 * Guardar usuario en localStorage
 */
function saveCurrentUser(user) {
    try {
        localStorage.setItem('currentUser', JSON.stringify(user));
        console.log('✅ Usuario guardado en localStorage');
    } catch (error) {
        console.error('❌ Error al guardar usuario:', error);
    }
}

/**
 * Función de logout
 */
async function logout() {
    console.log('🚪 Cerrando sesión...');

    try {
        // Llamar al backend para eliminar la cookie
        await authFetch('/api/logout', { method: 'POST' });
        console.log('✅ Logout exitoso en el servidor');
    } catch (error) {
        console.error('❌ Error al hacer logout:', error);
    }

    // Limpiar localStorage
    localStorage.removeItem('user');
    localStorage.removeItem('currentUser');
    console.log('✅ LocalStorage limpiado');

    // Redirigir a login
    window.location.href = '/public/Main/login.html';
}
