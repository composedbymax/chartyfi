<?php
header('Content-Type: application/json');
header('Cache-Control: no-store');
$INDICES = [
    'nasdaq100' => 'https://yfiua.github.io/index-constituents/constituents-nasdaq100.json',
    'sp500'     => 'https://yfiua.github.io/index-constituents/constituents-sp500.json',
    'dowjones'  => 'https://yfiua.github.io/index-constituents/constituents-dowjones.json',
    'dax'       => 'https://yfiua.github.io/index-constituents/constituents-dax.json',
    'hsi'       => 'https://yfiua.github.io/index-constituents/constituents-hsi.json',
    'ftse100'   => 'https://yfiua.github.io/index-constituents/constituents-ftse100.json',
    'ftsemib'   => 'https://yfiua.github.io/index-constituents/constituents-ftsemib.json',
];
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$index = $body['index'] ?? null;
if (!isset($INDICES[$index])) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown index']);
    exit;
}
$cacheDir = __DIR__ . '/cache/indexConstituents';
$cacheFile = $cacheDir . '/' . $index . '.json';
$today = gmdate('Y-m-d');
if (file_exists($cacheFile)) {
    $cached = json_decode(file_get_contents($cacheFile), true);
    if (($cached['date'] ?? '') === $today) {
        echo json_encode($cached, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }
    unlink($cacheFile);
}
$ctx = stream_context_create(['http' => ['timeout' => 8, 'header' => "User-Agent: Mozilla/5.0\r\n"]]);
$raw = @file_get_contents($INDICES[$index], false, $ctx);
if ($raw === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch index constituents']);
    exit;
}
$symbols = json_decode($raw, true);
if ($symbols === null) {
    http_response_code(502);
    echo json_encode(['error' => 'Invalid data from source']);
    exit;
}
foreach ($symbols as &$s) {
    $s['Symbol'] = str_replace('/.', '.', $s['Symbol']);
}
unset($s);
if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);
$out = ['date' => $today, 'symbols' => $symbols];
file_put_contents($cacheFile, json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);