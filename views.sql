DROP VIEW IF EXISTS `v_movimientos`;
CREATE VIEW `v_movimientos` AS
SELECT
    `m`.`id` AS `id`,
    `m`.`tipo` AS `tipo`,
    `m`.`producto_id` AS `producto_id`,
    COALESCE(`p`.`nombre`, '') AS `producto`,
    COALESCE(`p`.`codigo`, '') AS `codigo`,
    COALESCE(`p`.`unidad_medida`, 'kg') AS `unidad_medida`,
    `m`.`cantidad` AS `cantidad`,
    `m`.`monto` AS `monto`,
    `m`.`observacion` AS `observacion`,
    `m`.`fecha` AS `fecha`
FROM `movimientos` `m`
LEFT JOIN `productos` `p` ON `m`.`producto_id` = `p`.`id`;

DROP VIEW IF EXISTS `v_stock`;
CREATE VIEW `v_stock` AS
SELECT
    `p`.`id` AS `id`,
    `p`.`nombre` AS `nombre`,
    COALESCE(`p`.`codigo`, '') AS `codigo`,
    COALESCE(`p`.`unidad_medida`, 'kg') AS `unidad_medida`,
    COALESCE(`p`.`stock_base`, 0) + COALESCE(SUM(
        CASE
            WHEN `m`.`tipo` = 'compra' THEN `m`.`cantidad`
            WHEN `m`.`tipo` = 'venta' THEN -`m`.`cantidad`
            ELSE 0
        END
    ), 0) AS `stock_cantidad`
FROM `productos` `p`
LEFT JOIN `movimientos` `m` ON `m`.`producto_id` = `p`.`id`
WHERE `p`.`activo` = 1
GROUP BY
    `p`.`id`,
    `p`.`nombre`,
    `p`.`codigo`,
    `p`.`unidad_medida`,
    `p`.`stock_base`;
