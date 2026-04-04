<?php
require __DIR__.'/data.php';
echo "[".date('Y-m-d H:i:s')."] cronSymbolStore starting\n";
$pairs=$pdo->query(
  "SELECT DISTINCT symbol,`interval` FROM tracked_assets WHERE auto_update_enabled=1"
)->fetchAll();
if(!$pairs) {echo "No tracked assets.\n";exit;}
foreach($pairs as $p) {
  $sym=$p['symbol'];$int=$p['interval'];
  $range=getCachedRange($pdo,$sym,$int);
  $mx=(int)($range['mx']??0);
  $now=time();
  $p1=$mx?$mx+1:($now-(DEFAULT_DAYS[$int]??60)*86400);
  if($p1>=$now) {echo "  $sym $int — already current\n";continue;}
  $candles=fetchYahoo($sym,$int,$p1,$now);
  $stored=storeCandles($pdo,$sym,$int,$candles);
  $pdo->prepare(
    "UPDATE tracked_assets SET last_updated=NOW() WHERE symbol=? AND `interval`=? AND auto_update_enabled=1"
  )->execute([$sym,$int]);
  echo "  $sym $int — fetched ".count($candles).", stored $stored\n";
}
setSetting($pdo,'last_cron_symbol_store',(string)time());
echo "Done.\n";