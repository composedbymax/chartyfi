<?php
if (!ini_get('zlib.output_compression')) {
    ob_start('ob_gzhandler');
}
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }
$key = include __DIR__ . '/data/key.php';
$apiKey = $key['openrouter_api_key'] ?? null;
if (!$apiKey) { echo json_encode(['error' => 'API key not keyured']); exit; }
$raw = file_get_contents('php://input');
$input = json_decode($raw, true) ?? [];
$action = $_GET['action'] ?? $input['action'] ?? null;
switch ($action) {
    case 'init': handleInit(); break;
    case 'chat': handleChat($apiKey, $input); break;
    default: echo json_encode(['error' => 'Invalid action']); break;
}
function handleInit() {
    $result = getModels();
    echo json_encode(['models' => $result['models'], 'cache' => $result['cache']]);
}
function handleChat($apiKey, $input) {
    $model = $input['model'] ?? null;
    $msgs = $input['messages'] ?? [];
    if (!$model) { echo json_encode(['error' => 'No model selected']); exit; }
    if (!$msgs) { echo json_encode(['error' => 'No messages provided']); exit; }
    $instructFile = __DIR__ . '/data/instruct.txt';
    $sys = file_exists($instructFile) ? trim(file_get_contents($instructFile)) : '';
    if (!empty($input['customInstructions'])) {
        $sys .= "\n\nUser custom instructions:\n" . trim($input['customInstructions']);
    }
    if (!empty($input['currentCode'])) {
        $sys .= "\n\nCurrent code in editor:\n```js\n" . trim($input['currentCode']) . "\n```\nThe user may be asking you to revise or extend this code.";
    }
    $apiMsgs = [];
    if ($sys) $apiMsgs[] = ['role' => 'system', 'content' => $sys];
    foreach ($msgs as $m) {
        $apiMsgs[] = ['role' => $m['role'] === 'user' ? 'user' : 'assistant', 'content' => $m['content']];
    }
    $post = json_encode(['model' => $model, 'messages' => $apiMsgs, 'max_tokens' => 4000]);
    $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
        CURLOPT_TIMEOUT => 90,
        CURLOPT_FAILONERROR => false,
    ]);
    $res = curl_exec($ch);
    $curlErr = curl_errno($ch) ? curl_error($ch) : null;
    curl_close($ch);
    if ($res === false) { echo json_encode(['error' => $curlErr ?? 'Request failed']); exit; }
    $data = json_decode($res, true);
    if (!$data) { echo json_encode(['error' => 'Invalid API response']); exit; }
    if (isset($data['error'])) {
        $msg = $data['error']['message'] ?? 'API error';
        $code = $data['error']['code'] ?? null;
        if ($code === 429 || stripos($msg, 'rate limit') !== false) {
            echo json_encode(['error' => 'Rate limit reached. Please wait before sending more messages.']);
            exit;
        }
        echo json_encode(['error' => $msg]);
        exit;
    }
    $reply = $data['choices'][0]['message']['content'] ?? null;
    if ($reply === null) { echo json_encode(['error' => 'No reply in response']); exit; }
    echo json_encode(['reply' => $reply]);
}
function getModels() {
    $cache = __DIR__ . '/data/models_cache.json';
    $ttl = 48 * 3600;
    $raw = null;
    if (file_exists($cache) && (time() - filemtime($cache)) < $ttl) {
        $raw = file_get_contents($cache);
    } else {
        $ch = curl_init('https://openrouter.ai/api/frontend/models/find');
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_USERAGENT => 'PHP/1.0', CURLOPT_SSL_VERIFYPEER => true]);
        $resp = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($resp && $code === 200) { file_put_contents($cache, $resp, LOCK_EX); $raw = $resp; }
        elseif (file_exists($cache)) { $raw = file_get_contents($cache); }
        else { return ['models' => [], 'cache' => false]; }
    }
    $decoded = json_decode($raw, true);
    $models = [];
    foreach ($decoded['data']['models'] ?? [] as $m) {
        if (!modelIsFree($m)) continue;
        $id = getModelId($m);
        if (!$id) continue;
        $name = getModelName($m);
        if (stripos($id, 'embed') !== false || stripos($name, 'embed') !== false) continue;
        $provider = $m['endpoint']['provider_display_name'] ?? $m['provider_display_name'] ?? $m['provider'] ?? 'Unknown';
        $models[] = ['llm_name' => "$provider — $name (free)", 'provider_id' => $id];
    }
    return ['models' => $models, 'cache' => true];
}
function modelIsFree($m) {
    if (!empty($m['is_free'])) return true;
    if (!empty($m['endpoint']['is_free'])) return true;
    if (isset($m['endpoint']['variant']) && strtolower($m['endpoint']['variant']) === 'free') return true;
    if (!empty($m['provider_model_id']) && preg_match('/:free$/i', $m['provider_model_id'])) return true;
    return false;
}
function getModelName($m) {
    return $m['display_name'] ?? $m['name'] ?? $m['endpoint']['model']['name'] ?? $m['slug'] ?? 'Unnamed';
}
function getModelId($m) {
    if (!empty($m['endpoint']['model_variant_slug'])) return $m['endpoint']['model_variant_slug'];
    $slug = $m['slug'] ?? $m['endpoint']['model']['slug'] ?? null;
    if (!$slug) return null;
    if (!preg_match('/:free$/i', $slug)) $slug .= ':free';
    return $slug;
}