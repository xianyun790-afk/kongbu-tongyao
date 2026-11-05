import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumeDmInviteToken} from '../src/dining-loop/dm-invite.ts';
function fixture(url,saved=''){
 let current=url;const values=new Map(saved?[['kongbu-tongyao.dm-invite',saved]]:[]);
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 return{environment:{url,replaceUrl:value=>{current=value;},storage},values,current:()=>current};
}
test('invite token is consumed from the fragment while unrelated URL fields stay intact',()=>{
 const f=fixture('https://game.test/kongbu-tongyao/?act=2#chapter-two&dm_token=invite%2B%2F%3D&view=quiet%20mode');
 assert.equal(consumeDmInviteToken(f.environment),'invite+/=');assert.equal(f.current(),'https://game.test/kongbu-tongyao/?act=2#chapter-two&view=quiet%20mode');assert.equal(f.values.get('kongbu-tongyao.dm-invite'),'invite+/=');
});
test('a token-only fragment disappears and the session survives a refresh',()=>{
 const f=fixture('https://game.test/#dm_token=fixture');assert.equal(consumeDmInviteToken(f.environment),'fixture');assert.equal(f.current(),'https://game.test/');
 assert.equal(consumeDmInviteToken({...f.environment,url:f.current()}),'fixture');
});
test('token scrubbing precedes storage and blocked storage still permits this visit',()=>{
 let scrubbed=false;const storage={getItem(){throw new Error('blocked');},setItem(){assert.equal(scrubbed,true);throw new Error('blocked');},removeItem(){}};
 assert.equal(consumeDmInviteToken({url:'https://game.test/#dm_token=fixture',replaceUrl:()=>{scrubbed=true;},storage}),'fixture');assert.equal(scrubbed,true);
});
test('empty or malformed supplied tokens replace a stale session token and get scrubbed',()=>{
 for(const token of ['','line%0Abreak','x'.repeat(513)]){const f=fixture('https://game.test/#dm_token='+token,'stale');assert.equal(consumeDmInviteToken(f.environment),'');assert.equal(f.values.size,0);assert.equal(f.current(),'https://game.test/');}
});
