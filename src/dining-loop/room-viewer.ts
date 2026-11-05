import {publicAsset} from './demo-mode';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {DoorEntrance,ENTRY_DURATION} from './door-entrance';
import {createDiningDoor} from './room-door';
import {prepareOfficeWeather} from './office-weather';
import {RoomCameraBoundary} from './camera-boundary';
import {officeCameraObstacles,OFFICE_MIN_DISTANCE} from './office-camera';

export type TargetId='radio'|'tape'|'stool'|'duty'|'dm';
export type RoomId='dining'|'office';
export type SceneTargetId=TargetId|'office-door'|'dining-door'|'ledger'|'computer'|'victim'|'coffee';
export type Point=[number,number,number];
type Shot={position:Point;target:Point;fov?:number};
export type RoomInteraction={id:SceneTargetId;objectNames:string[];anchor:Point;focus:Shot};
export type RoomManifest={version:string;model:string;opening:Shot;interactions:RoomInteraction[];interiorBounds?:{min:Point;max:Point}};
type Options={onReady:(manifest:RoomManifest)=>void;onProgress:(progress:number)=>void;onError:(message:string)=>void;onPick:(id:SceneTargetId)=>void;onMove?:()=>void};
type Tween={start:number;fromPosition:THREE.Vector3;fromTarget:THREE.Vector3;fromFov:number;to:Shot};
const LABELS:Record<SceneTargetId,string>={radio:'旧广播',tape:'许知音的磁带',stool:'儿童小凳',duty:'旧值日表',dm:'主持播放器','office-door':'大厅 · 上楼去值班室','dining-door':'离开值班室，返回餐厅',ledger:'窗下名册',computer:'离线台机',victim:'桌旁现场',coffee:'倾倒的瓷杯'};
// The player's selected opening composition; keep the exported asset camera intact.
const OPENING_SHOT:Shot={position:[2.12,2.46,1.64],target:[-.95,1.38,-.69],fov:43};

/** The room, picking and camera are real 3D; labels remain normal accessible buttons. */
export class DiningRoomViewer{
 private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(45,1,.025,80);
 private renderer:THREE.WebGLRenderer;private controls:OrbitControls;private group:THREE.Group|null=null;
 private manifest:RoomManifest|null=null;private resizeObserver:ResizeObserver;private frame=0;private disposed=false;
 private tween:Tween|null=null;private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();private down:{x:number;y:number;id:number;moved:boolean}|null=null;
 private pointers=new Map<number,{x:number;y:number}>();
 private pickMap=new WeakMap<THREE.Object3D,SceneTargetId>();private labelElements=new Map<SceneTargetId,HTMLButtonElement>();
 private abort=new AbortController();private environment:THREE.WebGLRenderTarget|null=null;private labelsEnabled=false;
 private draco:DRACOLoader|null=null;
 private diningWorld=new THREE.Group();private officeWorld:THREE.Group|null=null;private diningGroup:THREE.Group|null=null;private officeGroup:THREE.Group|null=null;
 private diningManifest:RoomManifest|null=null;private officeManifest:RoomManifest|null=null;private officeLoading:Promise<void>|null=null;private currentRoom:RoomId='dining';
 private hallLeaf:THREE.Group|null=null;private hallOpen=0;private hallDesired=false;
 private reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 private lastRender=0;private width=1;private height=1;private targetId:SceneTargetId|null=null;
 private rain:THREE.LineSegments|null=null;private rainSeeds:Float32Array|null=null;
 private officeWeather:ReturnType<typeof prepareOfficeWeather>|null=null;
 private officeBoundary:RoomCameraBoundary|null=null;
 private hotspotRay=new THREE.Raycaster();
 private officeOccluders:THREE.Object3D[]=[];
 private stoolPivot:THREE.Group|null=null;private stoolCenter=new THREE.Vector3();private stoolTurn=0;private stoolDesired=false;
 private entrance:DoorEntrance|null=null;private entranceStart:number|null=null;private entranceComplete:(()=>void)|null=null;
 constructor(private host:HTMLElement,private labels:HTMLElement,private options:Options){
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.84;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.scene.background=new THREE.Color('#14191c');this.scene.fog=new THREE.Fog('#14191c',12,25);
  this.renderer.domElement.setAttribute('aria-label','可拖动环顾的白榆餐厅三维场景');
  this.renderer.domElement.setAttribute('role','img');this.host.append(this.renderer.domElement);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.085;
  this.controls.enablePan=false;this.controls.minDistance=.3;this.controls.maxDistance=9;
  this.controls.minPolarAngle=.33;this.controls.maxPolarAngle=Math.PI*.51;
  this.controls.minAzimuthAngle=-.45;this.controls.maxAzimuthAngle=1.6;
  this.controls.rotateSpeed=.5;this.controls.zoomSpeed=.65;this.controls.enabled=false;
  this.controls.addEventListener('start',this.onControlStart);
  this.renderer.domElement.addEventListener('pointerdown',this.onDown);
  this.renderer.domElement.addEventListener('pointerup',this.onUp);
  this.renderer.domElement.addEventListener('pointermove',this.onHover);
  this.renderer.domElement.addEventListener('pointercancel',this.onPointerCancel);
  this.renderer.domElement.addEventListener('wheel',this.onWheel,{passive:true});
  this.renderer.domElement.addEventListener('webglcontextlost',this.onContextLost);
  this.resizeObserver=new ResizeObserver(this.resize);this.resizeObserver.observe(this.host);this.resize();
  void this.load();this.animate(0);
 }
 private resize=()=>{
  if(this.disposed)return;const rect=this.host.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);
  this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();
 };
 private onContextLost=(event:Event)=>{
  event.preventDefault();this.entranceComplete=null;this.entranceStart=null;this.setInteractive(false);
  if(!this.disposed)this.options.onError('三维画面连接中断，请重新载入场景。调查进度已经保留。');
 };
 private async load(){
  try{
   const base=publicAsset('models/dining-loop/');const response=await fetch(base+'room-manifest.json',{signal:this.abort.signal});
   if(!response.ok)throw new Error('餐厅场景正在准备，请稍后重试。');
   const manifest=await response.json() as RoomManifest;
   if(!manifest.opening||!Array.isArray(manifest.interactions))throw new Error('场景配置不完整，请重新载入。');
   this.draco=new DRACOLoader();this.draco.setDecoderPath(publicAsset('draco/'));
   const loader=new GLTFLoader();loader.setDRACOLoader(this.draco);const gltf=await loader.loadAsync(base+manifest.model,event=>{
    if(!this.disposed)this.options.onProgress(event.total>0?Math.min(.97,event.loaded/event.total):Math.min(.9,event.loaded/25000000));
   });
   if(this.disposed){this.disposeObject(gltf.scene);return;}
   this.manifest=manifest;this.diningManifest=manifest;this.group=gltf.scene;this.diningGroup=this.group;this.diningWorld.add(this.group);this.scene.add(this.diningWorld);
   this.group.traverse(object=>{if(object instanceof THREE.Mesh){
    object.castShadow=!/glass|translucent|flame/i.test(object.name);object.receiveShadow=true;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
     // Broader reflections keep old silver legible without a white mirror finish.
     if(material instanceof THREE.MeshStandardMaterial&&/silver/i.test(material.name))material.roughness=Math.max(.5,material.roughness);
    }
   }});
   const pmrem=new THREE.PMREMGenerator(this.renderer);const room=new RoomEnvironment();
   this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.13;
   room.dispose();pmrem.dispose();this.addLights();
   this.addRain();
   this.camera.position.fromArray(OPENING_SHOT.position);this.controls.target.fromArray(OPENING_SHOT.target);
   this.camera.fov=OPENING_SHOT.fov??45;this.camera.updateProjectionMatrix();this.controls.update();
   const doorway=createDiningDoor();this.group.add(doorway.group);this.hallLeaf=doorway.leaf;
   manifest.interactions.push({id:'office-door',objectNames:[doorway.group.name],anchor:doorway.anchor,focus:{position:[-1.5,1.65,1.1],target:[-3.4,1.3,.85],fov:43}});
   this.bindInteractions(manifest,this.group);
   const stool=this.group.getObjectByName('ROOM_props__stool');
   if(stool){new THREE.Box3().setFromObject(stool).getCenter(this.stoolCenter);this.stoolPivot=new THREE.Group();this.stoolPivot.position.copy(this.stoolCenter);this.group.add(this.stoolPivot);this.stoolPivot.attach(stool);}
   this.showEntrance();this.options.onProgress(1);this.options.onReady(manifest);
  }catch(error){if(!this.disposed&&!(error instanceof DOMException&&error.name==='AbortError'))this.options.onError(error instanceof Error?error.message:'餐厅加载失败，请重试。');}
 }
 private bindInteractions(manifest:RoomManifest,group:THREE.Group){
  for(const item of manifest.interactions){
   for(const name of item.objectNames){const object=group.getObjectByName(name);object?.traverse(child=>this.pickMap.set(child,item.id));}
   if(this.labelElements.has(item.id))continue;
   const button=document.createElement('button');button.type='button';button.className='dl-hotspot';button.dataset.target=item.id;
   button.setAttribute('aria-label',(item.id.endsWith('-door')?'前往':'查看')+LABELS[item.id]);
   const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=LABELS[item.id];button.append(dot,label);
   button.addEventListener('click',()=>{if(this.labelsEnabled)this.options.onPick(item.id);});this.labels.append(button);this.labelElements.set(item.id,button);
  }
 }
 /** Load a separate real mesh scene. A failed request can be retried without losing dining progress. */
 preloadOffice(){
  if(this.officeGroup)return Promise.resolve();if(this.officeLoading)return this.officeLoading;
  this.officeLoading=this.loadOffice().finally(()=>{this.officeLoading=null;});return this.officeLoading;
 }
 private async loadOffice(){
  const response=await fetch(publicAsset('models/dining-loop/office-manifest.json'),{signal:this.abort.signal});
  if(!response.ok)throw new Error('值班室模型暂未载入，可以返回餐厅或重试。');
  const raw=await response.json();
  const manifest={...raw,interactions:(raw.interactions??[]).map((item:Omit<RoomInteraction,'id'>&{id:string})=>({...item,id:item.id==='return'?'dining-door':item.id}))} as RoomManifest;
  if(!manifest.opening||!Array.isArray(manifest.interactions))throw new Error('值班室场景配置不完整。');
  const bounds=manifest.interiorBounds??{min:[-2.6,0,-2.5],max:[2.6,3.3,2.5]};
  this.officeBoundary=new RoomCameraBoundary(new THREE.Vector3(...bounds.min),new THREE.Vector3(...bounds.max),officeCameraObstacles());
  const loader=new GLTFLoader();if(this.draco)loader.setDRACOLoader(this.draco);
  const gltf=await loader.loadAsync(publicAsset('models/dining-loop/')+manifest.model,event=>{if(!this.disposed)this.options.onProgress(event.total?Math.min(.97,event.loaded/event.total):.5);});
  if(this.disposed){this.disposeObject(gltf.scene);throw new DOMException('Scene closed','AbortError');}
  gltf.scene.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=!/glass|translucent|window/i.test(object.name);object.receiveShadow=true;}});
  const world=new THREE.Group();world.add(gltf.scene);world.visible=false;
  this.officeOccluders=['OFFICE_architecture__static','OFFICE_architecture__return'].flatMap(name=>{const mesh=gltf.scene.getObjectByName(name);return mesh?[mesh]:[];});
  this.officeWeather=prepareOfficeWeather(gltf.scene,world,this.reduced);
  // Keep the window cool and the desk readable, with less fill on the empty walls.
  world.add(new THREE.HemisphereLight(0x8699b5,0x171411,.44));
  const moon=new THREE.DirectionalLight(0x9db8d6,1.2);moon.position.set(1.2,3,-3.5);moon.target.position.set(0,1,0);world.add(moon,moon.target);
  const bounce=new THREE.PointLight(0xe4c299,1.45,5.5,2);bounce.position.set(.6,2.7,1.6);world.add(bounce);
  const desk=new THREE.PointLight(0xffc98b,1.7,4,2);desk.position.set(.6,1.5,-1.2);desk.castShadow=true;desk.shadow.mapSize.set(1024,1024);desk.shadow.radius=6;desk.shadow.intensity=.72;desk.shadow.bias=-.0002;desk.shadow.normalBias=.01;world.add(desk);
  this.officeGroup=gltf.scene;this.officeManifest=manifest;this.officeWorld=world;this.scene.add(world);this.bindInteractions(manifest,gltf.scene);this.options.onProgress(1);
 }
 openConnectionDoor(){this.hallDesired=true;this.focus(this.currentRoom==='dining'?'office-door':'dining-door');this.setInteractive(false);}
 showRoom(room:RoomId){
  const group=room==='dining'?this.diningGroup:this.officeGroup,manifest=room==='dining'?this.diningManifest:this.officeManifest;
  if(!group||!manifest||this.disposed)return false;
  this.currentRoom=room;this.group=group;this.manifest=manifest;this.diningWorld.visible=room==='dining';if(this.officeWorld)this.officeWorld.visible=room==='office';
  this.hallDesired=false;this.targetId=null;this.tween=null;for(const button of this.labelElements.values()){button.style.visibility='hidden';button.classList.remove('is-selected');}
  this.controls.minAzimuthAngle=room==='dining'?-.45:-Infinity;this.controls.maxAzimuthAngle=room==='dining'?1.6:Infinity;
  this.controls.minDistance=room==='dining'?.3:OFFICE_MIN_DISTANCE;
  this.controls.minPolarAngle=room==='dining'?.33:.25;this.controls.maxPolarAngle=room==='dining'?Math.PI*.51:1.48;this.controls.maxDistance=room==='dining'?9:5.3;
  this.scene.environmentIntensity=room==='dining'?.13:.16;this.renderer.toneMappingExposure=room==='dining'?.84:.94;
  this.renderer.domElement.setAttribute('aria-label',room==='dining'?'可拖动环顾的白榆餐厅三维场景':'可拖动环顾的二楼值班室三维场景');
  this.officeBoundary?.reset();
  const shot=room==='dining'?OPENING_SHOT:manifest.opening;this.camera.position.fromArray(shot.position);this.controls.target.fromArray(shot.target);this.camera.fov=shot.fov??45;this.camera.updateProjectionMatrix();this.controls.update();return true;
 }
 private addLights(){
  const hemi=new THREE.HemisphereLight(0x8195b1,0x241811,.36);this.diningWorld.add(hemi);
  const cool=new THREE.DirectionalLight(0x8ca8d0,.9);cool.position.set(2.4,3,-2.7);cool.target.position.set(-.4,.8,.2);this.diningWorld.add(cool,cool.target);
  // The light sits above the flames, rather than inside the metal stem.
  const candle=new THREE.PointLight(0xffbb72,3.5,5,2);candle.position.set(-.35,1.43,.15);candle.castShadow=true;
  candle.shadow.mapSize.set(1024,1024);candle.shadow.radius=7;candle.shadow.intensity=.68;
  candle.shadow.bias=-.0002;candle.shadow.normalBias=.009;candle.shadow.camera.near=.04;
  this.diningWorld.add(candle);
  // Restrained practical pools leave the corners cool without flattening the room.
  const lamp=new THREE.PointLight(0xffcb91,1.8,3.8,2);lamp.position.set(-2.14,1.5,-2.18);this.diningWorld.add(lamp);
  const wallCandles=new THREE.PointLight(0xffb969,.6,2.6,2);wallCandles.position.set(-2.68,2.47,-2.28);this.diningWorld.add(wallCandles);
  const bounce=new THREE.PointLight(0xe3bd94,.85,5,2);bounce.position.set(.8,2.4,2.6);this.diningWorld.add(bounce);
 }
 private addRain(){
  const count=110,vertices=new Float32Array(count*6),seeds=new Float32Array(count*4);
  for(let i=0;i<count;i++){seeds[i*4]=.8+Math.random()*2.1;seeds[i*4+1]=Math.random()*4.5;seeds[i*4+2]=-3-Math.random()*.85;seeds[i*4+3]=.6+Math.random()*.9;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
  this.rain=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xb5c7dd,transparent:true,opacity:.34,depthWrite:false}));
  this.rain.frustumCulled=false;this.diningWorld.add(this.rain);this.rainSeeds=seeds;
 }
 private lookup(object:THREE.Object3D|null):SceneTargetId|null{while(object){const id=this.pickMap.get(object);if(id)return id;object=object.parent;}return null;}
 private hit(event:PointerEvent){
  if(!this.group)return null;const rect=this.renderer.domElement.getBoundingClientRect();
  this.pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);
  const hit=this.ray.intersectObject(this.group,true)[0];return hit?this.lookup(hit.object):null;
 }
 private releaseOfficeSelection(){
  if(this.currentRoom!=='office'||!this.controls.enabled||!this.targetId)return;
  this.targetId=null;this.controls.maxDistance=5.3;
  for(const button of this.labelElements.values())button.classList.remove('is-selected');
 }
 private onDown=(event:PointerEvent)=>{
  this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(!this.down)this.down={x:event.clientX,y:event.clientY,id:event.pointerId,moved:false};else this.down.moved=true;
 };
 private onUp=(event:PointerEvent)=>{
  this.pointers.delete(event.pointerId);
  const down=this.down;if(!down||down.id!==event.pointerId)return;this.down=null;
  if(this.labelsEnabled&&!down.moved&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6){const id=this.hit(event);if(id)this.options.onPick(id);}
 };
 private onPointerCancel=(event:PointerEvent)=>{this.pointers.delete(event.pointerId);if(this.down?.id===event.pointerId)this.down=null;};
 private onWheel=(event:WheelEvent)=>{if(event.deltaX||event.deltaY)this.releaseOfficeSelection();};
 private onHover=(event:PointerEvent)=>{
  const start=this.pointers.get(event.pointerId);
  if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>=6){if(this.down)this.down.moved=true;this.releaseOfficeSelection();}
  if(!this.labelsEnabled)return;this.renderer.domElement.style.cursor=this.hit(event)?'pointer':'grab';
 };
 private onControlStart=()=>{this.tween=null;this.options.onMove?.();};
 setInteractive(enabled:boolean){enabled=enabled&&!this.entrance;this.labelsEnabled=enabled;this.controls.enabled=enabled;if(!enabled){this.down=null;this.pointers.clear();}this.labels.classList.toggle('is-enabled',enabled);}
 showEntrance(){
  this.entranceComplete=null;this.entranceStart=null;this.entrance?.dispose();this.entrance=new DoorEntrance();
  this.tween=null;this.targetId=null;this.setInteractive(false);
 }
 beginEntrance(onComplete:()=>void){
  if(!this.manifest||this.disposed)return;
  if(!this.entrance)this.showEntrance();
  this.entranceComplete=onComplete;this.entranceStart=performance.now();this.setInteractive(false);
  if(this.reduced)this.skipEntrance();
 }
 skipEntrance(){
  if(!this.entrance)return;const completed=this.entranceComplete;
  this.entranceComplete=null;this.entranceStart=null;this.entrance.dispose();this.entrance=null;this.tween=null;
  this.camera.position.fromArray(OPENING_SHOT.position);this.controls.target.fromArray(OPENING_SHOT.target);
  this.camera.fov=OPENING_SHOT.fov??43;this.camera.updateProjectionMatrix();this.controls.update();completed?.();
 }
 setFound(found:string[]){for(const[id,el]of this.labelElements)el.classList.toggle('is-found',found.includes(id==='radio'?'A01':id==='tape'?'A02':id==='stool'||id==='duty'?'A03':''));}
 inspectStoolBottom(show:boolean){if(this.stoolDesired===show)return;this.stoolDesired=show;if(show)this.focus('stool');}
 focus(id:SceneTargetId|null,instant=false){
  if(!this.manifest||this.entrance)return;this.targetId=id;
  let to=id?this.manifest.interactions.find(item=>item.id===id)?.focus:this.currentRoom==='dining'?OPENING_SHOT:this.manifest.opening;if(!to)return;
  if(id==='stool'&&this.stoolDesired)to={position:[1.55,1.5,1.9],target:[.82,.72,.84],fov:37};
  this.controls.maxDistance=id?5:this.currentRoom==='dining'?9:5.3;
  if(this.currentRoom==='office')this.officeBoundary?.reset();
  for(const[key,button]of this.labelElements)button.classList.toggle('is-selected',key===id);
  this.tween={start:performance.now(),fromPosition:this.camera.position.clone(),fromTarget:this.controls.target.clone(),fromFov:this.camera.fov,to};
  if(instant||this.reduced)this.tween.start-=700;
 }
 private animate=(time:number)=>{
  if(this.disposed)return;this.frame=requestAnimationFrame(this.animate);
  if(time-this.lastRender<1000/45)return;this.lastRender=time;
  if(this.hallLeaf){this.hallOpen=THREE.MathUtils.lerp(this.hallOpen,this.hallDesired?1:0,this.reduced?1:.12);this.hallLeaf.rotation.y=-1.4*this.hallOpen;}
  if(this.currentRoom==='dining'&&this.rain&&this.rainSeeds){const attribute=this.rain.geometry.getAttribute('position') as THREE.BufferAttribute,a=attribute.array as Float32Array;
   for(let i=0;i<this.rainSeeds.length/4;i++){const j=i*4,k=i*6,y=3.9-((this.rainSeeds[j+1]+time*.0018*this.rainSeeds[j+3])%4.5);a[k]=this.rainSeeds[j];a[k+1]=y;a[k+2]=this.rainSeeds[j+2];a[k+3]=a[k]+.025;a[k+4]=y-.16;a[k+5]=a[k+2];}attribute.needsUpdate=true;}
  if(this.stoolPivot){this.stoolTurn=THREE.MathUtils.lerp(this.stoolTurn,this.stoolDesired?1:0,this.reduced?1:.14);this.stoolPivot.rotation.x=-Math.PI*this.stoolTurn;this.stoolPivot.position.y=this.stoolCenter.y+.45*this.stoolTurn;}
  if(this.currentRoom==='office')this.officeWeather?.update(time);
  const movingToShot=!!this.tween;
  if(this.tween){const t=Math.min(1,(time-this.tween.start)/680),ease=1-Math.pow(1-t,3);
   this.camera.position.lerpVectors(this.tween.fromPosition,new THREE.Vector3(...this.tween.to.position),ease);
   this.controls.target.lerpVectors(this.tween.fromTarget,new THREE.Vector3(...this.tween.to.target),ease);
   this.camera.fov=THREE.MathUtils.lerp(this.tween.fromFov,this.tween.to.fov??45,ease);this.camera.updateProjectionMatrix();if(t>=1)this.tween=null;
  }
  if(this.entrance){
   const elapsed=this.entranceStart===null?0:Math.max(0,time-this.entranceStart),progress=Math.min(1,elapsed/ENTRY_DURATION);
   if(elapsed>=ENTRY_DURATION+200)this.skipEntrance();
   else{
    this.entrance.update(progress,this.width/this.height);
    const push=THREE.MathUtils.smoothstep(progress,.42,1),remaining=1-push;
    this.camera.position.set(OPENING_SHOT.position[0]+.83*remaining,OPENING_SHOT.position[1]+.19*remaining,OPENING_SHOT.position[2]+.66*remaining);
    this.controls.target.fromArray(OPENING_SHOT.target);this.camera.fov=(OPENING_SHOT.fov??43)+3*remaining;this.camera.updateProjectionMatrix();
   }
  }
  this.controls.update();
  if(this.currentRoom==='office'&&!this.entrance&&this.officeBoundary?.constrain(this.camera.position,this.controls.target,this.controls.minDistance,this.controls.maxDistance,!movingToShot))this.camera.lookAt(this.controls.target);
  this.renderer.render(this.scene,this.camera);
  if(this.entrance){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.entrance.scene,this.entrance.camera);this.renderer.autoClear=true;}
  if(this.manifest)for(const item of this.manifest.interactions){
   const el=this.labelElements.get(item.id);if(!el)continue;const point=new THREE.Vector3(...item.anchor);if(item.id==='stool')point.y+=.45*this.stoolTurn;const projected=point.clone().project(this.camera);
   let visible=this.labelsEnabled&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<.93&&Math.abs(projected.y)<.87&&(!this.targetId||item.id===this.targetId);
   if(visible&&this.currentRoom==='office'){
    const direction=point.clone().sub(this.camera.position),distance=direction.length();
    this.hotspotRay.set(this.camera.position,direction.normalize());this.hotspotRay.far=Math.max(0,distance-.1);
    const obstruction=this.hotspotRay.intersectObjects(this.officeOccluders,true)[0];
    if(obstruction&&this.lookup(obstruction.object)!==item.id)visible=false;
   }
   el.style.visibility=visible?'visible':'hidden';el.style.transform=`translate(-50%,-50%) translate(${(projected.x+1)*this.width/2}px,${(1-projected.y)*this.height/2}px)`;
  }
 };
 private disposeObject(root:THREE.Object3D){const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();root.traverse(object=>{
  if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}
 });for(const material of materials){for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);material.dispose();}for(const texture of textures)texture.dispose();}
 destroy(){this.disposed=true;this.abort.abort();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.controls.dispose();
  this.entranceComplete=null;this.entranceStart=null;this.entrance?.dispose();this.entrance=null;
  this.renderer.domElement.removeEventListener('pointerdown',this.onDown);this.renderer.domElement.removeEventListener('pointerup',this.onUp);this.renderer.domElement.removeEventListener('pointermove',this.onHover);this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);
  this.renderer.domElement.removeEventListener('pointercancel',this.onPointerCancel);this.renderer.domElement.removeEventListener('wheel',this.onWheel);
  this.disposeObject(this.scene);this.draco?.dispose();this.environment?.dispose();this.renderer.dispose();this.renderer.domElement.remove();for(const el of this.labelElements.values())el.remove();this.labelElements.clear();}
}
