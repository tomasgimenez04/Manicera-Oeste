CREATE TABLE IF NOT EXISTS cuentas_corrientes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cliente VARCHAR(255) NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_vencimiento DATE NULL,
    monto_total DECIMAL(12,2) NOT NULL,
    monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado ENUM('pendiente', 'parcial', 'saldada', 'archivada') NOT NULL DEFAULT 'pendiente',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cuenta_id INT UNSIGNED NOT NULL,
    producto_id INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_cc_items_cuenta_id (cuenta_id),
    KEY idx_cc_items_producto_id (producto_id),
    CONSTRAINT fk_cc_items_cuenta
        FOREIGN KEY (cuenta_id) REFERENCES cuentas_corrientes(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_cc_items_producto
        FOREIGN KEY (producto_id) REFERENCES productos(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cc_pagos (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cuenta_id INT UNSIGNED NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    observacion VARCHAR(255) NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cc_pagos_cuenta_id (cuenta_id),
    KEY idx_cc_pagos_fecha (fecha),
    CONSTRAINT fk_cc_pagos_cuenta
        FOREIGN KEY (cuenta_id) REFERENCES cuentas_corrientes(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
