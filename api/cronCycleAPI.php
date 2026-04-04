<?php
require __DIR__.'/data.php';
echo "[".date('Y-m-d H:i:s')."] cronCycleAPI starting\n";
$streams=$pdo->query(
  "SELECT id,user,encrypted_api_key,stream_id,symbol,`interval`,field,last_sent_timestamp FROM cycle_streams WHERE enabled=1"
)->fetchAll();
if(!$streams) {echo "No active streams.\n";exit;}
foreach($streams as $st) {
  $sym=$st['symbol'];$int=$st['interval'];
  $since=(int)($st['last_sent_timestamp']??0);
  $p1=$since?$since+1:time()-(DEFAULT_DAYS[$int]??60)*86400;
  $candles=getCachedCandles($pdo,$sym,$int,$p1,time());
  if(!$candles) {echo "  Stream {$st['id']} ($sym $int) — no new bars\n";continue;}
  $apiKey=decryptKey($st['encrypted_api_key']);
  if(!$apiKey) {echo "  Stream {$st['id']} — decrypt failed\n";continue;}
  $field=$st['field'];
  $dates=array_map(fn($c)=>gmdate('c',$c['time']),$candles);
  $values=array_map(fn($c)=>(float)$c[$field],$candles);
  $res=pushToCycles($apiKey,$st['stream_id'],$dates,$values);
  $ok=$res&&!isset(json_decode($res,true)['error']);
  if($ok) {
    $lastTs=$candles[count($candles)-1]['time'];
    $pdo->prepare("UPDATE cycle_streams SET last_sent_timestamp=? WHERE id=?")->execute([$lastTs,$st['id']]);
    echo "  Stream {$st['id']} ($sym $int) — sent ".count($dates)." bars\n";
  } else {
    echo "  Stream {$st['id']} ($sym $int) — push failed: $res\n";
  }
}
echo "Done.\n";