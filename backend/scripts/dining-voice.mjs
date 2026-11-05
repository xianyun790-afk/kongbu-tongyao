/** Server-only speech relay. The browser never contacts the workbench or sees its configuration. */
const TARGET_RATE=16000;
const DEFAULT_BASE_URL='http://127.0.0.1:3210';

export class DiningVoiceError extends Error{
 constructor(code,message,options){super(message,options);this.name='DiningVoiceError';this.code=code;}
}
const fail=(code,message)=>{throw new DiningVoiceError(code,message);};
const bounded=(value,fallback,min,max)=>{const n=Number(value);return value!==undefined&&value!==''&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};

export function getDiningVoiceConfig(env=process.env){
 const baseUrl=String(env.DINING_TTS_BASE_URL||DEFAULT_BASE_URL).replace(/\/+$/,'');
 let url;try{url=new URL(baseUrl);}catch{fail('CONFIG','主持语音服务地址无效。');}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)fail('CONFIG','主持语音服务地址无效。');
 return {
  enabled:!['0','false','off'].includes(String(env.DINING_TTS_ENABLED??'true').toLowerCase()),
  baseUrl,
  provider:env.DINING_TTS_PROVIDER||'minimax',
  model:env.DINING_TTS_MODEL||'speech-2.8-hd',
  voice:env.DINING_TTS_VOICE||'Chinese (Mandarin)_Radio_Host',
  timeoutMs:bounded(env.DINING_TTS_TIMEOUT_MS,20000,1000,60000),
  maxTextLength:1200,maxAudioBytes:12*1024*1024,maxDurationSeconds:90,
  options:{speed:bounded(env.DINING_TTS_SPEED,1,.5,2),vol:bounded(env.DINING_TTS_VOLUME,1,.1,10),pitch:bounded(env.DINING_TTS_PITCH,0,-12,12),format:'wav',sampleRate:TARGET_RATE,bitrate:128000,languageBoost:'Chinese',outputFormat:'hex'},
 };
}

function parseWave(bytes,maxDurationSeconds){
 if(bytes.length<12||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')fail('AUDIO_FORMAT','主持语音返回的音频不是可用的 WAV。');
 const end=bytes.readUInt32LE(4)+8;
 if(end!==bytes.length)fail('AUDIO_FORMAT','主持语音 WAV 长度不完整。');
 let fmt=null;const data=[];
 for(let p=12;p<end;){
  if(p+8>end)fail('AUDIO_FORMAT','主持语音 WAV 分块不完整。');
  const id=bytes.toString('ascii',p,p+4),size=bytes.readUInt32LE(p+4),start=p+8,next=start+size+(size%2);
  if(start+size>end||next>end)fail('AUDIO_FORMAT','主持语音 WAV 分块不完整。');
  if(id==='fmt '){
   if(fmt||size<16)fail('AUDIO_FORMAT','主持语音 WAV 格式块无效。');
   fmt={encoding:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),sampleRate:bytes.readUInt32LE(start+4),byteRate:bytes.readUInt32LE(start+8),blockAlign:bytes.readUInt16LE(start+12),bitsPerSample:bytes.readUInt16LE(start+14)};
  }else if(id==='data')data.push(bytes.subarray(start,start+size));
  p=next;
 }
 if(!fmt||!data.length)fail('AUDIO_FORMAT','主持语音 WAV 缺少音频内容。');
 const {encoding,channels,sampleRate,bitsPerSample,blockAlign,byteRate}=fmt;
 if(![1,3].includes(encoding)||![1,2].includes(channels)||sampleRate<8000||sampleRate>192000||![8,16,24,32].includes(bitsPerSample)||(encoding===3&&bitsPerSample!==32))fail('AUDIO_FORMAT','主持语音 WAV 编码暂不支持。');
 if(blockAlign!==channels*bitsPerSample/8||byteRate!==sampleRate*blockAlign||data.some(chunk=>chunk.length%blockAlign))fail('AUDIO_FORMAT','主持语音 WAV 采样信息无效。');
 const pcm=Buffer.concat(data),frames=pcm.length/blockAlign;
 if(!frames||frames/sampleRate>maxDurationSeconds)fail('AUDIO_LIMIT','主持语音长度超出本轮限制。');
 return {pcm,frames,...fmt};
}

/** Decode only validated PCM WAV. Compressed bytes are never forwarded as raw PCM. */
export function normalizeDiningWave(bytes,{maxDurationSeconds=90}={}){
 const wave=parseWave(Buffer.from(bytes),maxDurationSeconds);
 const {pcm,frames,sampleRate,channels,bitsPerSample,encoding}=wave;
 if(sampleRate===TARGET_RATE&&channels===1&&bitsPerSample===16&&encoding===1)return {pcm,source:{format:'wav',sampleRate,channels,bitsPerSample}};
 const mono=new Float32Array(frames),step=bitsPerSample/8;
 for(let i=0;i<frames;i++){
  let value=0;
  for(let c=0;c<channels;c++){
   const p=(i*channels+c)*step;
   const v=encoding===3?pcm.readFloatLE(p):bitsPerSample===8?(pcm[p]-128)/128:bitsPerSample===16?pcm.readInt16LE(p)/32768:bitsPerSample===24?pcm.readIntLE(p,3)/8388608:pcm.readInt32LE(p)/2147483648;
   if(!Number.isFinite(v))fail('AUDIO_FORMAT','主持语音包含无效采样。');
   value+=v/channels;
  }
  mono[i]=value;
 }
 const outputFrames=Math.max(1,Math.round(frames*TARGET_RATE/sampleRate)),output=Buffer.alloc(outputFrames*2);
 // Windowed-sinc low-pass interpolation avoids aliasing when the provider returns a higher rate.
 const ratio=sampleRate/TARGET_RATE,cutoff=Math.min(1,1/ratio),radius=Math.ceil(12/cutoff);
 for(let i=0;i<outputFrames;i++){
  let value;
  if(sampleRate===TARGET_RATE)value=mono[i];
  else{
   const center=i*ratio;let sum=0,weight=0;
   for(let k=Math.ceil(center-radius);k<=Math.floor(center+radius);k++){
    if(k<0||k>=frames)continue;
    const d=k-center,x=Math.PI*d*cutoff,w=(Math.abs(x)<1e-9?1:Math.sin(x)/x)*(.5+.5*Math.cos(Math.PI*d/radius));
    sum+=mono[k]*w;weight+=w;
   }
   value=weight?sum/weight:0;
  }
  output.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(value*32768))),i*2);
 }
 return {pcm:output,source:{format:'wav',sampleRate,channels,bitsPerSample}};
}

async function readBoundedJson(response,maxBytes,signal){
 if(Number(response.headers?.get?.('content-length'))>maxBytes)fail('AUDIO_LIMIT','主持语音服务返回的数据过大。');
 const parts=[];let size=0;
 if(response.body?.getReader){
  const reader=response.body.getReader();
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)fail('AUDIO_LIMIT','主持语音服务返回的数据过大。');parts.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
 }else{const data=Buffer.from(await response.arrayBuffer());if(data.length>maxBytes)fail('AUDIO_LIMIT','主持语音服务返回的数据过大。');parts.push(data);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail('RESPONSE','主持语音服务返回了无效结果。');}
}

export async function synthesizeDiningSpeech(text,{signal,fetchImpl=fetch,config=getDiningVoiceConfig()}={}){
 if(!config.enabled)fail('DISABLED','主持语音尚未启用。');
 if(typeof text!=='string'||!text.trim()||text.length>config.maxTextLength)fail('TEXT_LIMIT','本轮主持语音文字长度无效。');
 signal?.throwIfAborted();
 const controller=new AbortController();let deadline=false;
 const cancel=()=>controller.abort(signal.reason);
 signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{deadline=true;controller.abort(new DOMException('Speech deadline exceeded','TimeoutError'));},config.timeoutMs);
 const started=Date.now();
 try{
  const response=await fetchImpl(config.baseUrl+'/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:config.provider,model:config.model,voice:config.voice,text:text.trim(),options:config.options}),signal:controller.signal});
  if(!response.ok)fail('UPSTREAM','主持语音服务暂时不可用，请继续查看文字。');
  const result=await readBoundedJson(response,Math.ceil(config.maxAudioBytes*4/3)+65536,controller.signal);
  controller.signal.throwIfAborted();
  if(result.ok===false||!result.audio||typeof result.audio.base64!=='string')fail('UPSTREAM','主持语音生成失败，请继续查看文字。');
  if(!['wav','wave','audio/wav','audio/wave','audio/x-wav'].includes(String(result.audio.format||'').toLowerCase()))fail('AUDIO_FORMAT','主持语音服务没有返回所需的 WAV 音频。');
  const encoded=result.audio.base64;
  if(encoded.length>Math.ceil(config.maxAudioBytes*4/3)+4)fail('AUDIO_LIMIT','主持语音音频超出本轮限制。');
  if(!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('AUDIO_FORMAT','主持语音音频编码无效。');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length>config.maxAudioBytes)fail('AUDIO_LIMIT','主持语音音频超出本轮限制。');
  if(bytes.toString('base64')!==encoded)fail('AUDIO_FORMAT','主持语音音频编码无效。');
  const {pcm,source}=normalizeDiningWave(bytes,{maxDurationSeconds:config.maxDurationSeconds});
  controller.signal.throwIfAborted();
  const chunks=[];for(let p=0;p<pcm.length;p+=6400)chunks.push(pcm.subarray(p,p+6400).toString('base64'));
  const base64=pcm.toString('base64');
  return {base64,pcmBase64:base64,chunks,format:'pcm_s16le',sampleRate:TARGET_RATE,channels:1,durationMs:pcm.length/2/TARGET_RATE*1000,provider:config.provider,model:config.model,voice:config.voice,elapsedMs:Date.now()-started,source};
 }catch(error){
  if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  if(deadline)throw new DiningVoiceError('TIMEOUT','主持语音生成超时，请继续查看文字。');
  if(error instanceof DiningVoiceError)throw error;
  throw new DiningVoiceError('NETWORK','主持语音连接失败，请继续查看文字。',{cause:error});
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
