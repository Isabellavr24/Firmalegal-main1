# Petición a VI: consultar validaciones por correo, y una cosa que hay que mirar

**2 de octubre de 2026**

---

## Primero: gracias, las tres anteriores funcionan

Verificado en DEV:

- `iniciar-validacion` devuelve el `codigo` ✓
- `validaciones/consultar` devuelve `intentos` ✓
- El formulario pre-rellena los seis campos y los deja editables ✓

Los tres desplegables muestran la opción correcta, no "Seleccione...". Lo del
evento `change` estaba bien visto.

---

## La cuarta petición: consultar por correo

Que `validaciones/consultar` acepte también `emails`, además de `codigos`:

```json
{ "emails": ["diegoarrietaherrera8@gmail.com"] }
```

Devolviendo, por cada correo, su validación **más reciente** (o todas, si os
resulta más natural; nosotros nos quedaríamos con la última).

### Por qué

Guardamos el código cuando la validación se crea **desde nuestro botón**. Pero
el operador también puede crearla **desde vuestro panel**, y en ese caso
nosotros no nos enteramos de nada: la pantalla sigue diciendo "no tiene
validación" cuando sí la tiene.

Acaba de pasar en una prueba. Se creó `VAL-MURBBUTV-6624CF` desde vuestro
formulario, existe en vuestra base, y nuestra tabla de pendientes está vacía.

Con la consulta por correo dejamos de depender de por dónde se creó: preguntamos
por el correo del firmante y nos enteramos igual.

El correo es además el ancla natural, porque es lo que identifica al firmante en
los dos sistemas.

---

## Y algo que conviene que miréis

En esa misma prueba hay un detalle que no sabemos explicar.

El formulario se abrió con los datos de **Diego**, pre-rellenados desde nuestra
URL, y así se veían en pantalla:

```
Documento:       79458213
Nombre completo: DIEGO ARRIETA HERRERA
Celular:         3009998877
Email:           diegoarrietaherrera8@gmail.com
```

Pero la validación quedó guardada así:

```
documento:       1062427399
nombre_completo: Juan Diego Arrieta Herrera
celular:         +573214573516
email_firmante:  diegoarrietaherrera8@gmail.com
```

El correo es el correcto. La cédula, el nombre y el celular son los **del
operador que tenía la sesión abierta** (`pkiservices@admin.com`), no los que
mostraba el formulario.

**No sabemos si es un fallo o si el operador los cambió a mano antes de enviar**
—estaba probando y es posible que pusiera sus propios datos para poder validarse
él—. Por eso no lo damos por bug.

Pero merece una mirada: si el formulario puede guardar datos distintos de los
que muestra, eso crearía validaciones a nombre de quien no es. Y en nuestro caso
son pagarés con valor legal.

Lo que ayudaría a descartarlo: abrir el formulario con una URL pre-rellenada,
**no tocar nada**, enviar, y comprobar qué quedó guardado.

---

## Resumen

1. **`validaciones/consultar` que acepte `emails`** — para enterarnos de las
   validaciones que se crean desde vuestro panel.
2. **Comprobar** si el formulario guarda lo que muestra, o puede guardar otra
   cosa.

La primera es una petición; la segunda es solo una verificación, por si acaso.
