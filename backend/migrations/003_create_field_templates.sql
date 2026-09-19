-- Plantillas de campos: guardar los campos de un pagare para reutilizarlos.
--
-- Los once pagares de un colegio comparten la misma estructura —52 campos de
-- texto, 6 de firma, sello y firma definitiva en 11 paginas— y hoy el operador
-- los pinta uno por uno en cada grado. Son mas de 600 campos a mano, y cada
-- uno mal puesto acaba en un contrato: los datos del codeudor en la casilla
-- del deudor.
--
-- ESTA MIGRACION SOLO CREA TABLAS NUEVAS.
-- No borra, no altera ninguna tabla existente y no mueve datos. Las dos tablas
-- nacen vacias.
--
-- Por que no se usa la tabla `template_fields` que ya existe:
--   1. su clave foranea apunta a `documents`, asi que la plantilla muere con el
--      documento que la origino — no es reutilizable;
--   2. su enum de tipos no incluye `signature`, `seal` ni `final_signature`,
--      que son justo los que hay que exportar.

-- ---------------------------------------------------------------------------
-- La plantilla
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_templates (
  template_id     INT NOT NULL AUTO_INCREMENT,

  name            VARCHAR(255) NOT NULL
                  COMMENT 'Se hereda del documento origen, editable al exportar',
  description     VARCHAR(500) DEFAULT NULL,

  -- Quien la creo. La plantilla es suya aunque el documento origen se borre.
  owner_user_id   INT NOT NULL,

  -- Equipo con el que se comparte. NULL = solo la ve su dueño.
  -- Se rellena con el equipo del creador al exportar; si no tiene, queda NULL.
  -- ON DELETE SET NULL a proposito: si el equipo desaparece, la plantilla
  -- sobrevive como privada en vez de evaporarse.
  team_id         INT DEFAULT NULL,

  -- De donde salio, solo como referencia para el operador.
  -- SIN clave foranea a proposito: si el documento origen se borra, la
  -- plantilla debe seguir viva.
  source_document_id   INT DEFAULT NULL,
  source_document_name VARCHAR(255) DEFAULT NULL,

  -- Tamaño de pagina del PDF origen, en puntos PDF.
  -- Si el destino tiene otro tamaño (carta -> oficio) los campos caen
  -- desplazados. NO se escalan: se avisa al operador, que corrige con
  -- seleccion multiple. Escalar mal desplaza un campo a la columna del otro
  -- responsable, que es el error que se quiere evitar.
  page_width      DECIMAL(10,2) DEFAULT NULL,
  page_height     DECIMAL(10,2) DEFAULT NULL,
  page_size_name  VARCHAR(20)   DEFAULT NULL COMMENT 'Carta, Oficio, A4',

  page_count      INT NOT NULL DEFAULT 1
                  COMMENT 'Paginas del PDF origen: avisa si el destino tiene menos',
  parts_count     INT NOT NULL DEFAULT 1
                  COMMENT 'Partes que necesita: 2 en los pagares',

  -- Huella de la estructura completa (tipo, pagina, posicion redondeada,
  -- tamaño, etiqueta y orden de firmante de cada campo). Permite avisar
  -- "esta plantilla ya se exporto antes" sin comparar campo por campo.
  -- Las posiciones van redondeadas para que un arrastre de decimas no cuente
  -- como plantilla distinta.
  fingerprint     CHAR(64) DEFAULT NULL,

  -- Resumen, para pintar la tarjeta sin recorrer los campos.
  total_fields           INT NOT NULL DEFAULT 0,
  text_fields            INT NOT NULL DEFAULT 0,
  signature_fields       INT NOT NULL DEFAULT 0,
  seal_fields            INT NOT NULL DEFAULT 0,
  date_fields            INT NOT NULL DEFAULT 0,
  final_signature_fields INT NOT NULL DEFAULT 0,

  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (template_id),
  KEY idx_owner  (owner_user_id, is_active),
  KEY idx_team   (team_id, is_active),
  KEY idx_huella (fingerprint),
  KEY idx_nombre (name),

  CONSTRAINT fk_ft_owner FOREIGN KEY (owner_user_id)
    REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ft_team FOREIGN KEY (team_id)
    REFERENCES teams(team_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Plantillas de campos reutilizables entre documentos';

-- ---------------------------------------------------------------------------
-- Los campos de cada plantilla
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_template_items (
  item_id      INT NOT NULL AUTO_INCREMENT,
  template_id  INT NOT NULL,

  -- Mismos tipos que document_fields, para que la importacion sea directa.
  field_type   ENUM('text','signature','date','seal','stamp','final_signature')
               NOT NULL,
  page_number  INT NOT NULL DEFAULT 1,

  -- Mismas unidades que document_fields: espacio natural del PDF.
  x_position   DECIMAL(10,2) NOT NULL,
  y_position   DECIMAL(10,2) NOT NULL,
  width        DECIMAL(10,2) NOT NULL,
  height       DECIMAL(10,2) NOT NULL,

  field_label  VARCHAR(255) DEFAULT NULL,

  -- Formato completo: fuente, tamaño, color, negrita, cursiva, subrayado y
  -- alineacion. Es parte de la plantilla: si el operador ajusto la letra a 8
  -- puntos Calibri para que cupiera en la linea del contrato, esa decision se
  -- hereda.
  field_config LONGTEXT DEFAULT NULL,

  required     TINYINT(1) DEFAULT 1,

  -- CLAVE: el ORDEN de la parte, nunca su part_id.
  -- part_id identifica una parte de ESE documento; copiarlo haria que los
  -- campos importados apunten a partes de otro pagare. Al importar se busca
  -- la parte con este orden en el documento destino, y si no existe se crea.
  -- 1 = Firmante N1, 2 = Firmante N2, NULL = sin asignar.
  part_order   INT DEFAULT NULL,

  -- CLAVE: posicion explicita dentro de la plantilla.
  -- Las etiquetas se repiten ("Nombre:" seis veces en el pagare) y el orden
  -- decide a que responsable pertenece cada una. Nunca confiar en el orden en
  -- que la base devuelva las filas.
  order_index  INT NOT NULL DEFAULT 0,

  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (item_id),
  KEY idx_template      (template_id, order_index),
  KEY idx_template_page (template_id, page_number, order_index),
  KEY idx_tipo          (template_id, field_type),

  CONSTRAINT fk_fti_template FOREIGN KEY (template_id)
    REFERENCES field_templates(template_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Campos de una plantilla: posicion, formato y a que firmante van';
