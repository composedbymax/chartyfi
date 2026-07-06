<?php
$session=dirname(__DIR__).'/../session.php';
if(file_exists($session)) require $session;
if (!ini_get('zlib.output_compression')) {ob_start('ob_gzhandler');}
header('Content-Type: application/json');
header('Cache-Control: no-store');
header("Cross-Origin-Opener-Policy: same-origin");
header("X-Frame-Options: DENY");
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none';");
$user = $_SESSION['user'] ?? null;
$isLoggedIn = $user !== null;
$raw = file_get_contents(__DIR__ . '/data/api.json');
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not load API config']);
    exit;
}
$all = json_decode($raw, true);
if ($all === null) {
    http_response_code(500);
    echo json_encode(['error' => 'Invalid API config']);
    exit;
}
$out = [];
foreach ($all as $key => $entry) {
    $requiresAuth = $entry['auth'] ?? false;
    if (!$requiresAuth || $isLoggedIn) {
        $out[$key] = ['api' => $entry['api']];
    }
}
echo json_encode($out);