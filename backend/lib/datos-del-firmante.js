// De donde sale la cedula de un firmante para crear su validacion de identidad.
//
// POR QUE EXISTE ESTE ARCHIVO:
//
// Hasta ahora FirmaLegal creaba las validaciones mandando solo el correo y el
// nombre. Nunca mandaba la cedula, aunque VI la acepta (`signer_documento` y
// `signer_tipo_documento`). Resultado: validaciones con "Documento: -", que el
// padre abre y no puede completar porque no hay nada contra que comparar.
//
// La cedula si esta: viene en el CSV y queda en `field_values`, el mismo sitio
// de donde salen los campos que se pintan en el pagare.
//
// EL PROBLEMA DE EMPAREJARLA:
//
// Un pagare lleva a DOS responsables en el mismo juego de campos, con las
// etiquetas repetidas:
//
//   Nombres y apellidos:  JUAN DIEGO ARRIETA HERRERA   <- Responsable 1
//   Nombres y apellidos:  DIEGO ARRIETA HERRERA        <- Responsable 2
//   Cedula de ciudadania: 1010101010                   <- de Responsable 1
//   Cedula de ciudadania: 2020202020                   <- de Responsable 2
//
// Tomar "la primera cedula" le mandaria a DIEGO la cedula de JUAN DIEGO. En el
// pagare de un padre real eso es inaceptable: la validacion le saldria mal y
// ademas estariamos tratando sus datos como si fueran de otro.
//
// COMO SE EMPAREJA, ENTONCES:
//
// Midiendo los campos reales de un pagare se ve el patron, y es constante:
// cada etiqueta que se repite alterna Responsable 1, Responsable 2,
// Responsable 1, Responsable 2... El bloque entero se repite en cada pagina
// del pagare, pero la alternancia se mantiene.
//
//   Nombres y apellidos:   [0] JUAN DIEGO   [1] DIEGO   [2] JUAN DIEGO   [3] DIEGO
//   Cedula de ciudadania:  [0] 1010101010   [1] 2020..  [2] 1010101010   [3] 2020..
//   Correo electronico:    [0] juandiego@   [1] diego8@ [2] juandiego@   [3] diego8@
//
// Asi que cada responsable ocupa SIEMPRE la misma paridad: el primero los
// indices pares, el segundo los impares. Se busca en que paridad cae el correo
// del destinatario y se toma la cedula de esa misma paridad.
//
// Se usa la paridad y no el indice absoluto porque las etiquetas no se repiten
// todas el mismo numero de veces: en el pagare real "Correo electronico" sale
// 2 veces y "Correo electronico:" sale 4. El indice 1 y el 3 son la misma
// persona; el 0 y el 2, la otra.
//
// Y si no cuadra -su correo no esta, en esa paridad no hay cedula, o las
// distintas paginas se contradicen- NO SE INVENTA: se devuelve null con el
// motivo, y quien llama decide. Arriba eso significa no enviarle el correo y
// decir por que, que es mejor que mandarle una validacion que no va a poder
// completar.
//
// OJO si alguna vez un pagare lleva TRES responsables: la paridad deja de
// servir tal cual. Por eso se cuenta cuantos hay antes de fiarse del patron, y
// si no son uno o dos, se bloquea.

// Las etiquetas del pagare no son estables -las pone quien arma la plantilla-
// asi que se reconocen por lo que dicen, sin acentos ni mayusculas.
const SIN_ACENTOS = (t) => String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const ES_CEDULA = (etiqueta) => {
    const e = SIN_ACENTOS(etiqueta);
    return /c\.?\s*c\.?/.test(e) || e.includes('cedula') ||
           e.includes('documento de identidad') || e.includes('identificacion');
};

const ES_CORREO = (etiqueta) => SIN_ACENTOS(etiqueta).includes('correo') ||
                                SIN_ACENTOS(etiqueta).includes('email');

const ES_CELULAR = (etiqueta) => {
    const e = SIN_ACENTOS(etiqueta);
    return e.includes('celular') || e.includes('telefono') || e.includes('movil');
};

// El celular, como lo quiere VI: +57 y diez digitos. Sin el, el firmante no
// recibe el codigo OTP y no puede completar la validacion, asi que vale la
// pena ser estricto: si el numero no es un movil colombiano valido, mejor no
// mandar nada que mandar algo que no va a recibir.
//
// Un movil colombiano son 10 digitos que empiezan por 3. Los fijos (7 digitos)
// no sirven para el OTP.
const NORMALIZAR_CELULAR = (v) => {
    let d = String(v || '').replace(/[^0-9]/g, '');
    if (d.startsWith('57') && d.length === 12) d = d.slice(2);   // ya traia el 57
    if (d.length !== 10 || d[0] !== '3') return null;
    return '+57' + d;
};

const ES_NOMBRE = (etiqueta) => {
    const e = SIN_ACENTOS(etiqueta);
    // "Nombre del alumno" NO: el pagare es del acudiente, no del estudiante
    if (e.includes('alumno') || e.includes('estudiante')) return false;
    // "Responsable 1" / "Responsable 2" tampoco: esas van NUMERADAS en la
    // etiqueta, no repetidas, asi que cada una sale una sola vez y siempre en
    // el indice 0. La paridad no les aplica y si se cuentan, el primer
    // responsable acaba con el nombre del segundo. Se tratan aparte, abajo.
    if (/^responsables*d/.test(e)) return false;
    return e.includes('nombre');
};

// "Responsable 1", "Responsable 2": el numero de la etiqueta dice de quien es,
// sin depender del orden. Devuelve 1 o 2, o null si no es una de esas.
const NUMERO_DE_RESPONSABLE = (etiqueta) => {
    const m = SIN_ACENTOS(etiqueta).match(/^responsables*(d+)/);
    return m ? parseInt(m[1], 10) : null;
};

// Una cedula colombiana: solo digitos, de 6 a 12. Sirve para no confundirla
// con un telefono mal etiquetado ni con una fecha.
const PARECE_CEDULA = (v) => /^\d{6,12}$/.test(String(v || '').replace(/[.\s-]/g, ''));

const LIMPIAR_CEDULA = (v) => String(v || '').replace(/[.\s-]/g, '').trim();

// Agrupa los campos por etiqueta conservando el orden de aparicion: ese orden
// es el que alterna entre un responsable y otro.
function porEtiqueta(campos) {
    const grupos = new Map();
    for (const c of campos) {
        const clave = SIN_ACENTOS(c.field_label);
        if (!grupos.has(clave)) grupos.set(clave, { etiqueta: c.field_label, valores: [] });
        grupos.get(clave).valores.push(String(c.text_value == null ? '' : c.text_value).trim());
    }
    return grupos;
}

/**
 * Saca el nombre y la cedula de UNA persona de los campos de su pagare.
 *
 * @param {object[]} campos  filas de field_values con su etiqueta, EN ORDEN
 *                           ({ field_id, field_label, text_value })
 * @param {string} email     el correo del destinatario: el ancla
 * @returns {{nombre: string|null, documento: string|null, motivo: string|null}}
 *          `motivo` dice por que no se pudo, cuando no se pudo. Va a la
 *          pantalla tal cual, asi que esta escrito para leerlo.
 */
// Dos nombres son el mismo si solo difieren en mayusculas, tildes o espacios.
// El CSV de la universidad mezcla las dos formas: "NANCY ANGELICA LARA" y
// "Nancy Angelica Lara" son la misma persona.
const MISMO_NOMBRE = (t) => SIN_ACENTOS(t).replace(/[^0-9a-z]/g, '');

function datosDeFirmante(campos, email, nombreFirmante) {
    if (!email) return { nombre: null, documento: null, celular: null, motivo: 'El destinatario no tiene correo' };
    if (!Array.isArray(campos) || !campos.length) {
        return { nombre: null, documento: null, celular: null, motivo: 'El pagare no tiene campos mapeados' };
    }

    const correoBuscado = String(email).trim().toLowerCase();
    const grupos = [...porEtiqueta(campos).values()];

    // Cuantas personas distintas lleva el pagare. Se deduce de las etiquetas de
    // correo: la que mas correos distintos tenga manda. Hoy siempre son 1 o 2,
    // pero se comprueba en vez de darlo por hecho.
    let responsables = 0;
    let hayCorreo = false;
    for (const g of grupos) {
        if (!ES_CORREO(g.etiqueta)) continue;
        hayCorreo = true;
        const distintos = new Set(g.valores.filter(v => v.includes('@')).map(v => v.toLowerCase()));
        if (distintos.size > responsables) responsables = distintos.size;
    }

    // EL CORREO NO SIEMPRE DELATA CUANTOS SON.
    //
    // Cuando dos personas comparten correo -marido y mujer declarando el mismo-
    // contar correos distintos da 1, y entonces la paridad es siempre 0: el
    // codigo cree que hay un solo responsable, encuentra las dos cedulas en la
    // misma posicion y bloquea.
    //
    // Los NOMBRES si los delatan: "Responsable 1" y "Responsable 2" existen
    // aunque el correo se repita. Se toma el mayor de los dos recuentos.
    if (hayCorreo) {
        let porNombres = 0;
        for (const g of grupos) {
            if (!ES_NOMBRE(g.etiqueta) || NUMERO_DE_RESPONSABLE(g.etiqueta) !== null) continue;
            const distintos = new Set(
                g.valores.filter(v => v && !v.includes('@') && !PARECE_CEDULA(v))
                         .map(v => MISMO_NOMBRE(v)).filter(Boolean));
            if (distintos.size > porNombres) porNombres = distintos.size;
        }
        // Y las etiquetas numeradas, que son las mas fiables de todas
        const numeradas = new Set();
        for (const g of grupos) {
            const n = NUMERO_DE_RESPONSABLE(g.etiqueta);
            if (n !== null) numeradas.add(n);
        }
        responsables = Math.max(responsables, porNombres, numeradas.size);
    }
    if (responsables === 0) {
        return { nombre: null, documento: null, celular: null,
                 motivo: 'El pagare no trae ningun campo de correo, no se puede emparejar su cedula' };
    }
    if (responsables > 2) {
        return { nombre: null, documento: null, celular: null,
                 motivo: 'El pagare trae ' + responsables + ' personas distintas y no se puede emparejar con certeza, hay que revisarlo a mano' };
    }

    // En que paridad cae SU correo. Con dos responsables, el primero ocupa los
    // indices pares y el segundo los impares, en todas las etiquetas.
    const paridades = new Set();
    for (const g of grupos) {
        if (!ES_CORREO(g.etiqueta)) continue;
        g.valores.forEach((v, i) => {
            if (v.toLowerCase() === correoBuscado) paridades.add(i % responsables);
        });
    }

    // SI SU CORREO NO ESTA EN EL PAGARE, TODAVIA QUEDA EL NOMBRE.
    //
    // Pasa cuando alguien pide que le escribamos a otro correo: el del sistema
    // cambia y el del pagare se queda como se declaro, que es lo correcto. Pero
    // entonces emparejar por correo ya no encuentra nada.
    //
    // Antes se devolvia "no se puede saber cual es su cedula" y esa persona
    // quedaba sin poder validarse, aunque su nombre estuviera en el pagare al
    // lado de su cedula. El 07-10 le paso a una firmante que solo habia pedido
    // cambiar de hotmail a gmail.
    //
    // No se inventa nada: se cae al emparejamiento por nombre de mas abajo, que
    // es el mismo que ya resuelve los correos compartidos y que solo acepta un
    // resultado si el nombre cae en UNA sola paridad.
    if (!paridades.size && !nombreFirmante) {
        return { nombre: null, documento: null, celular: null,
                 motivo: 'Su correo no aparece entre los campos del pagare, no se puede saber cual es su cedula' };
    }
    // CUANDO EL CORREO NO BASTA, SE USA EL NOMBRE.
    //
    // Pasa con los correos compartidos: dos personas -normalmente marido y
    // mujer- declaran el mismo correo, asi que aparece en las dos paridades y
    // emparejar por correo no distingue cual es cual. En produccion son 95 de
    // 894 personas pendientes.
    //
    // El nombre si las distingue, y en el pagare va en el mismo orden que las
    // cedulas: "Responsable 1" con la primera, "Responsable 2" con la segunda.
    // Buscando en que paridad aparece SU nombre se sabe cual le toca.
    let mia = paridades.size === 1 ? [...paridades][0] : null;

    if (mia === null && nombreFirmante) {
        const buscado = MISMO_NOMBRE(nombreFirmante);
        const porNombre = new Set();
        for (const g of grupos) {
            // Las etiquetas numeradas dicen de quien son sin ambiguedad
            const numero = NUMERO_DE_RESPONSABLE(g.etiqueta);
            if (numero !== null) {
                const v = g.valores[0];
                if (v && MISMO_NOMBRE(v) === buscado) porNombre.add(numero - 1);
                continue;
            }
            if (!ES_NOMBRE(g.etiqueta)) continue;
            g.valores.forEach((v, i) => {
                if (v && MISMO_NOMBRE(v) === buscado) porNombre.add(i % responsables);
            });
        }
        // Solo vale si su nombre cae en UNA paridad. Si tambien se repite
        // -dos personas con el mismo nombre y el mismo correo- seguimos sin
        // poder distinguirlas.
        if (porNombre.size === 1) mia = [...porNombre][0];
    }

    // Ni el correo ni el nombre desambiguan. Prefiero que un operador lo mire
    // a que un padre reciba la validacion con la cedula de otro.
    if (mia === null) {
        return { nombre: null, documento: null, celular: null,
                 motivo: paridades.size
                     ? 'Su correo aparece dos veces en el pagare y el nombre no permite distinguirlo, hay que revisarlo a mano'
                     : 'Ni su correo ni su nombre aparecen en el pagare, hay que revisarlo a mano' };
    }

    // La cedula y el nombre que ocupan ESA misma paridad.
    const cedulas = new Set(), nombres = new Set(), celulares = new Set();
    for (const g of grupos) {
        // "Responsable 1" / "Responsable 2": el numero de la etiqueta ya dice
        // de quien es. `mia` vale 0 para el primero y 1 para el segundo.
        const numero = NUMERO_DE_RESPONSABLE(g.etiqueta);
        if (numero !== null) {
            const v = g.valores[0];
            if (v && numero - 1 === mia && !v.includes('@') && !PARECE_CEDULA(v)) {
                nombres.add(v.toUpperCase());
            }
            continue;
        }

        g.valores.forEach((v, i) => {
            if (!v || i % responsables !== mia) return;
            if (ES_CEDULA(g.etiqueta) && PARECE_CEDULA(v)) cedulas.add(LIMPIAR_CEDULA(v));
            else if (ES_CELULAR(g.etiqueta)) {
                const cel = NORMALIZAR_CELULAR(v);
                if (cel) celulares.add(cel);
            }
            else if (ES_NOMBRE(g.etiqueta) && !v.includes('@') && !PARECE_CEDULA(v)) {
                nombres.add(v.toUpperCase());
            }
        });
    }

    // Si las paginas dan cedulas DISTINTAS para la misma persona, el pagare se
    // contradice: no se elige una. Prefiero que un operador lo mire a que un
    // padre reciba la validacion con la cedula de otro.
    if (cedulas.size > 1) {
        return { nombre: null, documento: null, celular: null,
                 motivo: 'El pagare trae ' + cedulas.size + ' cedulas distintas para esta persona, hay que revisarlo a mano' };
    }
    if (!cedulas.size) {
        return { nombre: null, documento: null, celular: null,
                 motivo: 'El pagare no trae la cedula de esta persona' };
    }

    return {
        nombre: nombres.size === 1 ? [...nombres][0] : null,
        documento: [...cedulas][0],
        // Si el pagare da varios celulares distintos para la misma persona no
        // se elige uno: se manda sin celular y la pantalla lo avisa. Mandar el
        // OTP al numero equivocado es peor que no mandarlo.
        celular: celulares.size === 1 ? [...celulares][0] : null,
        celulares_distintos: celulares.size > 1,
        motivo: null
    };
}

/**
 * Lo mismo, pero leyendo los campos de la base.
 *
 * El ORDEN importa -la alternancia entre responsables se cuenta por posicion-
 * asi que se ordena por `field_id`, que es el orden en que se crearon al mapear.
 */
async function datosDeFirmanteDesdeBD(db, recipientId, email) {
    const [campos] = await db.promise().query(
        `SELECT fv.field_id, df.field_label, fv.text_value
         FROM field_values fv
         JOIN document_fields df ON df.field_id = fv.field_id
         WHERE fv.recipient_id = ? AND fv.value_type = 'text'
         ORDER BY fv.field_id`,
        [recipientId]
    );

    // Su nombre, que hace falta cuando dos personas comparten el correo: es
    // lo unico que las distingue. Si no se puede leer se sigue sin el, y el
    // emparejamiento por correo funciona como siempre.
    let nombre = null;
    try {
        const [r] = await db.promise().query(
            'SELECT name FROM document_recipients WHERE recipient_id = ?',
            [recipientId]);
        nombre = (r[0] && r[0].name) || null;
    } catch (e) { /* se sigue sin el nombre */ }

    return datosDeFirmante(campos, email, nombre);
}

module.exports = { datosDeFirmante, datosDeFirmanteDesdeBD };
