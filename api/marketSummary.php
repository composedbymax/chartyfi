<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}
$cacheFile = __DIR__ . '/data/cache/market_summary.json';
$cacheTtl  = 3600;
$now       = time();
if (file_exists($cacheFile)) {
    $cached = json_decode(file_get_contents($cacheFile), true);
    if ($cached && isset($cached['fetched_at']) && ($now - $cached['fetched_at']) < $cacheTtl) {
        echo json_encode([
            'data'       => $cached['data'],
            'fetched_at' => $cached['fetched_at'],
            'expires_at' => $cached['fetched_at'] + $cacheTtl,
        ]);
        exit;
    }
}
$url = 'https://query1.finance.yahoo.com/v6/finance/quote/marketSummary';
$ch  = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => [
        'User-Agent: Mozilla/5.0 (compatible; MarketSummary/1.0)',
        'Accept: application/json',
    ],
]);
$raw  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
if (!$raw || $code !== 200) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch market data']);
    exit;
}
$parsed = json_decode($raw, true);
$result = $parsed['marketSummaryResponse']['result'] ?? null;
if (!$result) {
    http_response_code(502);
    echo json_encode(['error' => 'Invalid market data response']);
    exit;
}
$fetchedAt = $now;
if (!is_dir(__DIR__ . '/cache')) mkdir(__DIR__ . '/cache', 0755, true);
file_put_contents($cacheFile, json_encode(['data' => $result, 'fetched_at' => $fetchedAt]));
echo json_encode([
    'data'       => $result,
    'fetched_at' => $fetchedAt,
    'expires_at' => $fetchedAt + $cacheTtl,
]);