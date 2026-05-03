<?php
if (!ini_get('zlib.output_compression')) {
    ob_start('ob_gzhandler');
}
header("Content-Type: application/json; charset=utf-8");
function curlGet($url){
    $ch=curl_init();
    curl_setopt_array($ch,[
        CURLOPT_URL=>$url,
        CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_FOLLOWLOCATION=>true,
        CURLOPT_TIMEOUT=>10,
        CURLOPT_CONNECTTIMEOUT=>5,
        CURLOPT_USERAGENT=>"Mozilla/5.0",
        CURLOPT_HTTPHEADER=>["Accept: application/json,text/html,application/xml;q=0.9,*/*;q=0.8"]
    ]);
    $res=curl_exec($ch);
    $code=curl_getinfo($ch,CURLINFO_HTTP_CODE);
    curl_close($ch);
    if($res===false||$code>=400) return null;
    return $res;
}
function clean($str){return trim($str??'');}
$symbol=clean($_GET['symbol']??'');
$offset=(int)($_GET['offset']??0);
$limit=10;
if($symbol===''){echo json_encode([]);exit;}
$bare=preg_replace('/^[^:]+:/','',$symbol);
$url="https://feeds.finance.yahoo.com/rss/2.0/headline?s=".urlencode($bare)."&region=US&lang=en-US";
$raw=curlGet($url);
if(!$raw){echo json_encode([]);exit;}
libxml_use_internal_errors(true);
$xml=simplexml_load_string($raw);
if(!$xml||!isset($xml->channel->item)){echo json_encode([]);exit;}
$all=[];
foreach($xml->channel->item as $item){
    $all[]=[
        "title"=>clean((string)$item->title),
        "link"=>clean((string)$item->link),
        "pubDate"=>clean((string)$item->pubDate),
        "source"=>clean((string)($item->source??"")),
        "description"=>clean(strip_tags((string)$item->description))
    ];
}
$total=count($all);
$slice=array_slice($all,$offset,$limit);
echo json_encode(["items"=>$slice,"total"=>$total,"offset"=>$offset,"limit"=>$limit],JSON_UNESCAPED_UNICODE);