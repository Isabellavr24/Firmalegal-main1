/**
 * =============================================
 * HELPER DE AUTENTICACIÓN
 * Funciones para manejar sesiones con JWT en cookies
 * =============================================
 */

// SI LA SESION YA NO VALE, DECIRLO Y LLEVAR AL LOGIN.
//
// Antes, cuando el servidor respondia 401, la pantalla se quedaba como estaba:
// el operador seguia dentro, pulsaba un boton y "no pasaba nada". Pensando como
// ingeniero uno deduce que hay que volver a entrar; pensando como usuario, uno
// concluye que la aplicacion no sirve.
//
// Pasa sobre todo porque FirmaLegal y Validacion de Identidad comparten hoy el
// nombre de la cookie (auth_token) en el mismo dominio: entrar en una pisa la
// sesion de la otra. El navegador SI tiene una cookie con ese nombre, asi que
// la pantalla carga; solo al operar se comprueba la firma del token y falla.
//
// Se intercepta fetch en vez de arreglarlo llamada por llamada porque hay 107
// peticiones repartidas en nueve archivos, y solo 26 pasan por authFetch. Un
// unico punto cubre todas y no deja ninguna fuera por olvido.
(function vigilarLaSesion() {
    if (typeof window === 'undefined' || !window.fetch) return;
    if (window.__sesionVigilada) return;      // no envolver dos veces
    window.__sesionVigilada = true;

    // Paginas donde un 401 es NORMAL y no hay que echar a nadie: el login, y
    // sobre todo las de firma publica, donde quien entra es un firmante con su
    // enlace y no tiene -ni necesita- sesion de operador.
    //
    // Se comparan nombres de archivo EXACTOS y no con includes(): un
    // p.includes('verify') tomaria por publica cualquier pagina del panel que
    // llevara esa palabra en el nombre -por ejemplo un futuro
    // verify-users.html-, y el operador se quedaria sin el aviso sin que nadie
    // entendiera por que. Hoy no existe ninguna asi; la lista explicita evita
    // que el dia que exista el fallo aparezca solo.
    const PAGINAS_PUBLICAS = ['login.html', 'public-sign.html', 'verify.html'];
    const esPaginaPublica = () => {
        const p = (window.location.pathname || '').toLowerCase();
        const archivo = p.substring(p.lastIndexOf('/') + 1);
        // Sin nombre de archivo (la raiz, o una ruta con barra final) no es
        // ninguna de las publicas: todas se sirven con su .html.
        return PAGINAS_PUBLICAS.indexOf(archivo) >= 0;
    };

    const fetchOriginal = window.fetch.bind(window);
    let yaAvisado = false;   // un solo aviso aunque fallen varias a la vez

    window.fetch = async function (recurso, opciones) {
        const respuesta = await fetchOriginal(recurso, opciones);

        if (respuesta.status !== 401 || yaAvisado || esPaginaPublica()) {
            return respuesta;
        }

        // Solo nuestras rutas: un 401 de un servicio ajeno no dice nada de
        // nuestra sesion.
        const url = typeof recurso === 'string' ? recurso : (recurso && recurso.url) || '';
        if (!url.includes('/api/')) return respuesta;

        // Las rutas /api/public/ devuelven 401 con normalidad cuando el token
        // del FIRMANTE caduco, y eso no dice nada de la sesion del operador.
        //
        // NO ESTRECHAR ESTA REGLA A "solo en las paginas publicas". Parece mas
        // precisa y abre un agujero: el panel de seguimiento llama a
        //      /api/public/vi-status/{token}   (tracking.js, handleViStart)
        // con el token del FIRMANTE, estando el OPERADOR dentro de la
        // aplicacion. Si esa llamada se intercepta, un token caducado de un
        // firmante cierra la sesion del operador que esta revisando su estado.
        // Hace falta por las dos vias: la pagina publica y la ruta.
        if (url.includes('/api/public/')) return respuesta;

        yaAvisado = true;
        console.warn('Sesion no valida: se cierra y se vuelve al login');

        try {
            localStorage.removeItem('user');
            localStorage.removeItem('currentUser');
        } catch (e) { /* almacenamiento bloqueado: da igual, igual se sale */ }

        const destino = '/public/Main/login.html?sesion=expirada';

        // Si hay avisos en pantalla, se usa; si no, un alert. Lo importante es
        // que la persona sepa por que la sacamos, en vez de un salto seco.
        const mensaje = 'Tu sesion se cerro. Vuelve a iniciar sesion para continuar.';
        try {
            if (window.ToastManager && typeof ToastManager.show === 'function') {
                ToastManager.show({ type: 'warning', title: 'Sesion expirada', message: mensaje });
                setTimeout(() => { window.location.href = destino; }, 1800);
            } else {
                alert(mensaje);
                window.location.href = destino;
            }
        } catch (e) {
            window.location.href = destino;
        }

        return respuesta;
    };
})();

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
