<?php
header('Content-Type: application/json');
header('Cache-Control: no-cache');
$session=dirname(__DIR__).'/../session.php';
if(file_exists($session)) require $session;
require __DIR__.'/data.php';
$user=$_SESSION['user']??null;
$role=$_SESSION['user_role']??'guest';
$action=$_REQUEST['action']??'';
function ok($d){echo json_encode($d);exit;}
function err($m,$c=400){http_response_code($c);ok(['error'=>$m]);}
function needLogin(){global $user;if(!$user)err('Login required',401);}
function lim($role){return in_array($role,['premium','admin'])?30:10;}
switch($action) {
  case 'user_config':    doUserConfig();    break;
  case 'chart_data':     doChartData();     break;
  case 'search':         doSearch();        break;
  case 'set_track':      doSetTrack();      break;
  case 'remove_track':   doRemoveTrack();   break;
  case 'add_stream':     doAddStream();     break;
  case 'remove_stream':  doRemoveStream();  break;
  case 'toggle_stream':  doToggleStream();  break;
  case 'manual_post':    doManualPost();    break;
  case 'check_updates':  doCheckUpdates();  break;
  default: err('Unknown action');
}
function doUserConfig() {
  global $pdo,$user,$role;
  $tracked=[];$streams=[];
  if($user) {
    $s=$pdo->prepare("SELECT symbol,`interval`,auto_update_enabled,last_updated FROM tracked_assets WHERE user=?");
    $s->execute([$user]);$tracked=$s->fetchAll();
    $s=$pdo->prepare("SELECT id,stream_id,symbol,`interval`,field,enabled FROM cycle_streams WHERE user=?");
    $s->execute([$user]);$streams=$s->fetchAll();
  }
  $lc=(int)getSetting($pdo,'last_cron_symbol_store',0);
  ok(['user'=>$user,'role'=>$role,'limits'=>['assets'=>lim($role),'streams'=>lim($role)],
    'tracked'=>$tracked,'streams'=>$streams,
    'cron_info'=>['last_cron_run'=>$lc,'cron_frequency'=>3600]]);
}
function doChartData() {
  global $pdo;
  $sym=trim($_GET['symbol']??'');
  $int=in_array($_GET['interval']??'',ALLOWED_INTERVALS)?$_GET['interval']:'1d';
  $p2=(int)($_GET['p2']??time());
  $p1=(int)($_GET['p1']??($p2-(DEFAULT_DAYS[$int]??60)*86400));
  if(!$sym) err('No symbol');
  $range=getCachedRange($pdo,$sym,$int);
  $mn=(int)($range['mn']??0);$mx=(int)($range['mx']??0);
  if(!$mn) {
    storeCandles($pdo,$sym,$int,fetchYahoo($sym,$int,$p1,min($p2,time())));
  } else {
    if($p1<$mn) storeCandles($pdo,$sym,$int,fetchYahoo($sym,$int,$p1,min($mn-1,$p2)));
    if($p2>$mx) storeCandles($pdo,$sym,$int,fetchYahoo($sym,$int,max($mx+1,$p1),min($p2,time())));
  }
  $data=getCachedCandles($pdo,$sym,$int,$p1,$p2);
  ok(['candles'=>$data,'symbol'=>$sym,'interval'=>$int,'p1'=>$p1,'p2'=>$p2]);
}
function doSearch() {
  $q = trim($_GET['q'] ?? '');
  if(!$q) err('No query');
  $url = YAHOO_BASE."/v1/finance/search?".http_build_query([
    'q' => $q,
    'quotesCount' => 10,
    'newsCount' => 0
  ]);
  $raw = yahooGet($url);
  if(!$raw) err('Search request failed');
  $d = json_decode($raw, true);
  if(!$d) err('Invalid Yahoo response');
  $quotes = $d['quotes'] ?? $d['finance']['result'][0]['quotes'] ?? [];
  ok(['results' => $quotes]);
}
function doSetTrack() {
  global $pdo,$user,$role;
  needLogin();
  $sym=trim($_POST['symbol']??'');
  $int=in_array($_POST['interval']??'',ALLOWED_INTERVALS)?$_POST['interval']:'';
  $enabled=(int)($_POST['enabled']??1);
  if(!$sym||!$int) err('Missing params');
  if($enabled) {
    $s=$pdo->prepare("SELECT COUNT(*) FROM tracked_assets WHERE user=? AND auto_update_enabled=1");
    $s->execute([$user]);$cnt=(int)$s->fetchColumn();
    $e=$pdo->prepare("SELECT 1 FROM tracked_assets WHERE user=? AND symbol=? AND `interval`=?");
    $e->execute([$user,$sym,$int]);
    if(!$e->fetchColumn()&&$cnt>=lim($role)) err('Auto-update asset limit reached');
  }
  $pdo->prepare("INSERT INTO tracked_assets(user,symbol,`interval`,auto_update_enabled)VALUES(?,?,?,?)ON DUPLICATE KEY UPDATE auto_update_enabled=?")
    ->execute([$user,$sym,$int,$enabled,$enabled]);
  ok(['ok'=>true]);
}
function doRemoveTrack() {
  global $pdo,$user;
  needLogin();
  $sym=trim($_POST['symbol']??'');$int=$_POST['interval']??'';
  if(!$sym||!$int) err('Missing params');
  $pdo->prepare("UPDATE cycle_streams SET enabled=0 WHERE user=? AND symbol=? AND `interval`=?")->execute([$user,$sym,$int]);
  $pdo->prepare("DELETE FROM tracked_assets WHERE user=? AND symbol=? AND `interval`=?")->execute([$user,$sym,$int]);
  ok(['ok'=>true]);
}
function doAddStream() {
  global $pdo,$user,$role;
  needLogin();
  $sym=trim($_POST['symbol']??'');
  $int=in_array($_POST['interval']??'',ALLOWED_INTERVALS)?$_POST['interval']:'';
  $sid=trim($_POST['stream_id']??'');
  $apiKey=trim($_POST['api_key']??'');
  $field=in_array($_POST['field']??'',['open','high','low','close'])?$_POST['field']:'close';
  if(!$sym||!$int||!$sid||!$apiKey) err('Missing params');
  $s=$pdo->prepare("SELECT auto_update_enabled FROM tracked_assets WHERE user=? AND symbol=? AND `interval`=?");
  $s->execute([$user,$sym,$int]);$tr=$s->fetch();
  if(!$tr||!$tr['auto_update_enabled']) err('Enable auto-update for this asset first');
  $s=$pdo->prepare("SELECT COUNT(*) FROM cycle_streams WHERE user=?");
  $s->execute([$user]);
  if((int)$s->fetchColumn()>=lim($role)) err('Stream limit reached');
  $enc=encryptKey($apiKey);
  $pdo->prepare("INSERT INTO cycle_streams(user,encrypted_api_key,stream_id,symbol,`interval`,field,enabled)VALUES(?,?,?,?,?,?,1)")
    ->execute([$user,$enc,$sid,$sym,$int,$field]);
  $id=(int)$pdo->lastInsertId();
  $p1=time()-(DEFAULT_DAYS[$int]??60)*86400;
  $candles=getCachedCandles($pdo,$sym,$int,$p1,time());
  $initialSent=0;
  if($candles) {
    $dates=array_map(fn($c)=>gmdate('c',$c['time']),$candles);
    $values=array_map(fn($c)=>(float)$c[$field],$candles);
    pushToCycles($apiKey,$sid,$dates,$values);
    $lastTs=$candles[count($candles)-1]['time'];
    $pdo->prepare("UPDATE cycle_streams SET last_sent_timestamp=? WHERE id=?")->execute([$lastTs,$id]);
    $initialSent=count($candles);
  }
  ok(['ok'=>true,'id'=>$id,'initial_sent'=>$initialSent]);
}
function doRemoveStream() {
  global $pdo,$user;
  needLogin();
  $id=(int)($_POST['id']??0);
  if(!$id) err('No id');
  $pdo->prepare("DELETE FROM cycle_streams WHERE id=? AND user=?")->execute([$id,$user]);
  ok(['ok'=>true]);
}
function doToggleStream() {
  global $pdo,$user;
  needLogin();
  $id=(int)($_POST['id']??0);
  $en=(int)($_POST['enabled']??1);
  if(!$id) err('No id');
  $pdo->prepare("UPDATE cycle_streams SET enabled=? WHERE id=? AND user=?")->execute([$en,$id,$user]);
  ok(['ok'=>true]);
}
function doManualPost() {
  global $pdo;
  $sym=trim($_POST['symbol']??'');
  $int=$_POST['interval']??'1d';
  $p1=(int)($_POST['p1']??0);
  $p2=(int)($_POST['p2']??time());
  $field=in_array($_POST['field']??'',['open','high','low','close'])?$_POST['field']:'close';
  $apiKey=trim($_POST['api_key']??'');
  $sid=trim($_POST['stream_id']??'');
  if(!$sym||!$apiKey||!$sid) err('Missing params');
  if(!$p1) $p1=time()-(DEFAULT_DAYS[$int]??60)*86400;
  $candles=getCachedCandles($pdo,$sym,$int,$p1,$p2);
  if(!$candles) err('No data in cache for this range');
  $dates=array_map(fn($c)=>gmdate('c',$c['time']),$candles);
  $values=array_map(fn($c)=>(float)$c[$field],$candles);
  $res=pushToCycles($apiKey,$sid,$dates,$values);
  $decoded=$res?json_decode($res,true):null;
  ok(['ok'=>true,'sent'=>count($dates),'response'=>$decoded]);
}
function doCheckUpdates() {
  global $pdo;
  $sym=trim($_GET['symbol']??'');$int=$_GET['interval']??'';$since=(int)($_GET['since']??0);
  if(!$sym||!$int) err('Missing params');
  $data=getCachedCandles($pdo,$sym,$int,$since+1,time());
  ok(['candles'=>$data]);
}