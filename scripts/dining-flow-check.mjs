import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';

// Run with: node --test scripts/dining-flow-check.mjs
// Compile the real TypeScript modules in an isolated browser-like context.
// This checks the authored rules and save recovery without a browser or server.
const nativeRequire=createRequire(import.meta.url);
const storyPath=new URL('../src/dining-loop/story.ts',import.meta.url);
const savePath=new URL('../src/dining-loop/save.ts',import.meta.url);
const publicContent=JSON.parse(readFileSync(new URL('../config/dining-loop-public.json',import.meta.url),'utf8'));
const all=['A01','A02','A03'];

function compileModule(url,imports={},globals={}){
 const filename=fileURLToPath(url);
 const code=ts.transpileModule(readFileSync(url,'utf8'),{
  fileName:filename,
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true},
 }).outputText;
 const module={exports:{}};
 const context=vm.createContext({
  module,exports:module.exports,
  require:id=>Object.hasOwn(imports,id)?imports[id]:nativeRequire(id),
  crypto:{randomUUID},URLSearchParams,...globals,
 });
 new vm.Script(code,{filename}).runInContext(context);
 return module.exports;
}

const story=compileModule(storyPath,{'../../config/dining-loop-public.json':publicContent});
const plain=value=>JSON.parse(JSON.stringify(value));

// The original 25 grading boundaries: 11 false conclusions, 11 valid
// formulations/qualified hypotheses, and 3 empty/release/citation controls.
const rejected=[
 ['explicit denial of deleted name','小满没有被删去'],
 ['denial inside the broadcast copy','广播中小满没有被删去'],
 ['denial referring to the name','小满，这个称呼并没有被删掉'],
 ['unsupported definite editor','是小满，许知音剪辑了广播'],
 ['unsupported editor identity','小满，许知音就是剪辑者'],
 ['unsupported deletion identity','小满，删名者就是梁素琴'],
 ['definite short-name editor','小满，是许剪的'],
 ['another named editor','小满，顾怀山把广播删掉了'],
 ['old recording asserted as tonight arrival','小满今晚到场'],
 ['seventh arrival asserted as tonight truth','今晚的第七个人就是小满'],
 ['explicitly excluded correct name','不是小满'],
];
for(const [label,answer] of rejected)test(`deduction rejects ${label}`,()=>{
 const result=story.evaluateDeduction(answer,all,all);
 assert.equal(result.ok,false,answer);
 assert.notEqual(result.kind,'success');
 assert.ok(result.missing.length>0,'rejected conclusions need actionable feedback');
});

const accepted=[
 ['the recovered name','小满'],
 ['the full recovered name','白小满'],
 ['a comparison of the two versions','缺失称呼是小满；原带保留了称呼，广播副本缺少了它。'],
 ['an intact original recording','原带里的小满没有被删去，广播副本缺少这个称呼。'],
 ['an intact original tape','原磁带中的小满没有被删掉，副本少了这段称呼。'],
 ['an editor claim explicitly left unproven','是小满，不能认定许剪的。'],
 ['an editor hypothesis','小满，可能是许知音剪辑了广播。'],
 ['a negated editor accusation','是小满，我不认为是许剪的。'],
 ['skill without proof of action','小满，许知音会剪辑广播。'],
 ['tonight arrival explicitly left unproven','小满，不能证明小满今晚到场。'],
 ['a question about tonight arrival','小满，第七人是否今晚到场仍待核实。'],
];
for(const [label,answer] of accepted)test(`deduction accepts ${label}`,()=>{
 const result=story.evaluateDeduction(answer,all,all);
 assert.equal(result.ok,true,answer);
 assert.equal(result.kind,'success');
 assert.equal(result.missing.length,0);
 assert.equal(result.supported.length,2,'the success explains both evidence relationships');
});

test('deduction control: empty input cannot complete',()=>{
 const result=story.evaluateDeduction(' \n ',all,all);
 assert.equal(result.ok,false);assert.equal(result.kind,'retry');
 assert.match(result.body,/写下名字/);
});
test('deduction control: the name with an incomplete citation set cannot complete',()=>{
 const result=story.evaluateDeduction('小满',['A01','A02'],all);
 assert.equal(result.ok,false);assert.match(result.missing.join(' '),/A03/);
});
test('deduction control: citing unreleased groups cannot complete',()=>{
 const result=story.evaluateDeduction('小满',all,['A01']);
 assert.equal(result.ok,false);assert.equal(result.supported.length,1);
 assert.match(result.missing.join(' '),/原带还没有公开/);
 assert.match(result.missing.join(' '),/A03/);
});

function saveFixture(search=''){
 const values=new Map();let failRead=false,failWrite=false;
 const localStorage={
  getItem:key=>{if(failRead)throw Error('storage unavailable');return values.get(key)??null;},
  setItem:(key,value)=>{if(failWrite)throw Error('quota exceeded');values.set(key,String(value));},
 };
 const api=compileModule(savePath,{'./story':story},{location:{search},localStorage});
 return {
  ...api,
  put:value=>values.set(api.SAVE_KEY,JSON.stringify(value)),
  raw:()=>JSON.parse(values.get(api.SAVE_KEY)||'null'),
  failRead:()=>{failRead=true;},failWrite:()=>{failWrite=true;},
 };
}
function solvedSave(fixture,patch={}){
 return {...fixture.freshSave(),started:true,found:[...all],sharedListening:true,stoolTurned:true,
  answer:'原带里的小满没有被删去，广播副本缺少这个称呼。',citations:[...all],complete:true,...patch};
}

test('save recovery: a new save has no released group or completion',()=>{
 const f=saveFixture();const recovered=plain(f.loadSave());
 assert.deepEqual(recovered,plain(f.freshSave()));
 assert.deepEqual(recovered.found,[]);assert.equal(recovered.complete,false);
});
test('save recovery: A02 cannot restore before shared listening',()=>{
 const f=saveFixture();f.put(solvedSave(f,{sharedListening:false}));const saved=plain(f.loadSave());
 assert.equal(saved.sharedListening,false);assert.deepEqual(saved.found,['A01','A03']);
 assert.deepEqual(saved.citations,['A01','A03']);assert.equal(saved.complete,false);
});
test('save recovery: A03 cannot restore before the stool was turned',()=>{
 const f=saveFixture();f.put(solvedSave(f,{stoolTurned:false}));const saved=plain(f.loadSave());
 assert.equal(saved.stoolTurned,false);assert.deepEqual(saved.found,['A01','A02']);
 assert.deepEqual(saved.citations,['A01','A02']);assert.equal(saved.complete,false);
});
test('save persistence: unfinished or empty DM lines are not written',()=>{
 const f=saveFixture();const saved=solvedSave(f,{log:[
  {id:'you',who:'you',text:'这个缺口是什么？',complete:true},
  {id:'opening',who:'dm',text:'欢迎来到白榆餐厅。',complete:true,source:'opening'},
  {id:'done',who:'dm',text:'先比较两段声音。',complete:true,source:'ai'},
  {id:'local',who:'dm',text:'本地主持提示 · 备用：先核对广播。',complete:true,source:'local-guidance'},
  {id:'streaming',who:'dm',text:'尚未说完的',complete:false,source:'ai'},
  {id:'empty',who:'dm',text:'',complete:true,source:'ai'},
 ]});
 assert.equal(f.persistSave(saved),true);
 assert.deepEqual(f.raw().log.map(line=>line.id),['you','opening','done','local']);
 assert.deepEqual(plain(f.loadSave()).log.map(line=>line.id),['you','opening','done','local']);
});
test('save recovery: legacy unfinished DM lines are also discarded',()=>{
 const f=saveFixture();f.put(solvedSave(f,{log:[
  {id:'player',who:'you',text:'我认为是小满。',complete:true},
  {id:'unfinished',who:'dm',text:'旧存档中的半句',complete:false,source:'ai'},
  {id:'complete',who:'dm',text:'材料已经公开。',complete:true,source:'ai'},
 ]}));
 assert.deepEqual(plain(f.loadSave()).log.map(line=>line.id),['player','complete']);
});
test('save recovery: a wrong answer cannot restore completed status',()=>{
 const f=saveFixture();f.put(solvedSave(f,{answer:'缺失称呼是梁素琴。'}));
 const saved=f.loadSave();assert.equal(saved.complete,false);assert.equal(saved.answer,'缺失称呼是梁素琴。');
});
test('save recovery: a contradictory answer cannot restore completed status',()=>{
 const f=saveFixture();f.put(solvedSave(f,{answer:'小满没有被删去。'}));assert.equal(f.loadSave().complete,false);
});
test('save recovery: incomplete citations cannot restore completed status',()=>{
 const f=saveFixture();f.put(solvedSave(f,{citations:['A01','A02']}));
 const saved=plain(f.loadSave());assert.equal(saved.complete,false);assert.deepEqual(saved.citations,['A01','A02']);
});
test('save recovery: a normal solved round restores with its evidence and answer',()=>{
 const f=saveFixture();const solved=solvedSave(f);assert.equal(f.persistSave(solved),true);
 const saved=plain(f.loadSave());assert.equal(saved.complete,true);
 assert.deepEqual(saved,plain(solved));
});
test('save recovery: valid but unsubmitted work does not become completed',()=>{
 const f=saveFixture();f.put(solvedSave(f,{complete:false}));assert.equal(f.loadSave().complete,false);
});
test('save recovery: duplicate and unknown groups do not supply missing evidence',()=>{
 const f=saveFixture();f.put(solvedSave(f,{found:['A01','A01','private','B01',42],citations:['A01','A02','A03','private']}));
 const saved=plain(f.loadSave());assert.deepEqual(saved.found,['A01']);
 assert.deepEqual(saved.citations,['A01']);assert.equal(saved.complete,false);
});
test('save recovery: unsupported version and malformed data return a fresh round',()=>{
 const f=saveFixture();
 for(const value of [null,[],{},solvedSave(f,{version:2})]){
  f.put(value);assert.deepEqual(plain(f.loadSave()),plain(f.freshSave()));
 }
});
test('save storage: denied reads recover safely and failed writes report failure',()=>{
 const f=saveFixture();f.failRead();assert.deepEqual(plain(f.loadSave()),plain(f.freshSave()));
 f.failWrite();assert.equal(f.persistSave(f.freshSave()),false);
});
