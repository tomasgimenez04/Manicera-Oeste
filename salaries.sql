CREATE TABLE IF NOT EXISTS sueldos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  descripcion VARCHAR(255) NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  tipo_pago ENUM('unico', 'diario', 'semanal', 'quincenal', 'mensual') NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_sueldos_activo (activo),
  KEY idx_sueldos_fechas (fecha_inicio, fecha_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos_sueldos (
  id INT(11) NOT NULL AUTO_INCREMENT,
  sueldo_id INT(11) NOT NULL,
  monto_pagado DECIMAL(12,2) NOT NULL,
  fecha_pago DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pagos_sueldos_sueldo (sueldo_id),
  KEY idx_pagos_sueldos_fecha (fecha_pago),
  CONSTRAINT fk_pagos_sueldos_sueldo
    FOREIGN KEY (sueldo_id) REFERENCES sueldos (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
