/** Server-only runtime for the public DM. Never imports a private role script. */
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';

export const DINING_MODEL='SenseNova-V7.0-omni';
// Kept only for NIA's pipeline schema; external TTS replaces this voice.
export const DINING_NIA_VOICE='male_ruyayichen_hs2';
export function loadDiningEnvironment(){
 let local='';try{local=readFileSync(new URL('../.env.local',import.meta.url),'utf8');}catch{}
 const values={};
 for(const line of local.split(/\r?\n/)){
  const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(!match)continue;
  values[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');
 }
 return {...values,...process.env};
}
export function loadDiningCredentials(){const env=loadDiningEnvironment();return {ak:env.NIA_ACCESS_KEY||'',sk:env.NIA_SECRET_KEY||''};}
export function createDiningJwt(ak,sk,now=Math.floor(Date.now()/1000)){
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iss:ak,exp:now+600,nbf:now-5});
 return body+'.'+createHmac('sha256',sk).update(body).digest('base64url');
}
