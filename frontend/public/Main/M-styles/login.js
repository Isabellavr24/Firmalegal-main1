/**
 * =============================================
 * LOGIN CON JWT EN COOKIES
 * =============================================
 */

// Al cargar la página, verificar si ya hay sesión activa
document.addEventListener('DOMContentLoaded', async () => {
  await checkExistingSession();

  const form = document.getElementById('loginForm');
  const email = document.getElementById('email');
  const pass = document.getElementById('password');
  const emailError = document.getElementById('emailError');
  const passError = document.getElementById('passError');
  const toggle = document.querySelector('.pass-toggle');

  // Mostrar/ocultar contraseña
  toggle?.addEventListener('click', () => {
    const isText = pass.type === 'text';
    pass.type = isText ? 'password' : 'text';
    toggle.setAttribute('aria-label', isText ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  // Validación simple
  function validate() {
    let ok = true;
    emailError.textContent = '';
    passError.textContent = '';

    if (!email.value.trim() || !email.checkValidity()) {
      emailError.textContent = 'Ingresa un correo válido.';
      ok = false;
    }
    if (!pass.value.trim() || pass.value.length < 6) {
      passError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      ok = false;
    }
    return ok;
  }

  // Manejar submit del formulario
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Deshabilitar botón mientras se procesa
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'VERIFICANDO...';

    try {
      console.log('🔐 Intentando login...');

      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',  // ⚠️ IMPORTANTE: Recibir la cookie
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.value,
          password: pass.value
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Login exitoso');

        // Guardar usuario en localStorage
        saveCurrentUser(data.user);

        // Redirigir al dashboard
        window.location.href = '/index.html';

      } else {
        console.error('❌ Login fallido:', data.error);
        passError.textContent = data.error || 'Error al iniciar sesión';
        submitBtn.disabled = false;
        submitBtn.textContent = 'INICIAR SESIÓN';
      }

    } catch (error) {
      console.error('❌ Error en login:', error);
      passError.textContent = 'Error de conexión con el servidor';
      submitBtn.disabled = false;
      submitBtn.textContent = 'INICIAR SESIÓN';
    }
  });
});

/**
 * Verificar si ya hay una sesión activa
 * Si existe, redirige al dashboard (evita volver a login)
 */
async function checkExistingSession() {
  console.log('🔍 Verificando si ya hay sesión activa...');

  const user = getCurrentUser();
  if (!user) {
    console.log('❌ No hay sesión activa');
    return;
  }

  try {
    // Verificar con el servidor si el JWT es válido
    const response = await authFetch('/api/folders?level=0');

    if (response.ok) {
      console.log('✅ Sesión activa detectada, redirigiendo...');
      window.location.href = '/index.html';
    } else {
      console.log('⚠️ Token expirado, permitir nuevo login');
      localStorage.removeItem('user');
      localStorage.removeItem('currentUser');
    }
  } catch (error) {
    console.error('❌ Error al verificar sesión:', error);
  }
}
