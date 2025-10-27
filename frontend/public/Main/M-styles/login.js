document.addEventListener('DOMContentLoaded', () => {
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

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Deshabilitar botón mientras se procesa
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'VERIFICANDO...';

    try {
      // Llamada al backend
      const response = await fetch('/api/login', {
        method: 'POST',
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
        // Guardar información del usuario en localStorage
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        
        console.log('✅ Login exitoso:', data.user);
        
        // Redireccionar al dashboard
        window.location.href = '/index.html';
      } else {
        // Mostrar error
        passError.textContent = data.message || 'Error al iniciar sesión';
        submitBtn.disabled = false;
        submitBtn.textContent = 'INICIAR SESIÓN';
      }
    } catch (error) {
      console.error('❌ Error:', error);
      passError.textContent = 'Error de conexión. Intenta nuevamente.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'INICIAR SESIÓN';
    }
  });
});
