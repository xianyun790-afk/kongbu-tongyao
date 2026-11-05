import * as THREE from 'three';

export const ENTRY_DURATION=2300;

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(from:number,to:number,n:number)=>{const t=clamp((n-from)/(to-from));return t*t*(3-2*t);};

/** A real, open-backed doorway rendered over the existing dining-room scene. */
export class DoorEntrance {
 readonly scene=new THREE.Scene();
 readonly camera=new THREE.PerspectiveCamera(50,1,.035,45);
 private leaf=new THREE.Group();
 private geometries=new Set<THREE.BufferGeometry>();
 private materials=new Set<THREE.Material>();
 private textures=new Set<THREE.Texture>();
 private cube:THREE.BoxGeometry;
 private cylinder:THREE.CylinderGeometry;
 private sphere:THREE.SphereGeometry;
 private disposed=false;

 constructor(){
  this.cube=this.ownGeometry(new THREE.BoxGeometry(1,1,1));
  this.cylinder=this.ownGeometry(new THREE.CylinderGeometry(.5,.5,1,14));
  this.sphere=this.ownGeometry(new THREE.SphereGeometry(1,12,8));
  const woodMap=this.makeTexture('wood');
  const plasterMap=this.makeTexture('plaster');
  const oak=this.material({color:0x82705b,map:woodMap,roughness:.86});
  const oakEdge=this.material({color:0x564335,map:woodMap,roughness:.78});
  const oakInset=this.material({color:0x655340,map:woodMap,roughness:.94});
  const plaster=this.material({color:0x78716a,map:plasterMap,roughness:1});
  const paneling=this.material({color:0x243631,map:woodMap,roughness:.92});
  const panelTrim=this.material({color:0x26302a,roughness:.87});
  const floor=this.material({color:0x4c4237,map:woodMap,roughness:.96});
  const brass=this.material({color:0x8c7041,metalness:.78,roughness:.56});
  const tarnish=this.material({color:0x4a3b26,metalness:.65,roughness:.8});
  const dark=this.material({color:0x100f0c,roughness:1});

  // Only the surrounding wall is opaque; nothing closes the portal behind the leaf.
  const openingHalf=.9,wallHeight=8,wallWidth=18;
  for(const side of [-1,1]){
   this.box(this.scene,plaster,[wallWidth,wallHeight,.22],[side*(openingHalf+wallWidth/2),wallHeight/2,-.04]);
   this.box(this.scene,paneling,[wallWidth,1.03,.25],[side*(openingHalf+wallWidth/2),.515,.005]);
   this.box(this.scene,panelTrim,[wallWidth,.055,.29],[side*(openingHalf+wallWidth/2),1.04,.025]);
   this.box(this.scene,panelTrim,[wallWidth,.11,.31],[side*(openingHalf+wallWidth/2),.065,.035]);
   // Recessed wainscot bays are deliberately low contrast in the corridor.
   for(let i=0;i<7;i++){
    const x=side*(1.2+i*.64);
    this.box(this.scene,panelTrim,[.026,.88,.018],[x,.55,.14]);
   }
   this.box(this.scene,oakEdge,[.18,3.03,.23],[side*.995,1.515,.065]);
   this.box(this.scene,oak,[.035,3.03,.035],[side*1.07,1.515,.2]);
   this.box(this.scene,oakInset,[.035,2.87,.12],[side*.895,1.435,-.06]);
  }
  this.box(this.scene,plaster,[1.8,5.08,.22],[0,5.46,-.04]);
  this.box(this.scene,oakEdge,[2.17,.18,.25],[0,2.99,.07]);
  this.box(this.scene,oak,[2.22,.035,.29],[0,3.09,.09]);
  this.box(this.scene,oakInset,[1.8,.045,.12],[0,2.885,-.06]);
  this.box(this.scene,oakEdge,[1.82,.055,.28],[0,.002,.01]);
  this.box(this.scene,floor,[22,.08,20],[0,-.055,10.08]);
  for(let i=-9;i<=9;i++)this.box(this.scene,dark,[.007,.003,20],[i*.46,-.013,10.08]);

  // The local origin is the left hinge. A positive Y turn swings the right edge inward.
  this.leaf.position.set(-.875,.025,0);
  this.scene.add(this.leaf);
  const width=1.75,height=2.835;
  this.box(this.leaf,oak,[width,height,.105],[width/2,height/2,-.035]);
  for(const x of [.055,width-.055])this.box(this.leaf,oakEdge,[.095,height-.06,.035],[x,height/2,.03]);
  for(const y of [.065,height-.065])this.box(this.leaf,oakEdge,[width-.1,.09,.035],[width/2,y,.03]);
  this.box(this.leaf,oakEdge,[.09,height-.17,.03],[width/2,height/2,.027]);
  const rows:[number,number][]=[[.5,.69],[1.4,.78],[2.3,.7]];
  for(const x of [.4525,1.2975])for(const [y,h] of rows){
   const w=.665;
   this.box(this.leaf,oakInset,[w,h,.012],[x,y,.02]);
   for(const dx of [-1,1]){
    this.box(this.leaf,oakEdge,[.045,h+.06,.043],[x+dx*(w/2+.005),y,.037]);
    this.box(this.leaf,oak,[.014,h-.035,.015],[x+dx*(w/2-.026),y,.049]);
   }
   for(const dy of [-1,1]){
    this.box(this.leaf,oakEdge,[w+.08,.045,.043],[x,y+dy*(h/2+.005),.037]);
    this.box(this.leaf,oak,[w-.05,.014,.015],[x,y+dy*(h/2-.026),.049]);
   }
   // Matching shallow panels on the back prevent a featureless slab during the swing.
   this.box(this.leaf,oakInset,[w,h,.012],[x,y,-.094]);
   for(const dx of [-1,1])this.box(this.leaf,oakEdge,[.035,h+.04,.025],[x+dx*(w/2),y,-.103]);
   for(const dy of [-1,1])this.box(this.leaf,oakEdge,[w+.04,.035,.025],[x,y+dy*h/2,-.103]);
  }
  for(const y of [.38,1.43,2.48]){
   this.box(this.leaf,tarnish,[.12,.17,.012],[.045,y,.065]);
   const barrel=this.round(this.leaf,brass,.019,.2,[.002,y,.066]);
   for(const offset of [-.065,0,.065]){
    const ring=this.round(this.leaf,tarnish,.021,.009,[.002,y+offset,.066]);
    ring.rotation.y=barrel.rotation.y;
   }
   for(const dy of [-.05,.05])this.ball(this.leaf,brass,[.007,.007,.003],[.071,y+dy,.075]);
  }
  this.box(this.leaf,tarnish,[.115,.255,.015],[1.48,1.21,.064]);
  for(const y of [1.335,1.085]){
   const end=this.round(this.leaf,tarnish,.0575,.015,[1.48,y,.064]);end.rotation.x=Math.PI/2;
  }
  const rose=this.round(this.leaf,brass,.048,.022,[1.48,1.25,.086]);rose.rotation.x=Math.PI/2;
  const spindle=this.round(this.leaf,tarnish,.018,.07,[1.48,1.25,.126]);spindle.rotation.x=Math.PI/2;
  this.ball(this.leaf,brass,[.063,.05,.044],[1.48,1.25,.167]);
  const keyCircle=this.round(this.leaf,dark,.014,.006,[1.48,1.125,.076]);keyCircle.rotation.x=Math.PI/2;
  const keyShape=new THREE.Shape();keyShape.moveTo(-.007,0);keyShape.lineTo(-.012,-.028);keyShape.lineTo(.012,-.028);keyShape.lineTo(.007,0);keyShape.closePath();
  const key=new THREE.Mesh(this.ownGeometry(new THREE.ShapeGeometry(keyShape)),dark);key.position.set(1.48,1.12,.08);this.leaf.add(key);
  for(const y of [1.355,1.065])this.ball(this.leaf,brass,[.005,.005,.002],[1.48,y,.075]);

  this.scene.add(new THREE.HemisphereLight(0x8eaccd,0x1c1510,1.15));
  const cold=new THREE.DirectionalLight(0x9fb6d1,1.8);cold.position.set(-3,5,5);this.scene.add(cold);
  const warm=new THREE.PointLight(0xe4ad71,5.5,8,2);warm.position.set(1.7,2.4,2.1);this.scene.add(warm);
  this.update(0,1);
 }

 update(progress:number,aspect:number){
  if(this.disposed)return;
  const p=clamp(Number.isFinite(progress)?progress:0);
  const ratio=Number.isFinite(aspect)&&aspect>0?aspect:1;
  const opening=smooth(.08,.53,p),push=smooth(.42,1,p);
  this.leaf.rotation.y=1.6*opening;
  const portrait=clamp((1-ratio)/.55);
  const offset=-.75*clamp((ratio-.5)/.8);
  this.camera.aspect=ratio;
  this.camera.fov=THREE.MathUtils.lerp(50+portrait*18,43,push);
  this.camera.position.set(offset*(1-push),1.6,THREE.MathUtils.lerp(3.8,-1,push));
  this.camera.lookAt(this.camera.position.x,1.6,this.camera.position.z-3);
  this.camera.updateProjectionMatrix();
 }

 dispose(){
  if(this.disposed)return;this.disposed=true;
  this.scene.clear();
  for(const geometry of this.geometries)geometry.dispose();
  for(const material of this.materials)material.dispose();
  for(const texture of this.textures)texture.dispose();
  this.geometries.clear();this.materials.clear();this.textures.clear();
 }

 private ownGeometry<T extends THREE.BufferGeometry>(geometry:T):T{this.geometries.add(geometry);return geometry;}
 private material(options:THREE.MeshStandardMaterialParameters){const material=new THREE.MeshStandardMaterial(options);this.materials.add(material);return material;}
 private box(parent:THREE.Object3D,material:THREE.Material,size:[number,number,number],at:[number,number,number]){
  const mesh=new THREE.Mesh(this.cube,material);mesh.scale.set(...size);mesh.position.set(...at);parent.add(mesh);return mesh;
 }
 private round(parent:THREE.Object3D,material:THREE.Material,radius:number,height:number,at:[number,number,number]){
  const mesh=new THREE.Mesh(this.cylinder,material);mesh.scale.set(radius*2,height,radius*2);mesh.position.set(...at);parent.add(mesh);return mesh;
 }
 private ball(parent:THREE.Object3D,material:THREE.Material,size:[number,number,number],at:[number,number,number]){
  const mesh=new THREE.Mesh(this.sphere,material);mesh.scale.set(...size);mesh.position.set(...at);parent.add(mesh);return mesh;
 }
 private makeTexture(kind:'wood'|'plaster'){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const ctx=canvas.getContext('2d');
  if(ctx){
   const image=ctx.createImageData(canvas.width,canvas.height);
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const i=(y*canvas.width+x)*4;
    const noise=Math.sin(x*127.1+y*311.7)*43758.5453;
    const grain=kind==='wood'?Math.sin(x*.71+Math.sin(y*.011)*1.7)*9+Math.sin(x*2.17+y*.003)*5:Math.sin(x*.033+y*.017)*5+Math.cos(x*.061-y*.049)*4;
    const value=kind==='wood'?150+grain+(noise-Math.floor(noise))*10:178+grain+(noise-Math.floor(noise))*13;
    image.data[i]=value;image.data[i+1]=value-(kind==='wood'?10:3);image.data[i+2]=value-(kind==='wood'?20:7);image.data[i+3]=255;
   }
   ctx.putImageData(image,0,0);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  this.textures.add(texture);return texture;
 }
}
