<?php
header('Content-Type: application/json');
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}
$action  = $body['action']  ?? '';
$apiKey  = $body['api_key'] ?? '';
$params  = isset($body['params']) && is_array($body['params']) ? $body['params'] : [];
$payload = $body['payload'] ?? null;
if (!$apiKey) {
    http_response_code(400);
    echo json_encode(['error' => 'No API key set. Please configure one in Settings.']);
    exit;
}
$base = 'https://api.cycle.tools';
switch ($action) {
    case 'scan':
        $path = '/api/cycles/CycleScanner';
        if (!is_array($payload) || count($payload) < 100) {
            http_response_code(400);
            echo json_encode(['error' => 'At least 100 data points are required to run a scan']);
            exit;
        }
        break;
    case 'peaks':
        $path = '/api/cycles/CycleSpectrumPeakFinder';
        if (!is_array($payload) || !isset($payload['spectrum'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid payload for peak finder']);
            exit;
        }
        break;
    case 'consensus':
        $path = '/api/CycleConsensus/calculate';
        if (!is_array($payload) || count($payload) < 100) {
            http_response_code(400);
            echo json_encode(['error' => 'At least 100 data points are required for consensus']);
            exit;
        }
        $payload = array_merge(['datapoints' => $payload], $params);
        $params  = [];
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        exit;
}
$query = $params;
foreach ($query as $k => $v) {
    if (is_bool($v)) $query[$k] = $v ? 'true' : 'false';
}
$query['api_key'] = $apiKey;
$url = $base . $path . '?' . http_build_query($query);
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($payload),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
]);
$response = curl_exec($ch);
$status   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);
if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Upstream request failed: ' . $curlErr]);
    exit;
}
http_response_code($status ?: 200);
echo $response;