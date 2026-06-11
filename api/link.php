<?php
session_start();

header('Content-Type: application/json');
header('Cache-Control: no-store');

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