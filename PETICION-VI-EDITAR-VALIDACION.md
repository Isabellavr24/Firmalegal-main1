# Petición a VI: una sola validación por persona

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

## El problema: cada corrección y cada reenvío crea una validación nueva

Hoy, en vuestra API interna, lo único que podemos llamar es
`iniciar-validacion`, y esa **crea** una validación cada vez. No hay forma de
reenviar ni de editar.

Eso significa que una misma persona acaba con varias validaciones vivas, y
entonces ya no se sabe cuál es la suya.

Nos pasó el 2 y 3 de octubre en DEV, con `diegoarrietaherrera8@gmail.com`:

| creada | código | nombre | cédula |
|---|---|---|---|
| 02/10 18:44 | `VAL-MURBBUTV-6624CF` | Juan Diego Arrieta Herrera | 1062427399 |
| 03/10 22:36 | `VAL-MUSZ1NNU-32B15F` | DIEGO ARRIETA HERRERA | 79458213 |

La primera es la **corregida a mano**, porque el CSV traía mal los datos. La
segunda la creó nuestro botón de "Reenviar validación", que al no tener otra
cosa que llamar volvió a `iniciar-validacion` con los datos del CSV sin
corregir.

Resultado: la corrección quedó enterrada. Nuestra pantalla enseña la del
03/10, el operador ve los datos viejos y cree que su corrección no se guardó.
Y **por fecha no se puede saber cuál lleva el dato bueno**: aquí la corregida
es la vieja, así que ninguna regla automática acierta.

---

## Lo que pedimos: dos rutas

### 1. Editar una validación existente

```
PATCH /validacion/api/firmalegal/validaciones/:codigo
```

```json
{
  "nombre_completo": "JUAN DIEGO ARRIETA HERRERA",
  "documento": "1062427399",
  "tipo_documento": "CC",
  "celular": "+573214573516"
}
```

Con los campos que vengan, dejando los demás como estaban, y devolviendo la
validación resultante para que podamos confirmar qué quedó guardado.

Solo sobre una validación **pendiente o en proceso**. Si ya está completada,
devolvednos un error: los datos con los que alguien se validó biométricamente
no se tocan.

### 2. Reenviar el correo de una validación existente

```
POST /validacion/api/firmalegal/validaciones/:codigo/reenviar
```

Que vuelva a mandar el correo de **esa** validación, con su mismo código y su
mismo enlace, sin crear otra ni cambiarle la fecha de vencimiento.

Hoy, cuando el operador pulsa "Reenviar validación", lo que ocurre por dentro
es que se crea una validación nueva. El nombre del botón dice una cosa y el
sistema hace otra, y el enlace que la persona ya tenía en su bandeja deja de
ser el vigente.

---

## El modelo que queremos

Una persona tiene **una** validación de identidad. Sobre ella:

- **Enviar** la crea, una sola vez.
- **Corregir** edita sus datos. No crea otra.
- **Reenviar** vuelve a mandar su correo. No crea otra.

Esto no es una preferencia de diseño nuestra: es lo que hace que el sistema se
pueda entender. Una validación es de la **persona**, no del documento — en el
envío de la Universidad Libre hay padres con hijos en dos cursos, que firman
dos pagarés con una sola cédula. Si cada corrección y cada reenvío generan una
validación más, con 1.277 firmantes eso se vuelve ingobernable en días.

---

## Mientras tanto

De nuestro lado ya hicimos lo que podíamos: antes de crear, miramos si esa
persona tiene validación en VI y mandamos **sus** datos en vez de los del CSV,
para que al menos la correción no se pierda. Pero sigue creando un duplicado,
porque `iniciar-validacion` es lo único que hay.

Si editar y reenviar en caliente os complica algo que no vemos desde fuera,
nos valdría que `iniciar-validacion`, al recibir un correo que ya tiene
validación pendiente, **actualice esa en vez de crear otra** y nos devuelva su
mismo código. El efecto para nosotros sería el mismo.

---

## Una cosa más, pequeña

`validaciones/consultar` devuelve una sola validación por correo, la más
reciente. Mientras existan duplicados, nos ayudaría que las devuelva **todas**,
para poder avisar en pantalla de que esa persona tiene más de una. Ahora mismo
no podemos ni detectarlo.

---

## Prioridad

Alta para la de editar, media para la de reenviar. Cada corrección que se hace
hoy deja una validación huérfana, y cada reenvío deja otra. No bloquea a nadie
de inmediato, pero ensucia los intentos, hace que la pantalla pueda enseñar la
equivocada y convierte cada consulta de un padre en una investigación manual.

Gracias.
