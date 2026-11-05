const STORAGE_KEY='kongbu-tongyao.dm-invite';
type InviteEnvironment={url:string;replaceUrl:(url:string)=>void;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>};
const clean=(value:unknown)=>typeof value==='string'&&value.length<=256&&!/[\s\u0000-\u001f\u007f]/.test(value)?value:'';

/** The invite stays out of HTTP page requests and is removed from the address immediately. */
export function consumeDmInviteToken(environment:InviteEnvironment):string{
 const url=new URL(environment.url),retained:string[]=[];let supplied=false,token='';
 for(const field of url.hash.slice(1).split('&')){
  const params=new URLSearchParams(field);
  if(params.has('dm_token')){supplied=true;token=clean(params.get('dm_token'));}else retained.push(field);
 }
 if(supplied){
  url.hash=retained.join('&');environment.replaceUrl(url.href);
  try{if(token)environment.storage.setItem(STORAGE_KEY,token);else environment.storage.removeItem(STORAGE_KEY);}catch{}
  return token;
 }
 try{return clean(environment.storage.getItem(STORAGE_KEY));}catch{return '';}
}
export function browserDmInviteToken():string{
 if(typeof window==='undefined')return '';
 return consumeDmInviteToken({url:window.location.href,replaceUrl:url=>window.history.replaceState(window.history.state,'',url),storage:{
  getItem:key=>window.sessionStorage.getItem(key),setItem:(key,value)=>window.sessionStorage.setItem(key,value),removeItem:key=>window.sessionStorage.removeItem(key),
 }});
}
