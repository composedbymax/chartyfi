<?php
if (!ini_get('zlib.output_compression')) {ob_start('ob_gzhandler');}
header('Content-Type: application/json');
header("Cross-Origin-Opener-Policy: same-origin");
header("X-Frame-Options: DENY");
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none';");
$dir=__DIR__.'/data/cache/';
$file=$dir.'screener.json';
$today=gmdate('Y-m-d');
if (file_exists($file)) {
    $cached=json_decode(file_get_contents($file), true);
    if (is_array($cached) && ($cached['_d'] ?? '')===$today) {
        unset($cached['_d']);
        echo json_encode($cached);
        exit;
    }
    @unlink($file);
}
$base='https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved';
$fields=implode(',', [
    'symbol',
    'shortName',
    'displayName',
    'longName',
    'regularMarketPrice',
    'regularMarketVolume',
    'regularMarketChange',
    'regularMarketChangePercent'
]);
$ids=[
    'gainers'=>'day_gainers',
    'losers'=>'day_losers',
    'actives'=>'most_actives'
];
$buildUrl=function($scrId) use ($base, $fields) {
    $query=http_build_query([
        'formatted'=>'false',
        'scrIds'=>$scrId,
        'count'=>100,
        'fields'=>$fields
    ], '', '&', PHP_QUERY_RFC3986);
    return $base.'?'.str_replace('%2C', ',', $query);
};
$mh=curl_multi_init();
$chs=[];
foreach ($ids as $key=>$scrId) {
    $ch=curl_init($buildUrl($scrId));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_HTTPHEADER=>['User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'],
        CURLOPT_TIMEOUT=>15,
        CURLOPT_SSL_VERIFYPEER=>false,
        CURLOPT_FOLLOWLOCATION=>true,
    ]);
    curl_multi_add_handle($mh, $ch);
    $chs[$key]=$ch;
}
$running=null;
do {
    curl_multi_exec($mh, $running);
    if ($running) curl_multi_select($mh);
} while ($running);
$out=[];
$ok=true;
foreach ($chs as $key=>$ch) {
    $data=json_decode(curl_multi_getcontent($ch), true);
    $quotes=$data['finance']['result'][0]['quotes'] ?? null;
    if ($quotes===null) $ok=false;
    $out[$key]=$quotes ?? [];
    curl_multi_remove_handle($mh, $ch);
    curl_close($ch);
}
curl_multi_close($mh);
if ($ok) {
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($file, json_encode(array_merge(['_d'=>$today], $out)), LOCK_EX);
}
echo json_encode($out);