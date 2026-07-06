<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');
if (!ini_get('zlib.output_compression')) {ob_start('ob_gzhandler');}
header("Cross-Origin-Opener-Policy: same-origin");
header("X-Frame-Options: DENY");
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none';");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit; }
$body = json_decode(file_get_contents('php://input'), true);
$symbol = isset($body['symbol']) ? strtoupper(trim($body['symbol'])) : '';
if (!$symbol || !preg_match('/^[A-Z0-9.\-=^]{1,20}$/', $symbol)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid symbol']);
    exit;
}
$cacheDir = __DIR__ . '/data/insights';
if (!is_dir($cacheDir)) { mkdir($cacheDir, 0755, true); }
$cacheFile = $cacheDir . '/' . preg_replace('/[^A-Z0-9.\-]/', '_', $symbol) . '.json';
$cacheTTL = 86400;
$now = time();
if (file_exists($cacheFile)) {
    $cached = json_decode(file_get_contents($cacheFile), true);
    if ($cached && isset($cached['cachedAt']) && ($now - $cached['cachedAt']) < $cacheTTL) {
        echo json_encode($cached);
        exit;
    }
}
$url = 'https://query2.finance.yahoo.com/ws/insights/v1/finance/insights?symbol=' . urlencode($symbol);
$ctx = stream_context_create(['http' => [
    'timeout' => 10,
    'header' => "User-Agent: Mozilla/5.0\r\nAccept: application/json\r\n"
]]);
$raw = @file_get_contents($url, false, $ctx);
if ($raw === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch data']);
    exit;
}
$data = json_decode($raw, true);
if (!$data || !isset($data['finance']['result'])) {
    echo json_encode(['cachedAt' => $now, 'unsupported' => true]);
    exit;
}
$result = $data['finance']['result'];
$info = $result['instrumentInfo'] ?? [];
$reports = $result['reports'] ?? [];
$hasInstrumentData = false;
foreach ($info as $section) {
    if (!is_array($section)) continue;
    foreach ($section as $k => $v) {
        if ($k === 'provider') continue;
        if ($v !== null && $v !== '' && $v !== 'NONE') { $hasInstrumentData = true; break 2; }
    }
}
if (!$hasInstrumentData && empty($reports)) {
    $payload = ['cachedAt' => $now, 'unsupported' => true];
    file_put_contents($cacheFile, json_encode($payload));
    echo json_encode($payload);
    exit;
}
$payload = ['cachedAt' => $now, 'result' => $result];
file_put_contents($cacheFile, json_encode($payload));
echo json_encode($payload);