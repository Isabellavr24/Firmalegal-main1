# Petición a VI: poder corregir una validación sin crear otra

**5 de octubre de 2026**

---

## Lo anterior ya está funcionando

Las cuatro peticiones anteriores están en DEV y verificadas:

- `iniciar-validacion` devuelve el `codigo`
- `validaciones/consultar` devuelve `intentos`
- El formulario pre-rellena los seis campos y los deja editables
- `validaciones/consultar` acepta `emails`

Con lo último se resolvió el caso que más nos dolía: ahora vemos las
validaciones que el operador crea desde vuestro panel, no solo las nuestras.

---

## La quinta: una ruta para editar

Lo que necesitamos es poder cambiar los datos de una validación **que ya
existe**, sin crear una nueva:

```
PATCH /validacion/api/firmalegal/validaciones/:codigo
```

```json
{
  "nombre_completo": "JUAN DIEGO ARRIETA HERRERA",
  "documento": "1062427399",
  "tipo_documento": "CC",
  "celular": "+573214573516",
  "email_firmante": "diegoarrietaherrera8@gmail.com"
}
```

Con los campos que vengan, dejando los demás como estaban. Y devolviendo la
validación resultante, para que podamos confirmar qué quedó guardado.

Solo tiene sentido sobre una validación **pendiente o en proceso**. Si ya está
completada, lo correcto es que nos devolváis un error: los datos con los que
alguien se validó biométricamente no se tocan.

---

## Por qué

Hoy, cuando el operador pulsa "Corregir información", lo que puede hacer es
rellenar vuestro formulario y crear **otra** validación. La anterior se queda
ahí, pendiente, con los datos malos.

Y eso nos deja a la misma persona con dos validaciones vivas. En nuestra
pantalla aparece la que encontremos primero, que no necesariamente es la
corregida. Si llega a completar la vieja, la buena se queda colgada; si
completa la nueva, la vieja sigue contando como intento pendiente.

El problema de fondo es que **una validación de identidad es de la persona, no
del documento**. Esto no es teórico: en el envío de la Universidad Libre hay
padres con dos hijos, en octavo y en décimo. Firman dos pagarés y tienen una
sola cédula. Ya reutilizamos la misma validación para los dos — vosotros nos
dais el estado por correo y nosotros la marcamos en todos sus pagarés.

Pero si se corrige la información, ese modelo se rompe: la corrección crea una
validación nueva que solo vale para un pagaré, y vuelven a aparecer dos
identidades para la misma persona. Con 1.277 firmantes eso no es una rareza, es
algo que va a pasar varias veces por semana.

Con una ruta de edición, corregir es corregir: un solo registro, un solo
código, válido para todos sus pagarés.

---

## Lo que ya tenéis y no nos sirve para esto

Hemos mirado qué hay disponible:

- `PATCH /:id/completar-manual` — la da por buena. No es lo que queremos: la
  persona todavía tiene que validarse, lo que estaba mal eran sus datos.
- `PATCH /:id/anular` — la cancela. Serviría para un "anular y crear de nuevo",
  pero eso pierde los intentos y la fecha de creación, y le cambia el código.
  Si ya le habíamos mandado el correo, el enlace que tiene en su bandeja deja
  de funcionar.

Por eso pedimos la edición y no nos arreglamos con las dos que hay.

---

## Si os sirve una alternativa

Si editar en caliente os complica algo que no vemos desde fuera, nos valdría
igual un `reemplazar`: que anule la vieja y cree la nueva **conservando el
código**, de forma que el enlace que la persona ya tiene siga llevándola al
sitio correcto. Lo que necesitamos de verdad es que al final quede **una sola
validación por persona**, no dos.

---

## Prioridad

Media. No hay nadie bloqueado ahora mismo: se puede corregir creando otra y
nosotros nos quedamos con la más reciente. Pero mientras no exista, cada
corrección deja una validación huérfana, y eso ensucia los intentos y hace que
la pantalla pueda enseñar la equivocada.

Gracias.
