/** Invite-only public DM relay. Put HTTPS in front; keep this process on loopback. */
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {createHash,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import {WebSocket,WebSocketServer} from 'ws';
import {attachDiningSession} from './dining-session.mjs';
import {loadDiningEnvironment,loadDiningCredentials,DINING_MODEL} from './dining-runtime.mjs';
import {getDiningVoiceConfig,synthesizeDiningSpeech} from './dining-voice.mjs';

const DEFAULT_ORIGINS=['https://xianyun790-afk.github.io','http://127.0.0.1:4184','http://localhost:4184'];
const ALLOWED_MESSAGES=new Set(['GameContext','CreateSession','ConfigPipeline','ConfigASR','StartServing','Pong','InterruptAgent','SpeakOpening','PostMultimodalGenerate']);
const SETUP_MESSAGES=new Set(['CreateSession','ConfigPipeline','ConfigASR','StartServing']);
const GENERATION_MESSAGES=new Set(['SpeakOpening','PostMultimodalGenerate']);
const minute=60000,day=86400000;
const number=(value,fallback,min,max)=>{
 const n=Number(value);return value!==undefined&&value!==''&&Number.isInteger(n)&&n>=min&&n<=max?n:fallback;
};
function originSet(raw){
 const list=Array.isArray(raw)?raw:String(raw).split(',');
 return new Set(list.map(value=>{
  const text=String(value).trim();let url;try{url=new URL(text);}catch{throw new Error('DINING_ALLOWED_ORIGINS contains an invalid origin.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('DINING_ALLOWED_ORIGINS must contain exact HTTP(S) origins only.');
  return url.origin;
 }));
}
const hash=value=>createHash('sha256').update(value).digest();
function counter(bucket,key,width,now){
 const window=Math.floor(now/width),old=bucket[key];
 if(!old||old.window!==window)bucket[key]={window,count:0};
 return bucket[key];
}
function take(counters){
 if(counters.some(([counter,limit])=>counter.count>=limit))return false;
 for(const [counter] of counters)counter.count++;
 return true;
}
function address(req,trustProxy){
 const peer=String(req.socket.remoteAddress||'unknown').replace(/^::ffff:/,'');
 // Only trust a direct loopback reverse proxy; take its appended final hop, not a user-supplied first hop.
 if(trustProxy&&['127.0.0.1','::1'].includes(peer)){
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1)?.trim();
  if(forwarded&&isIP(forwarded))return forwarded.replace(/^::ffff:/,'');
 }
 return peer;
}

/** No listener is started on import. Tests can inject sessions, credentials and speech without upstream calls. */
export function createDiningPublicServer({env=loadDiningEnvironment(),credentials=loadDiningCredentials,attach=attachDiningSession,upstreamFactory=token=>new WebSocket('wss://nia.sensetime.com/biz/duplex/ws1?audio_only=true&jwt='+encodeURIComponent(token)),voice,allowedOrigins,demoToken,limits={},trustProxy,now=Date.now}={}){
 const token=String(demoToken??env.DINING_DEMO_TOKEN??'').trim();
 if(Buffer.byteLength(token)<24||Buffer.byteLength(token)>256)throw new Error('Set DINING_DEMO_TOKEN to a secret of 24–256 bytes before starting the public DM.');
 const tokenHash=hash(token),origins=originSet(allowedOrigins??env.DINING_ALLOWED_ORIGINS??DEFAULT_ORIGINS);
 const proxy=trustProxy??['1','true'].includes(String(env.DINING_TRUST_PROXY||'').toLowerCase());
 const bounds={
  clients:number(limits.clients??env.DINING_MAX_CLIENTS,4,1,32),
  clientsPerIp:number(limits.clientsPerIp??env.DINING_MAX_CLIENTS_PER_IP,2,1,16),
  turnsPerMinute:number(limits.turnsPerMinute??env.DINING_MAX_TURNS_PER_MINUTE,30,1,300),
  turnsPerDay:number(limits.turnsPerDay??env.DINING_MAX_TURNS_PER_DAY,300,1,10000),
  ipTurnsPerMinute:number(limits.ipTurnsPerMinute??env.DINING_MAX_IP_TURNS_PER_MINUTE,10,1,100),
  ipTurnsPerDay:number(limits.ipTurnsPerDay??env.DINING_MAX_IP_TURNS_PER_DAY,100,1,10000),
  clientTurnsPerMinute:number(limits.clientTurnsPerMinute??env.DINING_MAX_CLIENT_TURNS_PER_MINUTE,8,1,100),
  connectionsPerMinute:number(limits.connectionsPerMinute??env.DINING_MAX_CONNECTIONS_PER_MINUTE,40,1,1000),
  ipConnectionsPerMinute:number(limits.ipConnectionsPerMinute??env.DINING_MAX_IP_CONNECTIONS_PER_MINUTE,12,1,100),
  messagesPerMinute:number(limits.messagesPerMinute??env.DINING_MAX_MESSAGES_PER_MINUTE,120,1,1000),
  durationMs:number(limits.durationMs??env.DINING_SESSION_MS,600000,25,600000),
  idleMs:number(limits.idleMs??env.DINING_IDLE_MS,90000,25,600000),
  maxTrackedIps:number(limits.maxTrackedIps,2048,1,10000),
 };
 if(voice===undefined){const config=getDiningVoiceConfig(env);voice=config.enabled?{config,synthesize:(text,options)=>synthesizeDiningSpeech(text,{...options,config})}:null;}
 const global={},ips=new Map(),activePerIp=new Map();let stopping=false;
 const ipBucket=(ip,time)=>{
  let bucket=ips.get(ip);
  if(!bucket){
   for(const [key,value] of ips)if(time-value.seen>=day&&!activePerIp.has(key))ips.delete(key);
   if(ips.size>=bounds.maxTrackedIps)return null;
   bucket={};ips.set(ip,bucket);
  }
  bucket.seen=time;return bucket;
 };
 const configured=()=>{try{const value=credentials();return Boolean(value?.ak&&value?.sk);}catch{return false;}};
 const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
  const reply=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
  let url;try{url=new URL(req.url,'http://relay.invalid');}catch{reply(400,{error:'bad_request'});return;}
  const origin=req.headers.origin;
  if(origin&&!origins.has(origin)){reply(403,{error:'origin_denied'});return;}
  if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
  if(url.pathname!=='/health'&&url.pathname!=='/api/nia/status'){reply(404,{error:'not_found'});return;}
  if(req.method==='OPTIONS'){
   if(!origin||req.headers['access-control-request-method']!=='GET'||String(req.headers['access-control-request-headers']||'').split(',').some(header=>header.trim()&&!/^content-type$/i.test(header.trim()))){reply(403,{error:'preflight_denied'});return;}
   res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return;
  }
  if(req.method!=='GET'){res.setHeader('Allow','GET, OPTIONS');reply(405,{error:'method_not_allowed'});return;}
  if(url.pathname==='/health'){reply(200,{ok:true,service:'dining-public-dm'});return;}
  reply(200,{configured:configured(),dining_loop:true,provider:'NIA',model:DINING_MODEL,transport:voice?'websocket-text-external-pcm':'websocket-text',auth_required:true,voice:voice?'电台男主播':null,voice_id:voice?.config.voice??null,tts:voice?{enabled:true,provider:voice.config.provider,model:voice.config.model,voice_id:voice.config.voice,sample_rate:16000}: {enabled:false}});
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 const wss=new WebSocketServer({noServer:true,maxPayload:32768,perMessageDeflate:false});
 const reject=(socket,status)=>{socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);};
 server.on('upgrade',(req,socket,head)=>{
  let url;try{url=new URL(req.url,'http://relay.invalid');}catch{reject(socket,'400 Bad Request');return;}
  if(url.pathname!=='/api/nia/dining-session'){reject(socket,'404 Not Found');return;}
  if(stopping||!origins.has(req.headers.origin)){reject(socket,'403 Forbidden');return;}
  const supplied=url.searchParams.getAll('token');
  if(supplied.length!==1||supplied[0].length>256||!timingSafeEqual(hash(supplied[0]),tokenHash)){reject(socket,'401 Unauthorized');return;}
  if(!configured()){reject(socket,'503 Service Unavailable');return;}
  const time=now(),ip=address(req,proxy),bucket=ipBucket(ip,time);
  if(!bucket||wss.clients.size>=bounds.clients||(activePerIp.get(ip)||0)>=bounds.clientsPerIp){reject(socket,'429 Too Many Requests');return;}
  if(!take([[counter(global,'connections',minute,time),bounds.connectionsPerMinute],[counter(bucket,'connections',minute,time),bounds.ipConnectionsPerMinute]])){reject(socket,'429 Too Many Requests');return;}
  // Remove the invite from the request before it can reach application logging or an injected handler.
  req.url=url.pathname;
  wss.handleUpgrade(req,socket,head,client=>wss.emit('connection',client,{ip,bucket}));
 });
 wss.on('connection',(client,{ip,bucket})=>{
  activePerIp.set(ip,(activePerIp.get(ip)||0)+1);
  const session=new EventEmitter(),clientBudget={},setup=new Set();let ended=false,idleTimer,durationTimer,terminateTimer;
  Object.defineProperties(session,{readyState:{get:()=>client.readyState},bufferedAmount:{get:()=>client.bufferedAmount}});
  session.send=(...args)=>client.send(...args);session.close=(...args)=>client.close(...args);
  session.on('error',()=>{});
  const finish=(code,message)=>{
   if(ended||client.readyState!==WebSocket.OPEN)return;
   client.send(JSON.stringify({type:'LocalError',message}));client.close(code,message.slice(0,40));
   terminateTimer=setTimeout(()=>client.terminate(),1000);terminateTimer.unref();
  };
  const touch=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>finish(1001,'主持连接已空闲，请在需要时重新提问。'),bounds.idleMs);idleTimer.unref();};
  durationTimer=setTimeout(()=>finish(1001,'本轮主持连接已到时限，请重新连接。'),bounds.durationMs);durationTimer.unref();touch();
  client.on('message',(raw,binary)=>{
   if(ended||client.readyState!==WebSocket.OPEN)return;
   const time=now();
   if(!take([[counter(clientBudget,'messages',minute,time),bounds.messagesPerMinute]])){finish(1008,'发送过于频繁，请稍后再试。');return;}
   let message;try{if(binary)throw Error();message=JSON.parse(raw.toString());if(!message||typeof message!=='object'||Array.isArray(message)||!ALLOWED_MESSAGES.has(message.type))throw Error();}catch{finish(1008,'主持消息格式无效，请重新连接。');return;}
   if(SETUP_MESSAGES.has(message.type)){
    if(setup.has(message.type)){finish(1008,'主持会话已经初始化，请勿重复配置。');return;}setup.add(message.type);
   }
   if(message.type==='PostMultimodalGenerate'&&(typeof message.text!=='string'||!message.text.trim()||message.text.length>1200)){finish(1008,'请把问题控制在1200字以内。');return;}
   if(GENERATION_MESSAGES.has(message.type)){
    if(!take([[counter(global,'turnMinute',minute,time),bounds.turnsPerMinute],[counter(global,'turnDay',day,time),bounds.turnsPerDay],[counter(bucket,'turnMinute',minute,time),bounds.ipTurnsPerMinute],[counter(bucket,'turnDay',day,time),bounds.ipTurnsPerDay],[counter(clientBudget,'turnMinute',minute,time),bounds.clientTurnsPerMinute]])){finish(1008,'本轮主持使用次数已达到限制，请稍后再试；调查仍可继续。');return;}
   }
   // Heartbeat traffic cannot keep an abandoned billable connection alive.
   if(message.type!=='Pong')touch();
   session.emit('message',Buffer.from(JSON.stringify(message)),false);
  });
  client.on('error',error=>session.emit('error',error));
  client.on('close',(code,reason)=>{
   if(ended)return;ended=true;clearTimeout(idleTimer);clearTimeout(durationTimer);clearTimeout(terminateTimer);
   const remaining=(activePerIp.get(ip)||1)-1;if(remaining)activePerIp.set(ip,remaining);else activePerIp.delete(ip);
   session.emit('close',code,reason);session.removeAllListeners();
  });
  try{attach(session,{credentials,upstreamFactory,voice});}catch{finish(1011,'主持服务暂时不可用，请稍后重试。');}
 });
 server.on('close',()=>{stopping=true;for(const client of wss.clients)client.terminate();wss.close();});
 return server;
}

export function startDiningPublicServer(port,{env=loadDiningEnvironment(),host=env.DINING_BIND_HOST||'127.0.0.1',...options}={}){
 const selectedPort=port??number(env.DINING_PUBLIC_PORT,4185,1,65535),server=createDiningPublicServer({env,...options});
 server.listen(selectedPort,host,()=>process.stdout.write(`Dining DM relay listening on ${host}:${server.address().port}; HTTPS reverse proxy required for remote clients.\n`));
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)startDiningPublicServer();
