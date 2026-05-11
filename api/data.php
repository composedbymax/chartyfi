<?php
$config = require __DIR__ . '/data/config.php';
$host   = $config['host'];
$dbname = $config['dbname'];
$dbuser = $config['dbuser'];
$dbpass = $config['dbpass'];
define('CRYPT_KEY', $config['crypt_key']);
define('YAHOO_BASE','https://query2.finance.yahoo.com');
define('CYCLES_BASE','https://api.cycle.tools/api/Stream/SubmitStreamData');
define('ALLOWED_INTERVALS',['1m','2m','5m','15m','30m','1h','4h','1d','1wk','1mo','3mo']);
define('DEFAULT_DAYS',['1m'=>8,'2m'=>60,'5m'=>60,'15m'=>60,'30m'=>60,'1h'=>730,'4h'=>730,'1d'=>1825,'1wk'=>3650,'1mo'=>3650,'3mo'=>3650]);
try{$pdo=new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4",$dbuser,$dbpass,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);}catch(PDOException $e){http_response_code(500);die(json_encode(['error'=>'DB: '.$e->getMessage()]));}
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
  last_sent_timestamp INT UNSIGNED NULL,
  stream_timezone VARCHAR(60) NOT NULL DEFAULT 'UTC'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$pdo->exec("CREATE TABLE IF NOT EXISTS settings(
  `key` VARCHAR(50) PRIMARY KEY,`value` TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
function yahooGet($url){
  $ctx=stream_context_create(['http'=>['header'=>"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\nAccept: application/json\r\n",'timeout'=>20,'ignore_errors'=>true]]);
  return @file_get_contents($url,false,$ctx);
}
function intervalSeconds($interval){
  $map=['1m'=>60,'2m'=>120,'5m'=>300,'15m'=>900,'30m'=>1800,'1h'=>3600,'4h'=>14400,'1d'=>86400,'1wk'=>604800,'1mo'=>2592000,'3mo'=>7776000];
  return $map[$interval]??0;
}
function snapTimestamp($ts,$interval){
  $sec=intervalSeconds($interval);
  if($sec<=0)return (int)$ts;
  return (int)($ts-($ts%$sec));
}
function fetchYahoo($symbol, $interval, $p1, $p2, $isRetry = false) {
    $url = YAHOO_BASE . "/v8/finance/chart/" . urlencode($symbol)
         . "?interval=" . urlencode($interval) . "&period1=$p1&period2=$p2";
    $raw = yahooGet($url);
    if (!$raw) return [];
    $d = json_decode($raw, true);
    if (!$isRetry && isset($d['chart']['error']['code'])) {
        $errCode = $d['chart']['error']['code'];
        $errDesc = $d['chart']['error']['description'] ?? '';
        if ($errCode === 'Unprocessable Entity' && str_contains($errDesc, 'within the last')) {
            preg_match('/last (\d+) days?/', $errDesc, $m);
            $maxDays = isset($m[1]) ? (int)$m[1] : 60;
            $clampedP1 = max($p1, time() - ($maxDays - 1) * 86400);
            if ($clampedP1 >= $p2) return []; // nothing to fetch
            return fetchYahoo($symbol, $interval, $clampedP1, $p2, true);
        }
        return [];
    }
    $r = $d['chart']['result'][0] ?? null;
    if (!$r || empty($r['timestamp'])) return [];
    $ts = $r['timestamp'];
    $q  = $r['indicators']['quote'][0] ?? [];
    $sec = intervalSeconds($interval);
    $currentPeriodStart = $sec > 0 ? (int)(time() - (time() % $sec)) : PHP_INT_MAX;
    $buckets = [];
    foreach ($ts as $i => $t) {
        $o = $q['open'][$i]  ?? null;
        $c = $q['close'][$i] ?? null;
        if ($o === null || $c === null) continue;
        $snapped = snapTimestamp((int)$t, $interval);
        if ($sec > 0 && $snapped >= $currentPeriodStart) continue;
        $h = (float)($q['high'][$i]   ?? $o);
        $l = (float)($q['low'][$i]    ?? $o);
        $v = (int)($q['volume'][$i]   ?? 0);
        if (!isset($buckets[$snapped]))
            $buckets[$snapped] = ['time'=>$snapped,'open'=>(float)$o,'high'=>$h,'low'=>$l,'close'=>(float)$c,'volume'=>$v];
        else {
            $buckets[$snapped]['high']   = max($buckets[$snapped]['high'], $h);
            $buckets[$snapped]['low']    = min($buckets[$snapped]['low'],  $l);
            $buckets[$snapped]['close']  = (float)$c;
            $buckets[$snapped]['volume'] += $v;
        }
    }
    ksort($buckets);
    return array_values($buckets);
}
function storeCandles($pdo,$symbol,$interval,$candles){
  if(!$candles)return 0;
  $s=$pdo->prepare("INSERT INTO asset_prices(symbol,`interval`,`timestamp`,open,high,low,close,volume)VALUES(?,?,?,?,?,?,?,?)ON DUPLICATE KEY UPDATE open=VALUES(open),high=VALUES(high),low=VALUES(low),close=VALUES(close),volume=VALUES(volume)");
  try{
    $pdo->beginTransaction();
    foreach($candles as $c)$s->execute([
      $symbol,$interval,$c['time'],
      round($c['open'],  2),
      round($c['high'],  2),
      round($c['low'],   2),
      round($c['close'], 2),
      round($c['volume'], 4),
    ]);
    $pdo->commit();
  }catch(Throwable $e){
    if($pdo->inTransaction())$pdo->rollBack();
    throw $e;
  }
  return count($candles);
}
function getCachedRange($pdo,$symbol,$interval){
  $s=$pdo->prepare("SELECT MIN(`timestamp`) mn,MAX(`timestamp`) mx FROM asset_prices WHERE symbol=? AND `interval`=?");
  $s->execute([$symbol,$interval]);
  return $s->fetch();
}
function getCachedCandles($pdo,$symbol,$interval,$p1,$p2){
  $s=$pdo->prepare("SELECT `timestamp` as time,open,high,low,close,volume FROM asset_prices WHERE symbol=? AND `interval`=? AND `timestamp` BETWEEN ? AND ? ORDER BY `timestamp`");
  $s->execute([$symbol,$interval,$p1,$p2]);
  $out=$s->fetchAll();
  foreach($out as &$c){
    $c['time']=(int)$c['time'];$c['open']=(float)$c['open'];$c['high']=(float)$c['high'];$c['low']=(float)$c['low'];$c['close']=(float)$c['close'];$c['volume']=(int)$c['volume'];
  }
  return $out;
}
function resolveRangeCandles($pdo,$symbol,$interval,$p1,$p2,$forceRemote=false){
  $cached=getCachedCandles($pdo,$symbol,$interval,$p1,$p2);
  if(!$forceRemote&&$cached)return $cached;
  $fetched=fetchYahoo($symbol,$interval,$p1,$p2);
  if($fetched)storeCandles($pdo,$symbol,$interval,$fetched);
  return getCachedCandles($pdo,$symbol,$interval,$p1,$p2);
}
function loadHistoricalBars($pdo,$symbol,$interval,$bars,$direction,$anchor){
  $bars=max(0,(int)$bars);
  $sec=intervalSeconds($interval);
  if($bars<=0||$sec<=0)return [[],false];
  $anchor=$anchor>0?$anchor:time();
  $cursor=$anchor;
  $result=[];
  $endReached=false;
  for($i=0;$i<32&&count($result)<$bars;$i++){
    $need=$bars-count($result);
    $spanBars=max(100,min(4000,$need*4));
    $span=$spanBars*$sec;
    if($direction==='after'){
      $p1=$cursor;
      $p2=$cursor+$span;
      $chunk=fetchYahoo($symbol,$interval,$p1,$p2);
      if($chunk)storeCandles($pdo,$symbol,$interval,$chunk);
      $chunk=getCachedCandles($pdo,$symbol,$interval,$p1,$p2);
      $chunk=array_values(array_filter($chunk,fn($c)=>$c['time']>$cursor));
      if(!$chunk){$endReached=true;break;}
      if(count($chunk)>$need)$chunk=array_slice($chunk,0,$need);
      $newCursor=$chunk[count($chunk)-1]['time'];
      if($newCursor<=$cursor){$endReached=true;break;}
      $result=array_merge($result,$chunk);
      if(count($chunk)<$need&&$p2>=time()){$endReached=true;break;}
      $cursor=$newCursor;
    }else{
      $p2=max(1,$cursor);
      $p1=max(1,$p2-$span);
      $chunk=fetchYahoo($symbol,$interval,$p1,$p2);
      if($chunk)storeCandles($pdo,$symbol,$interval,$chunk);
      $chunk=getCachedCandles($pdo,$symbol,$interval,$p1,$p2);
      $chunk=array_values(array_filter($chunk,fn($c)=>$c['time']<$cursor));
      if(!$chunk){$endReached=true;break;}
      if(count($chunk)>$need)$chunk=array_slice($chunk,-$need);
      $newCursor=$chunk[0]['time'];
      if($newCursor>=$cursor){$endReached=true;break;}
      $result=array_merge($chunk,$result);
      if(count($chunk)<$need&&$p1<=1){$endReached=true;break;}
      $cursor=$newCursor;
    }
  }
  return [array_values($result),$endReached];
}
function encryptKey($plain){
  $iv=random_bytes(16);
  $enc=openssl_encrypt($plain,'AES-256-CBC',CRYPT_KEY,0,base64_encode($iv));
  return base64_encode($iv).'|'.$enc;
}
function decryptKey($stored){
  [$iv,$data]=array_pad(explode('|',$stored,2),2,'');
  return openssl_decrypt($data,'AES-256-CBC',CRYPT_KEY,0,$iv);
}
function formatInTimezone($unixSec,$iana){
  if(!$iana||$iana==='UTC')return gmdate('c',$unixSec);
  try{$dt=new DateTime('@'.$unixSec);$dt->setTimezone(new DateTimeZone($iana));return $dt->format('c');}catch(Exception $e){return gmdate('c',$unixSec);}
}
function pushToCycles($apiKey,$streamId,$dates,$values){
  $body=json_encode(['streamid'=>$streamId,'messagetype'=>'UPSERT','dates'=>$dates,'values'=>$values]);
  $url=CYCLES_BASE.'?api_key='.urlencode($apiKey);
  $ctx=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\nContent-Length: ".strlen($body)."\r\n",'content'=>$body,'timeout'=>20,'ignore_errors'=>true]]);
  return @file_get_contents($url,false,$ctx);
}
function setSetting($pdo,$key,$val){
  $pdo->prepare("INSERT INTO settings(`key`,`value`)VALUES(?,?)ON DUPLICATE KEY UPDATE `value`=?")->execute([$key,$val,$val]);
}
function getSetting($pdo,$key,$default=null){
  try{$v=$pdo->prepare("SELECT `value` FROM settings WHERE `key`=?");$v->execute([$key]);$r=$v->fetchColumn();return $r!==false?$r:$default;}catch(Exception $e){return $default;}
}