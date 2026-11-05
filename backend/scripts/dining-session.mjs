/** Isolated public DM relay: NIA generates text; the selected workbench voice speaks approved text. */
import {WebSocket} from 'ws';
import {ConversationOutputGate} from './conversation-output-gate.mjs';
import {createDiningJwt,loadDiningEnvironment} from './dining-runtime.mjs';
import {getDiningVoiceConfig,synthesizeDiningSpeech} from './dining-voice.mjs';
import {normalizeDiningContext,diningOpening,diningPrompt,diningPipeline,diningProblems,diningLocalGuidance,diningGenerationInput} from './dining-context.mjs';

export function createDiningVoice(){
 const config=getDiningVoiceConfig(loadDiningEnvironment());
 return config.enabled?{config,synthesize:(text,options)=>synthesizeDiningSpeech(text,{...options,config})}:null;
}
export function diningVoiceStatus(voice){return voice?{provider:voice.config.provider,model:voice.config.model,voice_id:voice.config.voice,name:'电台男主播',transport:'pcm_s16le',sample_rate:16000}:null;}

export function attachDiningSession(client,{credentials,upstreamFactory,voice=createDiningVoice()}){
 const send=m=>{if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(m));};
 const {ak,sk}=credentials();
 if(!ak||!sk){send({type:'LocalError',message:'实时AI DM尚未配置，文字调查仍可继续。'});client.close(1000);return;}
 const upstream=upstreamFactory(createDiningJwt(ak,sk));
 let context=normalizeDiningContext(),connected=false,lastInput='',retry=0,retryTimer=null,opening=false,turn=null,closed=false;
 const retiredIndices=new Set();
 const forward=m=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(JSON.stringify(m));};
 const expires=setTimeout(()=>{send({type:'LocalError',message:'本轮AI DM连接已到10分钟，请重新连接。'});client.close(1000);upstream.close();},600000);
 const timeout=setTimeout(()=>{if(!connected){send({type:'LocalError',message:'AI DM连接超时，请重试；已发现的线索仍保留。'});client.close(1000);upstream.close();}},15000);
 const isCurrent=t=>!closed&&t===turn&&!t.controller.signal.aborted;
 const sendTurn=(m,t=turn)=>{if(t&&isCurrent(t))send({...m,turn_id:t.id});};
 const retire=()=>{
  if(turn){turn.controller.abort();for(const index of turn.indices)retiredIndices.add(index);turn=null;}
  if(retiredIndices.size>256)client.close(1000);
 };
 const reset=()=>{if(retryTimer)clearTimeout(retryTimer);retryTimer=null;retry=0;opening=false;retire();gate.reset({newTurn:true});};
 const startTurn=id=>{reset();turn={id:id||crypto.randomUUID(),controller:new AbortController(),indices:new Set(),texts:[],drafts:new Map(),synthesisStarted:false};return turn;};
 const finishVoice=async(t,text)=>{
  if(!isCurrent(t)||t.synthesisStarted)return;t.synthesisStarted=true;
  try{
   const audio=await voice.synthesize(text,{signal:t.controller.signal});
   if(!isCurrent(t))return;
   const index='dining-voice-'+t.id;
   sendTurn({type:'AgentStartPlay'},t);sendTurn({type:'ResponseStartAudioStream',index,sample_rate:16000,encoding:'pcm_s16le',provider:voice.config.provider,voice_id:voice.config.voice},t);
   for(const audio_segment of audio.chunks){if(!isCurrent(t))return;sendTurn({type:'ResponseAudioSegment',index,audio_segment},t);}
   sendTurn({type:'ResponseEndAudioStream',index},t);
  }catch(error){
   if(!isCurrent(t)||error?.name==='AbortError')return;
   // Text remains a valid answer. A failed synthesizer must never silently switch voices.
   sendTurn({type:'TtsWarning',message:'主持语音暂时未能播放，本次回复已保留为文字。'},t);
  }
  if(isCurrent(t))sendTurn({type:'AgentEndPlay'},t);
 };
 const accepted=m=>{
  const t=turn;if(!t||!isCurrent(t))return;
  if(!voice){sendTurn(m,t);return;}
  if(m.type==='ResponseStartTextStream')t.drafts.set(m.index,'');
  if(m.type==='ResponseTextSegment')t.drafts.set(m.index,(t.drafts.get(m.index)||'')+(m.text||''));
  if(m.type==='ResponseEndTextStream'){
   const draft=t.drafts.get(m.index)||'';
   const text=typeof m.text==='string'&&m.text.startsWith(draft)?m.text:draft;
   t.texts.push(text);m={...m,text};t.drafts.delete(m.index);
  }
  if(m.type==='AgentEndPlay'){void finishVoice(t,t.texts.join(''));return;}
  if(/Audio/.test(m.type)||m.type==='AgentStartPlay')return;
  sendTurn(m,t);
 };
 const fallback=()=>{
  if(!turn)return;
  const text=diningLocalGuidance(context),index='dining-guidance-'+Date.now();
  accepted({type:'ResponseStartTextStream',index,source:'local-guidance'});
  accepted({type:'ResponseTextSegment',index,text});accepted({type:'ResponseEndTextStream',index,text,complete:true});accepted({type:'AgentEndPlay'});
 };
 const gate=new ConversationOutputGate({check:text=>diningProblems(text,context,lastInput),onAccept:accepted,onReject:problems=>{
  forward({type:'InterruptAgent'});if(turn)turn.texts=[];
  if(retry++>=1){fallback();return;}
  const t=turn;
  retryTimer=setTimeout(()=>{retryTimer=null;if(!t||!isCurrent(t))return;gate.reset();forward({type:'SetSystemPrompt',system_prompt:diningPrompt(context)+'\n\n本轮校正：'+problems.join(' ')});forward({type:'PostMultimodalGenerate',text:diningGenerationInput(lastInput,context)+'\n本轮校正（不要朗读标签）：'+problems.join(' '),request_id:'dining-corrected-'+Date.now()});},250);
 }});
 upstream.on('open',()=>{connected=true;clearTimeout(timeout);send({type:'TransportReady',experience:'dining-loop',protocol_version:2});});
 upstream.on('message',(raw,binary)=>{
  if(binary)return;let m;try{m=JSON.parse(raw.toString());}catch{return;}
  if(m.type==='Ping'){forward({type:'Pong'});return;}
  if(m.type==='CallFn'){forward({type:'FnReturn',call_id:m.call_id,status:'NoSuchFn',result:{content:'本轮DM没有游戏控制工具；所有调查和提交必须由玩家在界面操作。'}});return;}
  if(client.bufferedAmount>1024*1024){send({type:'LocalError',message:'AI DM语音接收拥堵，请停止后重试。'});client.close(1000);upstream.close();return;}
  if(/^Response(?:Start|End|Text|Audio)/.test(m.type)||['AgentStartPlay','AgentEndPlay'].includes(m.type)){
   if(!turn||turn.modelFinished||retiredIndices.has(m.index))return;
   if(m.index!==undefined)turn.indices.add(m.index);
   if(voice&&/Audio/.test(m.type))return; // Ignore NIA audio even if it ignores tts.enabled=false.
   if(opening){if(!/Text/.test(m.type))sendTurn(m);if(m.type==='AgentEndPlay')opening=false;}
   else {
    const current=turn;gate.push(m);
    // With NIA TTS disabled the provider ends at complete:true, without AgentEndPlay.
    // Final validation must still run before the external voice can start.
    if(voice&&m.type==='ResponseEndTextStream'&&m.complete===true&&current===turn&&gate.accepted&&!gate.rejected){
     current.modelFinished=true;gate.push({type:'AgentEndPlay'});
    }
   }
   return;
  }
  if(m.type==='Report'&&(m.level==='error'||Number(m.code)>=400)||m.type==='ResponseBlocked'){
   const t=turn;if(t){t.controller.abort();send({...m,turn_id:t.id});turn=null;}else send(m);return;
  }
  send(m);
 });
 upstream.on('error',()=>{send({type:'LocalError',message:'实时AI DM连接失败，请检查网络或服务权限；本地调查仍可继续。'});client.close(1000);});
 upstream.on('close',()=>{if(!closed&&client.readyState===WebSocket.OPEN){send({type:'LocalError',message:'实时AI DM已断开，请重新连接。'});client.close(1000);}});
 client.on('message',raw=>{
  let m;try{m=JSON.parse(raw.toString());}catch{return;}
  if(!m||typeof m!=='object'||Array.isArray(m))return;
  const request_id=typeof m.request_id==='string'?m.request_id.slice(0,80):undefined;
  switch(m.type){
   case 'GameContext':context=normalizeDiningContext(m);if(m.update)forward({type:'SetSystemPrompt',system_prompt:diningPrompt(context),request_id});break;
   case 'CreateSession':forward({type:m.type,request_id});break;
   case 'ConfigPipeline':forward({type:m.type,custom_config:diningPipeline(context,{externalVoice:Boolean(voice)}),request_id});break;
   case 'ConfigASR':forward({type:m.type,enable:false,request_id});break;
   case 'StartServing':case 'Pong':forward({type:m.type});break;
   case 'InterruptAgent':reset();forward({type:m.type});break;
   case 'SpeakOpening':{
    const t=startTurn(request_id);opening=!voice;const text=diningOpening(),index='dining-opening-'+Date.now();
    sendTurn({type:'ResponseStartTextStream',index,source:'opening'},t);sendTurn({type:'ResponseTextSegment',index,text},t);sendTurn({type:'ResponseEndTextStream',index,text,complete:true},t);
    if(voice)void finishVoice(t,text);else forward({type:'PostSayIt',text,add_history:false,request_id});break;
   }
   case 'PostMultimodalGenerate':if(typeof m.text==='string'&&m.text.trim()&&m.text.length<=1200){startTurn(request_id);lastInput=m.text.trim();forward({type:'SetSystemPrompt',system_prompt:diningPrompt(context)});forward({type:m.type,text:diningGenerationInput(lastInput,context),request_id});}break;
  }
 });
 const cleanup=()=>{closed=true;retire();clearTimeout(timeout);clearTimeout(expires);if(retryTimer)clearTimeout(retryTimer);upstream.close();};
 client.on('error',cleanup);client.on('close',cleanup);
}
