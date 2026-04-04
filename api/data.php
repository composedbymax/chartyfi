<?php
$host='localhost';$dbname='intraday';$dbuser='root';$dbpass='root';
define('CRYPT_KEY','hwihfiwhfihZdih29h9qhd29hnd0jhsh');
define('YAHOO_BASE','https://query2.finance.yahoo.com');
define('CYCLES_BASE','https://api.cycle.tools/api/Stream/SubmitStreamData');
define('ALLOWED_INTERVALS',['1m','2m','5m','15m','30m','1h','4h','1d','1wk','1mo','3mo']);
define('DEFAULT_DAYS',['1m'=>8,'2m'=>60,'5m'=>60,'15m'=>60,'30m'=>60,'1h'=>730,'4h'=>730,'1d'=>1825,'1wk'=>3650,'1mo'=>3650,'3mo'=>3650]);
try {
  $pdo=new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4",$dbuser,$dbpass,[
    PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC
  ]);
} catch(PDOException $e) {
  http_response_code(500);die(json_encode(['error'=>'DB: '.$e->getMessage()]));
}
$pdo->exec("CREATE TABLE IF NOT EXISTS asset_prices(
  symbol VARCHAR(20) NOT NULL,`interval` VARCHAR(5) NOT NULL,`timestamp` INT UNSIGNED NOT NULL,
  open DOUBLE NOT NULL,high DOUBLE NOT NULL,low DOUBLE NOT NULL,close DOUBLE NOT NULL,
  volume BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY(symbol,`interval`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$pdo->exec("CREATE TABLE IF NOT EXISTS tracked_assets(
  user VARCHAR(100) NOT NULL,symbol VARCHAR(20) NOT NULL,`interval` VARCHAR(5) NOT NULL,
  auto_update_enabled TINYINT(1) NOT NULL DEFAULT 1,last_updated DATETIME NULL,
  PRIMARY KEY(user,symbol,`interval`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$pdo->exec("CREATE TABLE IF NOT EXISTS cycle_streams(
  id INT AUTO_INCREMENT PRIMARY KEY,
  user VARCHAR(100) NOT NULL,encrypted_api_key TEXT,stream_id VARCHAR(100) NOT NULL,
  symbol VARCHAR(20) NOT NULL,`interval` VARCHAR(5) NOT NULL,
  field VARCHAR(10) NOT NULL DEFAULT 'close',enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_sent_timestamp INT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$pdo->exec("CREATE TABLE IF NOT EXISTS settings(
  `key` VARCHAR(50) PRIMARY KEY,`value` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
function yahooGet($url) {
  $ctx=stream_context_create(['http'=>[
    'header'=>"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nAccept: application/json\r\n",
    'timeout'=>20,'ignore_errors'=>true
  ]]);
  return @file_get_contents($url,false,$ctx);
}
function fetchYahoo($symbol,$interval,$p1,$p2) {
  $url=YAHOO_BASE."/v8/finance/chart/".urlencode($symbol)."?interval=".urlencode($interval)."&period1=$p1&period2=$p2";
  $raw=yahooGet($url);
  if(!$raw) return [];
  $d=json_decode($raw,true);
  $r=$d['chart']['result'][0]??null;
  if(!$r||empty($r['timestamp'])) return [];
  $ts=$r['timestamp'];$q=$r['indicators']['quote'][0]??[];
  $out=[];
  foreach($ts as $i=>$t) {
    $o=$q['open'][$i]??null;$c=$q['close'][$i]??null;
    if($o===null||$c===null) continue;
    $out[]=['time'=>(int)$t,'open'=>(float)$o,'high'=>(float)($q['high'][$i]??$o),
      'low'=>(float)($q['low'][$i]??$o),'close'=>(float)$c,'volume'=>(int)($q['volume'][$i]??0)];
  }
  return $out;
}
function storeCandles($pdo,$symbol,$interval,$candles) {
  if(!$candles) return 0;
  $s=$pdo->prepare("INSERT IGNORE INTO asset_prices(symbol,`interval`,`timestamp`,open,high,low,close,volume)VALUES(?,?,?,?,?,?,?,?)");
  $pdo->beginTransaction();
  foreach($candles as $c) $s->execute([$symbol,$interval,$c['time'],$c['open'],$c['high'],$c['low'],$c['close'],$c['volume']]);
  $pdo->commit();
  return count($candles);
}
function getCachedRange($pdo,$symbol,$interval) {
  $s=$pdo->prepare("SELECT MIN(`timestamp`) mn,MAX(`timestamp`) mx FROM asset_prices WHERE symbol=? AND `interval`=?");
  $s->execute([$symbol,$interval]);
  return $s->fetch();
}
function getCachedCandles($pdo,$symbol,$interval,$p1,$p2) {
  $s=$pdo->prepare("SELECT `timestamp` as time,open,high,low,close,volume FROM asset_prices WHERE symbol=? AND `interval`=? AND `timestamp` BETWEEN ? AND ? ORDER BY `timestamp`");
  $s->execute([$symbol,$interval,$p1,$p2]);
  return $s->fetchAll();
}
function encryptKey($plain) {
  $iv=random_bytes(16);
  $enc=openssl_encrypt($plain,'AES-256-CBC',CRYPT_KEY,0,base64_encode($iv));
  return base64_encode($iv).'|'.$enc;
}
function decryptKey($stored) {
  [$iv,$data]=array_pad(explode('|',$stored,2),2,'');
  return openssl_decrypt($data,'AES-256-CBC',CRYPT_KEY,0,$iv);
}
function pushToCycles($apiKey,$streamId,$dates,$values) {
  $body=json_encode(['streamid'=>$streamId,'messagetype'=>'UPSERT','dates'=>$dates,'values'=>$values]);
  $url=CYCLES_BASE.'?api_key='.urlencode($apiKey);
  $ctx=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\nContent-Length: ".strlen($body)."\r\n",'content'=>$body,'timeout'=>20,'ignore_errors'=>true]]);
  return @file_get_contents($url,false,$ctx);
}
function setSetting($pdo,$key,$val) {
  $pdo->prepare("INSERT INTO settings(`key`,`value`)VALUES(?,?)ON DUPLICATE KEY UPDATE `value`=?")->execute([$key,$val,$val]);
}
function getSetting($pdo,$key,$default=null) {
  try {
    $v=$pdo->prepare("SELECT `value` FROM settings WHERE `key`=?");
    $v->execute([$key]);
    $r=$v->fetchColumn();
    return $r!==false?$r:$default;
  } catch(Exception $e) {return $default;}
}