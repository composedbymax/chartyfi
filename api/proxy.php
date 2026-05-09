<?php
$ALLOWED_HOSTS = [];
$TIMEOUT = 15;
$MAX_BYTES = 8 * 1024 * 1024;
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');
function die_err(string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['error' => $msg]);
    exit;
}
$raw = $_GET['url'] ?? '';
if (!$raw) die_err('Missing ?url= parameter');
$url = filter_var($raw, FILTER_VALIDATE_URL);
if (!$url) die_err('Invalid URL');
$scheme = strtolower(parse_url($url, PHP_URL_SCHEME) ?? '');
if (!in_array($scheme, ['http', 'https'], true)) die_err('Only http/https allowed');
$host = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
if (!$host) die_err('Could not parse host');
if ($ALLOWED_HOSTS && !in_array($host, $ALLOWED_HOSTS, true)) {
    $allowed = false;
    foreach ($ALLOWED_HOSTS as $ah) {
        if ($host === $ah || str_ends_with($host, '.' . $ah)) { $allowed = true; break; }
    }
    if (!$allowed) die_err("Host not allowed: $host", 403);
}
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => $TIMEOUT,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; proxy/1.0)',
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    CURLOPT_ENCODING       => '',
]);
$body    = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err     = curl_error($ch);
curl_close($ch);
if ($err) die_err("cURL error: $err", 502);
if ($body === false) die_err('Empty response from upstream', 502);
if (strlen($body) > $MAX_BYTES) die_err('Response too large', 502);
if ($httpCode >= 400) {
    http_response_code($httpCode);
    echo $body;
    exit;
}
echo $body;