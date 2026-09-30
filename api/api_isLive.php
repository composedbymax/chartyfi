<?php
date_default_timezone_set('UTC');
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;
require __DIR__.'/apidata.php';
function out($code, $data) { http_response_code($code); exit(json_encode($data)); }
$in = json_decode((string) file_get_contents('php://input'), true) ?: $_GET;
$symbol = strtoupper(trim((string) ($in['symbol'] ?? '')));
if (!preg_match('/^[A-Z0-9.\-=^&_]{1,40}$/', $symbol)) out(400, ['error' => 'symbol required']);
$now = time();
if (!empty($in['timestamp']) && ($t = strtotime((string) $in['timestamp']))) $now = $t;
$real = time();
$sec = intervalSeconds('1m');
$range = getCachedRange($pdo, $symbol, '1m');
$mx = (int) ($range['mx'] ?? 0);
if (!$mx || $mx < $real - ($real % $sec) - $sec) {
  $p1 = $real - DEFAULT_DAYS['1m'] * 86400;
  storeCandles($pdo, $symbol, '1m', fetchYahoo($symbol, '1m', $mx ? max($p1, $mx - $sec * 5) : $p1, $real));
  $range = getCachedRange($pdo, $symbol, '1m');
  $mx = (int) ($range['mx'] ?? 0);
}
if (!$mx) out(404, ['error' => 'unknown symbol']);
$c = ['last' => $mx, 'delay' => 0];
out(200, ['symbol' => $symbol, 'live' => $c['last'] > 0 && $now - $c['last'] <= 1200 + ($c['delay'] ?? 0), 'lastTradeAt' => $c['last'] ? gmdate('Y-m-d\TH:i:s\Z', $c['last']) : null]);