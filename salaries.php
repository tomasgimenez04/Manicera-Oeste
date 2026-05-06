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

    $date = DateTimeImmutable::createFromFormat('Y-m-d', $value);
    return $date ?: null;
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

function add_salary_interval(DateTimeImmutable $date, $tipo) {
    switch ($tipo) {
        case 'diario':
            return $date->modify('+1 day');
        case 'semanal':
            return $date->modify('+7 day');
        case 'quincenal':
            return $date->modify('+15 day');
        case 'mensual':
            return add_months_keep_day($date, 1);
        case 'unico':
        default:
            return null;
    }
}

function get_salary_period_info(array $salary, DateTimeImmutable $today) {
    $start = parse_date_value($salary['fecha_inicio']);
    $end = parse_date_value($salary['fecha_fin']);
    $tipo = $salary['tipo_pago'];

    if (!$start) {
        return [
            'period_start' => null,
            'period_end' => null,
            'due_date' => null,
            'next_due_date' => null
        ];
    }

    if ($tipo === 'unico') {
        $periodEnd = $end ?: $start;

        return [
            'period_start' => $start,
            'period_end' => $periodEnd,
            'due_date' => $start,
            'next_due_date' => $start
        ];
    }

    $limit = $today;
    if ($end && $end < $limit) {
        $limit = $end;
    }

    if ($start > $limit) {
        $next = add_salary_interval($start, $tipo);
        $periodEnd = $next ? $next->modify('-1 day') : $start;

        return [
            'period_start' => $start,
            'period_end' => $periodEnd,
            'due_date' => $start,
            'next_due_date' => $start
        ];
    }

    $currentDue = $start;
    $nextDue = add_salary_interval($currentDue, $tipo);

    while ($nextDue && $nextDue <= $limit) {
        $currentDue = $nextDue;
        $nextDue = add_salary_interval($currentDue, $tipo);
    }

    $periodEnd = $nextDue ? $nextDue->modify('-1 day') : ($end ?: $currentDue);
    $nextVisibleDue = $nextDue ?: $currentDue;

    if ($end && $nextVisibleDue > $end) {
        $nextVisibleDue = $currentDue;
    }

    return [
        'period_start' => $currentDue,
        'period_end' => $periodEnd,
        'due_date' => $currentDue,
        'next_due_date' => $nextVisibleDue
    ];
}

function payment_in_period(array $payments, ?DateTimeImmutable $periodStart, ?DateTimeImmutable $periodEnd) {
    if (!$periodStart || !$periodEnd || !$payments) {
        return false;
    }

    $startAt = $periodStart->setTime(0, 0, 0);
    $endAt = $periodEnd->setTime(23, 59, 59);

    foreach ($payments as $payment) {
        try {
            $paidAt = new DateTimeImmutable($payment['fecha_pago']);
        } catch (Throwable $error) {
            continue;
        }

        if ($paidAt >= $startAt && $paidAt <= $endAt) {
            return true;
        }
    }

    return false;
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
        $row['monto_pagado'] = floatval($row['monto_pagado']);
        $row['fecha_pago_formateada'] = format_datetime_br($row['fecha_pago']);
        $history[] = $row;
    }

    $stmt->close();
    respond_json($history);
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
        $row['monto'] = floatval($row['monto']);
        $items[] = $row;
        $salaryIds[] = intval($row['id']);
    }

    $paymentsBySalary = [];
    $monthlyPaidCount = 0;
    $monthlyPaidTotal = 0.0;

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
    $monthlyResult = $monthlyStmt->get_result();
    $monthlyRow = $monthlyResult ? $monthlyResult->fetch_assoc() : null;
    $monthlyStmt->close();

    if ($monthlyRow) {
        $monthlyPaidCount = intval($monthlyRow['pagos_mes']);
        $monthlyPaidTotal = floatval($monthlyRow['total_mes']);
    }

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

    $activeItems = [];
    $pendingCount = 0;

    foreach ($items as $salary) {
        $salaryId = intval($salary['id']);
        $payments = isset($paymentsBySalary[$salaryId]) ? $paymentsBySalary[$salaryId] : [];
        $period = get_salary_period_info($salary, $today);
        $paid = payment_in_period($payments, $period['period_start'], $period['period_end']);
        $status = $paid ? 'pagado' : 'pendiente';

        if ($status === 'pendiente') {
            $pendingCount++;
        }

        $salary['pagos_historicos'] = count($payments);
        $salary['estado_periodo'] = $status;
        $salary['proximo_pago'] = $period['next_due_date'] ? $period['next_due_date']->format('d/m/Y') : null;
        $salary['fecha_inicio_formateada'] = format_date_br($salary['fecha_inicio']);
        $salary['fecha_fin_formateada'] = format_date_br($salary['fecha_fin']);
        $activeItems[] = $salary;
    }

    respond_json([
        'items' => $activeItems,
        'resumen' => [
            'pendientes' => $pendingCount,
            'pagados_mes' => $monthlyPaidCount,
            'egresos_mes' => round($monthlyPaidTotal, 2)
        ]
    ]);
}

if ($method === 'POST') {
    $action = isset($_GET['accion']) ? trim($_GET['accion']) : '';
    $body = get_json_input();

    if ($action === 'crear') {
        $descripcion = isset($body['descripcion']) ? trim($body['descripcion']) : '';
        $monto = isset($body['monto']) ? floatval($body['monto']) : 0;
        $tipoPago = isset($body['tipo_pago']) ? trim($body['tipo_pago']) : '';
        $fechaInicio = isset($body['fecha_inicio']) ? trim($body['fecha_inicio']) : '';
        $fechaFin = isset($body['fecha_fin']) ? trim($body['fecha_fin']) : null;

        if ($descripcion === '') {
            respond_json(['error' => 'La descripción es obligatoria.'], 400);
        }

        if ($monto <= 0) {
            respond_json(['error' => 'El monto debe ser mayor a 0.'], 400);
        }

        if (!in_array($tipoPago, SALARY_TYPES, true)) {
            respond_json(['error' => 'El tipo de pago no es válido.'], 400);
        }

        $startDate = parse_date_value($fechaInicio);
        if (!$startDate) {
            respond_json(['error' => 'La fecha de inicio no es válida.'], 400);
        }

        $endDate = null;
        if ($fechaFin !== null && $fechaFin !== '') {
            $endDate = parse_date_value($fechaFin);
            if (!$endDate) {
                respond_json(['error' => 'La fecha de fin no es válida.'], 400);
            }

            if ($endDate < $startDate) {
                respond_json(['error' => 'La fecha de fin no puede ser anterior al inicio.'], 400);
            }
        } else {
            $fechaFin = null;
        }

        $stmt = $conn->prepare('
            INSERT INTO sueldos (descripcion, monto, tipo_pago, fecha_inicio, fecha_fin, activo)
            VALUES (?, ?, ?, ?, ?, 1)
        ');
        $stmt->bind_param('sdsss', $descripcion, $monto, $tipoPago, $fechaInicio, $fechaFin);

        if (!$stmt->execute()) {
            $stmt->close();
            respond_json(['error' => 'No se pudo registrar el sueldo.'], 500);
        }

        $id = $conn->insert_id;
        $stmt->close();

        respond_json([
            'ok' => true,
            'id' => $id
        ]);
    }

    if ($action === 'pagar') {
        $salaryId = isset($body['sueldo_id']) ? intval($body['sueldo_id']) : 0;

        if ($salaryId <= 0) {
            respond_json(['error' => 'Selecciona un sueldo válido.'], 400);
        }

        $stmt = $conn->prepare('
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
        ');
        $stmt->bind_param('i', $salaryId);
        $stmt->execute();
        $result = $stmt->get_result();
        $salary = $result ? $result->fetch_assoc() : null;
        $stmt->close();

        if (!$salary) {
            respond_json(['error' => 'El sueldo no existe o ya fue desactivado.'], 404);
        }

        $today = new DateTimeImmutable('today');
        $period = get_salary_period_info($salary, $today);
        $payments = [];

        $historyStmt = $conn->prepare('
            SELECT id, monto_pagado, fecha_pago
            FROM pagos_sueldos
            WHERE sueldo_id = ?
            ORDER BY fecha_pago DESC, id DESC
        ');
        $historyStmt->bind_param('i', $salaryId);
        $historyStmt->execute();
        $historyResult = $historyStmt->get_result();

        while ($row = $historyResult->fetch_assoc()) {
            $payments[] = $row;
        }

        $historyStmt->close();

        if (payment_in_period($payments, $period['period_start'], $period['period_end'])) {
            respond_json(['error' => 'Ese sueldo ya fue pagado en el período actual.'], 400);
        }

        try {
            $conn->begin_transaction();

            $amount = floatval($salary['monto']);
            $insertPayment = $conn->prepare('
                INSERT INTO pagos_sueldos (sueldo_id, monto_pagado)
                VALUES (?, ?)
            ');
            $insertPayment->bind_param('id', $salaryId, $amount);

            if (!$insertPayment->execute()) {
                throw new Exception('No se pudo registrar el pago del sueldo.');
            }

            $insertPayment->close();

            $observacion = 'Sueldo: ' . $salary['descripcion'];
            $insertMovement = $conn->prepare('
                INSERT INTO movimientos (tipo, producto_id, cantidad, monto, observacion)
                VALUES ("compra", NULL, 1, ?, ?)
            ');
            $insertMovement->bind_param('ds', $amount, $observacion);

            if (!$insertMovement->execute()) {
                throw new Exception('No se pudo registrar el movimiento de sueldo.');
            }

            $insertMovement->close();

            if ($salary['tipo_pago'] === 'unico') {
                $disableStmt = $conn->prepare('UPDATE sueldos SET activo = 0 WHERE id = ?');
                $disableStmt->bind_param('i', $salaryId);

                if (!$disableStmt->execute()) {
                    throw new Exception('No se pudo desactivar el sueldo único.');
                }

                $disableStmt->close();
            }

            $conn->commit();

            respond_json([
                'ok' => true,
                'sueldo_id' => $salaryId
            ]);
        } catch (Throwable $error) {
            $conn->rollback();
            respond_json(['error' => $error->getMessage()], 500);
        }
    }

    respond_json(['error' => 'Acción no válida.'], 400);
}

if ($method === 'DELETE') {
    $body = get_json_input();
    $salaryId = isset($body['id']) ? intval($body['id']) : 0;

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
