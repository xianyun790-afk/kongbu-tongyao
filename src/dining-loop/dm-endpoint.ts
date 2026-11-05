/** Public builds may call only an explicitly configured HTTPS relay. */
export function normalizeDmApiBase(value:unknown):string{
 if(typeof value!=='string'||!value.trim())return '';
 try{
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return '';
  return url.href.replace(/\/+$/,'');
 }catch{return '';}
}
export function dmEndpoints(base:string){
 const safe=normalizeDmApiBase(base);
 if(!safe)throw new Error('实时 AI DM 尚未配置 HTTPS 服务；可继续使用预设文字提示。');
 return {status:`${safe}/api/nia/status`,session:`${safe.replace(/^https:/,'wss:')}/api/nia/dining-session`};
}
