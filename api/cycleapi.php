<?php
header('Content-Type: application/json');
$base='https://api.cycle.tools';
$endpoint=$_GET['endpoint']??'';
if(!$endpoint){
  http_response_code(400);
  echo json_encode(['error'=>'Missing endpoint']);
  exit;
}
$url=$base.$endpoint;
$ch=curl_init($url);
curl_setopt_array($ch,[
  CURLOPT_RETURNTRANSFER=>true,
  CURLOPT_FOLLOWLOCATION=>true,
  CURLOPT_TIMEOUT=>30,
  CURLOPT_SSL_VERIFYPEER=>true,
  CURLOPT_HTTPHEADER=>[
    'Accept: application/json'
  ]
]);
$response=curl_exec($ch);
$code=curl_getinfo($ch,CURLINFO_HTTP_CODE);
$error=curl_error($ch);
curl_close($ch);
if($error){
  http_response_code(500);
  echo json_encode(['error'=>$error]);
  exit;
}
http_response_code($code);
echo $response;