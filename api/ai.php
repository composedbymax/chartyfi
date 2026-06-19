<?php
header('Content-Type: application/json');
header("Cross-Origin-Opener-Policy: same-origin");
header("X-Frame-Options: DENY");
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none';");
ignore_user_abort(false);
set_time_limit(0);
while(ob_get_level()>0) ob_end_clean();
@ini_set('memory_limit','-1');
@ini_set('zlib.output_compression','0');
@ini_set('output_buffering','0');
@ini_set('implicit_flush','1');
if(function_exists('ob_implicit_flush')){
  @ob_implicit_flush(true);
}
register_shutdown_function(function(){
  $e=error_get_last();
  if(!$e) return;
  if(headers_sent()) return;
  http_response_code(500);
  echo json_encode([
    'error'=>[
      'message'=>'Fatal error',
      'detail'=>$e['message']??'unknown',
      'file'=>$e['file']??'',
      'line'=>$e['line']??0
    ]
  ],JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);
});
$config=require __DIR__.'/data/modelconfig.php';
$models=$config['models']??[];
$clientStopped = function () {
  return connection_aborted();
};
$raw=file_get_contents('php://input');
if($raw===false){
  echo json_encode(['error'=>['message'=>'Failed reading input']],JSON_UNESCAPED_SLASHES);
  exit;
}
$in=json_decode($raw,true);
unset($raw);
if(!is_array($in)){
  echo json_encode([
    'error'=>[
      'message'=>'Invalid JSON',
      'json_error'=>json_last_error_msg()
    ]
  ],JSON_UNESCAPED_SLASHES);
  exit;
}
$action=$in['action']??($_GET['action']??'');
if($action==='list'){
  echo json_encode(['models'=>array_keys($models)],JSON_UNESCAPED_SLASHES);
  exit;
}
if(!$models){
  echo json_encode(['error'=>['message'=>'No models configured']],JSON_UNESCAPED_SLASHES);
  exit;
}
$model=$in['model']??'';
$messages=is_array($in['messages']??null)
  ? $in['messages']
  : [];
$instructionTypes=is_array($in['instructionTypes']??null)?$in['instructionTypes']:[];
if($instructionTypes){
    $instrConfig=require __DIR__.'/data/instructconfig.php';
    $parts=[];
    foreach($instructionTypes as $type){
        if(isset($instrConfig[$type])&&is_file($instrConfig[$type])){
            $c=file_get_contents($instrConfig[$type]);
            if($c!==false) $parts[]=trim($c);
        }
    }
    if($parts){
        array_unshift($messages,[
            'role'=>'system',
            'content'=>implode("\n\n",$parts)
        ]);
    }
}
if($model===''||!isset($models[$model])){
  echo json_encode(['error'=>['message'=>'Unknown model']],JSON_UNESCAPED_SLASHES);
  exit;
}
function retryable_status($status,$err){
  return $err!==''||$status===408||$status===409||$status===425||$status===429||$status>=500;
}
$order=array_keys($models);
$start=array_search($model,$order,true);
if($start===false) $start=0;
$lastErr='';
$lastStatus=0;
$count=count($order);
for($offset=0;$offset<$count;$offset++){
  $current=$order[($start+$offset)%$count];
  $cfg=$models[$current];
  $payloadData=$cfg['params'];
  $payloadData['model']=$current;
  $payloadData['messages']=&$messages;
  $payloadData['stream']=true;
  $payload=json_encode(
    $payloadData,
    JSON_UNESCAPED_SLASHES|
    JSON_INVALID_UTF8_SUBSTITUTE
  );
  unset($payloadData);
  if($payload===false){
    echo json_encode([
      'error'=>[
        'message'=>'Payload encode failed',
        'json_error'=>json_last_error_msg()
      ]
    ],JSON_UNESCAPED_SLASHES);
    exit;
  }
  for($retry=0;$retry<3;$retry++){
    $response='';
    $streaming=false;
    $bodyStarted=false;
    $timedOut=false;
    $startTime=microtime(true);
    $status=0;
    $ch=curl_init('https://integrate.api.nvidia.com/v1/chat/completions');
    curl_setopt_array($ch,[
      CURLOPT_POST=>true,
      CURLOPT_HTTP_VERSION=>CURL_HTTP_VERSION_1_1,
      CURLOPT_TIMEOUT=>0,
      CURLOPT_CONNECTTIMEOUT=>20,
      CURLOPT_HTTPHEADER=>[
        'Authorization: Bearer '.$cfg['key'],
        'Content-Type: application/json',
        'Accept: text/event-stream'
      ],
      CURLOPT_POSTFIELDS=>$payload,
      CURLOPT_RETURNTRANSFER=>false,
      CURLOPT_HEADER=>false,
      CURLOPT_FOLLOWLOCATION=>true,
      CURLOPT_BUFFERSIZE=>8192,
      CURLOPT_HEADERFUNCTION=>function($ch,$header) use (&$status,&$streaming,$current,$model){
        if(preg_match('/^HTTP\/\S+\s+(\d+)/',$header,$m)){
          $status=(int)$m[1];
          if($status>=200&&$status<400){
            $streaming=true;
            if(!headers_sent()){
              header('X-Model: '.$current);
              header('X-Requested-Model: '.$model);
              header('X-Switched: '.($current!==$model?'1':'0'));
              header('Content-Type: text/event-stream; charset=utf-8');
              header('Cache-Control: no-cache, no-transform');
              header('Connection: keep-alive');
              header('X-Accel-Buffering: no');
            }
          }
        }
        return strlen($header);
      },
      CURLOPT_WRITEFUNCTION=>function($ch,$chunk) use (&$response,&$streaming,&$bodyStarted,$clientStopped){
        $bodyStarted=true;
        if ($clientStopped()) {
          return 0;
        }
        if($streaming){
          echo $chunk;
          @ob_flush();
          flush();
        }else{
          $response.=$chunk;
        }
        return strlen($chunk);
      },
      CURLOPT_NOPROGRESS => false,
      CURLOPT_XFERINFOFUNCTION => function($ch, $download_total, $downloaded, $upload_total, $uploaded) use ($clientStopped, &$streaming, &$timedOut, $startTime) {
        if ($clientStopped()) { return 1; }
        if (!$streaming && (microtime(true) - $startTime) > 19) {
          $timedOut = true;
          return 1;
        }
        return 0;
      },
    ]);
    $ok=curl_exec($ch);
    if (connection_aborted()) {
      curl_close($ch);
      exit;
    }
    $err=curl_error($ch);
    if($status===0){
      $status=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);
    }
    curl_close($ch);
    $lastErr=$err;
    $lastStatus=$status;
    if($ok&&$err===''&&$status<400){
      if($streaming){
        exit;
      }
      echo $response;
      exit;
    }
    if($bodyStarted){
      exit;
    }
    if($timedOut){
      break;
    }
    if(!retryable_status($status,$err)){
      if($response!==''){
        http_response_code($status>0?$status:502);
        echo $response;
        exit;
      }
      echo json_encode([
        'error'=>[
          'message'=>'Upstream error',
          'status'=>$status,
          'curl_error'=>$err
        ]
      ],JSON_UNESCAPED_SLASHES);
      exit;
    }
    unset($response);
    if(function_exists('gc_collect_cycles')){
      gc_collect_cycles();
    }
    if($retry<2) sleep(2);
  }
  unset($payload);
  if(function_exists('gc_collect_cycles')){
    gc_collect_cycles();
  }
}
echo json_encode([
  'error'=>[
    'message'=>$lastErr!==''?$lastErr:($lastStatus>0?'Upstream error (HTTP '.$lastStatus.')':'Upstream error'),
    'status'=>$lastStatus
  ]
],JSON_UNESCAPED_SLASHES);