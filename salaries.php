<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

include 'connection.php';

date_default_timezone_set('America/Argentina/Buenos_Aires');

const SALARY_TYPES = ['unico', 'diario', 'semanal', 'quincenal', 'mensual'];

function respond_json($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function get_json_input() {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function parse_date_value($value) {
    if (!$value) {
        return null;
    }

    $value = (string) $value;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return null;
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    $errors = DateTimeImmutable::getLastErrors();

    if (!$date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return null;
    }

    return $date->format('Y-m-d') === $value ? $date : null;
}

function format_date_br($value) {
    if (!$value) {
        return null;
    }

    try {
        return (new DateTimeImmutable($value))->format('d/m/Y');
    } catch (Throwable $error) {
        return null;
    }
}

function format_datetime_br($value) {
    if (!$value) {
        return null;
    }

    try {
        return (new DateTimeImmutable($value))->format('d/m/Y H:i');
    } catch (Throwable $error) {
        return null;
    }
}

function add_months_keep_day(DateTimeImmutable $date, $months) {
    $day = intval($date->format('d'));
    $base = $date->setDate(intval($date->format('Y')), intval($date->format('m')), 1);
    $target = $base->modify(($months >= 0 ? '+' : '') . $months . ' month');
    $lastDay = intval($target->format('t'));

    return $target->setDate(
        intval($target->format('Y')),
        intval($target->format('m')),
        min($day, $lastDay)
    );
}

function get_salary_payment_date(DateTimeImmutable $start, $tipo, $index) {
    $index = max(0, intval($index));

    switch ($tipo) {
        case 'diario':
            return $start->modify('+' . $index . ' day');
        case 'semanal':
            return $start->modify('+' . ($index * 7) . ' day');
        case 'quincenal':
            return $start->modify('+' . ($index * 15) . ' day');
        case 'mensual':
            return add_months_keep_day($start, $index);
        case 'unico':
        default:
            return $index === 0 ? $start : null;
    }
}

function get_salary_payment_info(array $salary, array $payments, DateTimeImmutable $today) {
    $start = parse_date_value($salary['fecha_inicio']);
    $end = parse_date_value($salary['fecha_fin']);
    $tipo = $salary['tipo_pago'];
    $paidCount = count($payments);

    if (!$start) {
        return [
            'payment_date' => null,
            'pending_count' => 0,
            'status' => 'finalizado'
        ];
    }

    if ($tipo === 'unico') {
        if ($paidCount > 0) {
            return [
                'payment_date' => null,
                'pending_count' => 0,
                'status' => 'finalizado'
            ];
        }

        $pendingCount = $start <= $today ? 1 : 0;

        return [
            'payment_date' => $start,
            'pending_count' => $pendingCount,
            'status' => $pendingCount > 0 ? 'pendiente' : 'al_dia'
        ];
    }

    $nextIndex = $paidCount;
    $paymentDate = get_salary_payment_date($start, $tipo, $nextIndex);

    if (!$paymentDate || ($end && $paymentDate > $end)) {
        return [
            'payment_date' => null,
            'pending_count' => 0,
            'status' => 'finalizado'
        ];
    }

    $pendingCount = 0;
    $cursor = $paymentDate;
    $cursorIndex = $nextIndex;

    while ($cursor && $cursor <= $today && (!$end || $cursor <= $end)) {
        $pendingCount++;
        $cursorIndex++;
        $cursor = get_salary_payment_date($start, $tipo, $cursorIndex);
    }

    return [
        'payment_date' => $paymentDate,
        'pending_count' => $pendingCount,
        'status' => $pendingCount > 0 ? 'pendiente' : 'al_dia'
    ];
}

function require_salary_payload(array $body, $includeId = false) {
    $salaryId = $includeId ? intval($body['sueldo_id'] ?? 0) : 0;
    $descripcion = trim($body['descripcion'] ?? '');
    $monto = floatval($body['monto'] ?? 0);
    $tipoPago = trim($body['tipo_pago'] ?? '');
    $fechaInicio = trim($body['fecha_inicio'] ?? '');
    $fechaFin = array_key_exists('fecha_fin', $body) ? trim((string) $body['fecha_fin']) : '';

    if ($includeId && $salaryId <= 0) {
        throw new Exception('Selecciona un sueldo válido.', 400);
    }

    if ($descripcion === '') {
        throw new Exception('La descripción es obligatoria.', 400);
    }

    if ($monto <= 0) {
        throw new Exception('El monto debe ser mayor a 0.', 400);
    }

    if (!in_array($tipoPago, SALARY_TYPES, true)) {
        throw new Exception('El tipo de pago no es válido.', 400);
    }

    $startDate = parse_date_value($fechaInicio);
    if (!$startDate) {
        throw new Exception('La fecha de pago no es válida.', 400);
    }

    $endDate = null;
    if ($fechaFin !== '') {
        $endDate = parse_date_value($fechaFin);
        if (!$endDate) {
            throw new Exception('La fecha de fin no es válida.', 400);
        }

        if ($endDate < $startDate) {
            throw new Exception('La fecha de fin no puede ser anterior al inicio.', 400);
        }
    } else {
        $fechaFin = null;
    }

    return [
        'sueldo_id' => $salaryId,
        'descripcion' => $descripcion,
        'monto' => $monto,
        'tipo_pago' => $tipoPago,
        'fecha_inicio' => $fechaInicio,
        'fecha_fin' => $fechaFin
    ];
}

function fetch_salary_history(mysqli $conn, $salaryId) {
    $stmt = $conn->prepare('
        SELECT
            id,
            sueldo_id,
            monto_pagado,
            fecha_pago
        FROM pagos_sueldos
        WHERE sueldo_id = ?
        ORDER BY fecha_pago DESC, id DESC
    ');
    $stmt->bind_param('i', $salaryId);
    $stmt->execute();
    $result = $stmt->get_result();
    $history = [];

    while ($row = $result->fetch_assoc()) {
        $row['id'] = intval($row['id']);
        $row['sueldo_id'] = intval($row['sueldo_id']);
        $row['monto_pagado'] = floatval($row['monto_pagado']);
        $history[] = $row;
    }

    $stmt->close();
    return $history;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET' && isset($_GET['id'])) {
    $salaryId = intval($_GET['id']);

    if ($salaryId <= 0) {
        respond_json(['error' => 'ID de sueldo inválido.'], 400);
    }

    $history = fetch_salary_history($conn, $salaryId);
    $response = [];

    foreach ($history as $row) {
        $row['fecha_pago_formateada'] = format_datetime_br($row['fecha_pago']);
        $response[] = $row;
    }

    respond_json($response);
}

if ($method === 'GET') {
    $today = new DateTimeImmutable('today');
    $monthStart = $today->modify('first day of this month')->setTime(0, 0, 0);
    $nextMonthStart = $monthStart->modify('+1 month');

    $result = $conn->query('
        SELECT
            id,
            descripcion,
            monto,
            tipo_pago,
            fecha_inicio,
            fecha_fin,
            activo
        FROM sueldos
        WHERE activo = 1
        ORDER BY fecha_inicio ASC, id DESC
    ');

    if (!$result) {
        respond_json(['error' => 'Error al consultar sueldos.'], 500);
    }

    $items = [];
    $salaryIds = [];

    while ($row = $result->fetch_assoc()) {
        $row['id'] = intval($row['id']);
        $row['monto'] = floatval($row['monto']);
        $items[] = $row;
        $salaryIds[] = $row['id'];
    }

    $paymentsBySalary = [];
    if ($salaryIds) {
        $idList = implode(',', array_map('intval', $salaryIds));
        $paymentsResult = $conn->query("
            SELECT
                id,
                sueldo_id,
                monto_pagado,
                fecha_pago
            FROM pagos_sueldos
            WHERE sueldo_id IN ($idList)
            ORDER BY fecha_pago DESC, id DESC
        ");

        if ($paymentsResult) {
            while ($row = $paymentsResult->fetch_assoc()) {
                $salaryId = intval($row['sueldo_id']);
                if (!isset($paymentsBySalary[$salaryId])) {
                    $paymentsBySalary[$salaryId] = [];
                }

                $paymentsBySalary[$salaryId][] = [
                    'id' => intval($row['id']),
                    'monto_pagado' => floatval($row['monto_pagado']),
                    'fecha_pago' => $row['fecha_pago']
                ];
            }
        }
    }

    $monthlyStmt = $conn->prepare('
        SELECT
            COUNT(*) AS pagos_mes,
            COALESCE(SUM(monto_pagado), 0) AS total_mes
        FROM pagos_sueldos
        WHERE fecha_pago >= ? AND fecha_pago < ?
    ');
    $monthStartSql = $monthStart->format('Y-m-d H:i:s');
    $nextMonthSql = $nextMonthStart->format('Y-m-d H:i:s');
    $monthlyStmt->bind_param('ss', $monthStartSql, $nextMonthSql);
    $monthlyStmt->execute();
    $monthlyRow = $monthlyStmt->get_result()->fetch_assoc();
    $monthlyStmt->close();

    $pendingCount = 0;
    $activeItems = [];

    foreach ($items as $salary) {
        $salaryId = $salary['id'];
        $payments = $paymentsBySalary[$salaryId] ?? [];
        $paymentInfo = get_salary_payment_info($salary, $payments, $today);
        $pendingPayments = intval($paymentInfo['pending_count']);
        $paymentDate = $paymentInfo['payment_date'];

        $pendingCount += $pendingPayments;

        $salary['pagos_historicos'] = count($payments);
        $salary['pagos_pendientes'] = $pendingPayments;
        $salary['estado_periodo'] = $paymentInfo['status'];
        $salary['fecha_pago'] = $paymentDate ? $paymentDate->format('d/m/Y') : null;
        $salary['fecha_pago_alerta'] = $pendingPayments > 0;
        $salary['proximo_pago'] = $salary['fecha_pago'];
        $salary['fecha_inicio_formateada'] = format_date_br($salary['fecha_inicio']);
        $salary['fecha_fin_formateada'] = format_date_br($salary['fecha_fin']);
        $activeItems[] = $salary;
    }

    respond_json([
        'items' => $activeItems,
        'resumen' => [
            'pendientes' => $pendingCount,
            'pagados_mes' => intval($monthlyRow['pagos_mes'] ?? 0),
            'egresos_mes' => round(floatval($monthlyRow['total_mes'] ?? 0), 2)
        ]
    ]);
}

if ($method === 'POST') {
    $action = trim($_GET['accion'] ?? '');
    $body = get_json_input();

    if ($action === 'crear') {
        try {
            $payload = require_salary_payload($body);

            $stmt = $conn->prepare('
                INSERT INTO sueldos (descripcion, monto, tipo_pago, fecha_inicio, fecha_fin, activo)
                VALUES (?, ?, ?, ?, ?, 1)
            ');
            $stmt->bind_param(
                'sdsss',
                $payload['descripcion'],
                $payload['monto'],
                $payload['tipo_pago'],
                $payload['fecha_inicio'],
                $payload['fecha_fin']
            );

            if (!$stmt->execute()) {
                $stmt->close();
                throw new Exception('No se pudo registrar el sueldo.', 500);
            }

            $id = intval($conn->insert_id);
            $stmt->close();

            respond_json([
                'ok' => true,
                'id' => $id
            ]);
        } catch (Throwable $error) {
            $status = intval($error->getCode());
            if ($status < 400 || $status > 599) {
                $status = 500;
            }

            respond_json(['error' => $error->getMessage()], $status);
        }
    }

    if ($action === 'modificar') {
        try {
            $payload = require_salary_payload($body, true);

            $stmt = $conn->prepare('
                UPDATE sueldos
                SET descripcion = ?, monto = ?, tipo_pago = ?, fecha_inicio = ?, fecha_fin = ?
                WHERE id = ? AND activo = 1
            ');
            $stmt->bind_param(
                'sdsssi',
                $payload['descripcion'],
                $payload['monto'],
                $payload['tipo_pago'],
                $payload['fecha_inicio'],
                $payload['fecha_fin'],
                $payload['sueldo_id']
            );

            if (!$stmt->execute()) {
                $stmt->close();
                throw new Exception('No se pudo modificar el sueldo.', 500);
            }

            if ($stmt->affected_rows === 0) {
                $checkStmt = $conn->prepare('SELECT id FROM sueldos WHERE id = ? AND activo = 1');
                $checkStmt->bind_param('i', $payload['sueldo_id']);
                $checkStmt->execute();
                $exists = $checkStmt->get_result()->fetch_assoc();
                $checkStmt->close();

                if (!$exists) {
                    $stmt->close();
                    throw new Exception('El sueldo no existe o ya fue desactivado.', 404);
                }
            }

            $stmt->close();

            respond_json([
                'ok' => true,
                'id' => $payload['sueldo_id']
            ]);
        } catch (Throwable $error) {
            $status = intval($error->getCode());
            if ($status < 400 || $status > 599) {
                $status = 500;
            }

            respond_json(['error' => $error->getMessage()], $status);
        }
    }

    if ($action === 'pagar') {
        $salaryId = intval($body['sueldo_id'] ?? 0);

        if ($salaryId <= 0) {
            respond_json(['error' => 'Selecciona un sueldo válido.'], 400);
        }

        try {
            $conn->begin_transaction();

            $salaryStmt = $conn->prepare('
                SELECT
                    id,
                    descripcion,
                    monto,
                    tipo_pago,
                    fecha_inicio,
                    fecha_fin,
                    activo
                FROM sueldos
                WHERE id = ? AND activo = 1
                FOR UPDATE
            ');
            $salaryStmt->bind_param('i', $salaryId);
            $salaryStmt->execute();
            $salary = $salaryStmt->get_result()->fetch_assoc();
            $salaryStmt->close();

            if (!$salary) {
                throw new Exception('El sueldo no existe o ya fue desactivado.', 404);
            }

            $payments = fetch_salary_history($conn, $salaryId);
            $paymentInfo = get_salary_payment_info($salary, $payments, new DateTimeImmutable('today'));

            if (intval($paymentInfo['pending_count']) <= 0) {
                throw new Exception('Ese sueldo no tiene pagos pendientes.', 400);
            }

            $amount = floatval($salary['monto']);
            $insertPayment = $conn->prepare('
                INSERT INTO pagos_sueldos (sueldo_id, monto_pagado)
                VALUES (?, ?)
            ');
            $insertPayment->bind_param('id', $salaryId, $amount);

            if (!$insertPayment->execute()) {
                $insertPayment->close();
                throw new Exception('No se pudo registrar el pago del sueldo.', 500);
            }

            $insertPayment->close();

            $observacion = 'Sueldo: ' . $salary['descripcion'];
            if ($paymentInfo['payment_date']) {
                $observacion .= ' (' . $paymentInfo['payment_date']->format('d/m/Y') . ')';
            }

            $insertMovement = $conn->prepare('
                INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
                VALUES ("compra", NULL, 1, ?, ?)
            ');
            $insertMovement->bind_param('ds', $amount, $observacion);

            if (!$insertMovement->execute()) {
                $insertMovement->close();
                throw new Exception('No se pudo registrar el movimiento de sueldo.', 500);
            }

            $insertMovement->close();

            if ($salary['tipo_pago'] === 'unico') {
                $disableStmt = $conn->prepare('UPDATE sueldos SET activo = 0 WHERE id = ?');
                $disableStmt->bind_param('i', $salaryId);

                if (!$disableStmt->execute()) {
                    $disableStmt->close();
                    throw new Exception('No se pudo desactivar el sueldo único.', 500);
                }

                $disableStmt->close();
            }

            $conn->commit();

            respond_json([
                'ok' => true,
                'sueldo_id' => $salaryId,
                'pagos_pendientes_previos' => intval($paymentInfo['pending_count'])
            ]);
        } catch (Throwable $error) {
            $conn->rollback();
            $status = intval($error->getCode());
            if ($status < 400 || $status > 599) {
                $status = 500;
            }

            respond_json(['error' => $error->getMessage()], $status);
        }
    }

    respond_json(['error' => 'Acción no válida.'], 400);
}

if ($method === 'DELETE') {
    $body = get_json_input();
    $salaryId = intval($body['id'] ?? 0);

    if ($salaryId <= 0) {
        respond_json(['error' => 'ID de sueldo inválido.'], 400);
    }

    $stmt = $conn->prepare('UPDATE sueldos SET activo = 0 WHERE id = ?');
    $stmt->bind_param('i', $salaryId);

    if (!$stmt->execute()) {
        $stmt->close();
        respond_json(['error' => 'No se pudo desactivar el sueldo.'], 500);
    }

    $stmt->close();
    respond_json(['ok' => true]);
}

respond_json(['error' => 'Método no permitido.'], 405);
