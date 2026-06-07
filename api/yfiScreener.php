<?php
header('Content-Type: application/json');
$dir = __DIR__ . '/cache/';
$file = $dir . 'screener.json';
$today = gmdate('Y-m-d');
if (file_exists($file)) {
    $cached = json_decode(file_get_contents($file), true);
    if (is_array($cached) && ($cached['_d'] ?? '') === $today) {
        unset($cached['_d']);
        echo json_encode($cached);
        exit;
    }
    @unlink($file);
}
$urls = [
    'gainers' => 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=day_gainers&count=100',
    'losers'  => 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=day_losers&count=100',
    'actives' => 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=most_actives&count=100',
];
$mh = curl_multi_init();
$chs = [];
foreach ($urls as $key => $url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'],
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    curl_multi_add_handle($mh, $ch);
    $chs[$key] = $ch;
}
$running = null;
do {
    curl_multi_exec($mh, $running);
    if ($running) curl_multi_select($mh);
} while ($running);
$out = [];
$ok = true;
foreach ($chs as $key => $ch) {
    $data = json_decode(curl_multi_getcontent($ch), true);
    $quotes = $data['finance']['result'][0]['quotes'] ?? null;
    if ($quotes === null) $ok = false;
    $clean = [];
    foreach (($quotes ?? []) as $q) {
        $clean[] = [
            'symbol' => $q['symbol'] ?? '',
            'shortName' => $q['shortName']
                ?? $q['displayName']
                ?? $q['longName']
                ?? '',
            'regularMarketPrice' => $q['regularMarketPrice'] ?? null,
            'regularMarketVolume' => $q['regularMarketVolume'] ?? null,
            'regularMarketChange' => $q['regularMarketChange'] ?? null,
            'regularMarketChangePercent' => $q['regularMarketChangePercent'] ?? null,
        ];
    }
    $out[$key] = $clean;
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
}
curl_multi_close($mh);
if ($ok) {
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($file, json_encode(array_merge(['_d' => $today], $out)), LOCK_EX);
}
echo json_encode($out);