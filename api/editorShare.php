<?php
if (!ini_get('zlib.output_compression')) {
    ob_start('ob_gzhandler');
}
header('Content-Type: application/json; charset=utf-8');
$session = dirname(__DIR__) . '/../session.php';
if (file_exists($session)) require $session;
$username = $_SESSION['user'] ?? null;
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) mkdir($dataDir, 0775, true);
function out($ok, $data = [], $code = 200) {
  http_response_code($code);
  echo json_encode(array_merge(['ok' => $ok], $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function clean($v, $max = 5000) {
  $v = trim((string)$v);
  $v = preg_replace("/\r\n?/", "\n", $v);
  if (mb_strlen($v) > $max) $v = mb_substr($v, 0, $max);
  return $v;
}
$action = $_REQUEST['action'] ?? 'list';
if ($action === 'list') {
  $offset = max(0, (int)($_GET['offset'] ?? 0));
  $limit = max(1, min(24, (int)($_GET['limit'] ?? 4)));
  $items = [];
  foreach (glob($dataDir . '/*.json') as $file) {
    $raw = @file_get_contents($file);
    if ($raw === false) continue;
    $item = json_decode($raw, true);
    if (!is_array($item)) continue;
    $id = basename($file, '.json');
    $item['id'] = $id;
    $item['img'] = 'api/data/' . $id . '.jpg';
    unset($item['createdAt'], $item['updatedAt'], $item['code']);
    $items[] = $item;
  }
  usort($items, function($a, $b) {
    return strcmp($b['id'], $a['id']);
  });
  $items = array_slice($items, $offset, $limit);
  out(true, ['items' => $items]);
}
if ($action === 'item') {
  $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['id'] ?? '');
  if ($id === '') out(false, ['error' => 'Missing id'], 400);
  $file = $dataDir . '/' . $id . '.json';
  if (!is_file($file)) out(false, ['error' => 'Not found'], 404);
  $item = json_decode(file_get_contents($file), true);
  if (!is_array($item)) out(false, ['error' => 'Corrupt item'], 500);
  $item['id'] = $id;
  $includeImg = filter_var($_GET['includeImg'] ?? '1', FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
  if ($includeImg === null) $includeImg = true;
  if ($includeImg) {
    $item['img'] = 'api/data/' . $id . '.jpg';
  } else {
    unset($item['img']);
  }
  unset($item['createdAt'], $item['updatedAt']);
  out(true, ['item' => $item]);
}
if ($action === 'save') {
  if (!$username) out(false, ['error' => 'Login required'], 401);
  $name = clean($_POST['name'] ?? 'Untitled', 120);
  $description = clean($_POST['description'] ?? '', 1000);
  $code = clean($_POST['code'] ?? '', 500000);
  $isDark = (($_POST['isDark'] ?? '') === 'yes') ? 'yes' : 'no';
  if ($code === '') out(false, ['error' => 'Missing code'], 400);
  if (empty($_FILES['image']['tmp_name'])) out(false, ['error' => 'Missing screenshot'], 400);
  $nameLower = mb_strtolower($name);
  foreach (glob($dataDir . '/*.json') as $f) {
    $ex = json_decode(@file_get_contents($f), true);
    if (is_array($ex) && mb_strtolower($ex['name'] ?? '') === $nameLower) {
      out(false, ['error' => 'Name already taken'], 409);
    }
  }
  $id = bin2hex(random_bytes(8));
  $jsonFile = $dataDir . '/' . $id . '.json';
  $imgFile = $dataDir . '/' . $id . '.jpg';
  $tmp = $_FILES['image']['tmp_name'];
  if (!is_uploaded_file($tmp)) out(false, ['error' => 'Invalid upload'], 400);
  if (!move_uploaded_file($tmp, $imgFile)) out(false, ['error' => 'Failed to save image'], 500);
  $item = [
    'id'          => $id,
    'name'        => $name,
    'description' => $description,
    'code'        => $code,
    'isDark'      => $isDark,
    'img'         => 'api/data/' . $id . '.jpg',
    'author'      => $username ?? 'unknown'
  ];
  if (file_put_contents($jsonFile, json_encode($item, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) {
    out(false, ['error' => 'Failed to save entry'], 500);
  }
  out(true, ['item' => $item], 201);
}
out(false, ['error' => 'Unknown action'], 400);