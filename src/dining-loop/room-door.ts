import * as THREE from 'three';

/** An ordinary, working dining-room door. The route beyond it uses the main stairs. */
export function createDiningDoor(){
 const group=new THREE.Group();group.name='dining-hall-door';
 group.position.set(-3.43,0,.85);group.rotation.y=Math.PI/2;
 const wood=new THREE.MeshStandardMaterial({color:0x493a2c,roughness:.91});
 const edge=new THREE.MeshStandardMaterial({color:0x29251e,roughness:.88});
 const inset=new THREE.MeshStandardMaterial({color:0x3b3026,roughness:.96});
 const brass=new THREE.MeshStandardMaterial({color:0x9a7b45,metalness:.7,roughness:.66});
 const dark=new THREE.MeshStandardMaterial({color:0x0a0d0e,roughness:1});
 const box=(parent:THREE.Object3D,material:THREE.Material,size:[number,number,number],at:[number,number,number])=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...at);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 };
 // The dark reveal covers the existing wall surface without modifying the approved asset.
 box(group,dark,[1.2,2.5,.025],[0,1.25,0]);
 for(const side of [-1,1]){
  box(group,edge,[.13,2.6,.16],[side*.67,1.3,.075]);
  box(group,wood,[.025,2.6,.035],[side*.73,1.3,.17]);
 }
 box(group,edge,[1.46,.16,.18],[0,2.57,.075]);
 box(group,wood,[1.52,.035,.2],[0,2.68,.09]);
 box(group,edge,[1.21,.045,.2],[0,.02,.08]);
 const leaf=new THREE.Group();leaf.position.set(-.585,.035,.06);group.add(leaf);
 box(leaf,wood,[1.17,2.45,.075],[.585,1.225,0]);
 for(const x of [.055,1.115])box(leaf,edge,[.09,2.37,.025],[x,1.225,.05]);
 for(const y of [.065,1.225,2.385])box(leaf,edge,[1.08,.09,.025],[.585,y,.05]);
 for(const y of [.62,1.82]){
  box(leaf,inset,[.88,1.02,.018],[.585,y,.049]);
  for(const side of [-1,1]){
   box(leaf,wood,[.025,1.06,.04],[.585+side*.46,y,.065]);
   box(leaf,wood,[.93,.025,.04],[.585,y+side*.53,.065]);
  }
 }
 box(leaf,brass,[.08,.21,.018],[1.005,1.13,.069]);
 const knob=new THREE.Mesh(new THREE.SphereGeometry(.035,14,10),brass);knob.position.set(1.005,1.18,.115);leaf.add(knob);
 for(const y of [.35,1.2,2.1])box(leaf,brass,[.045,.13,.035],[.01,y,.06]);
 // The small enamel plate is part of the door, not a floating navigation panel.
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
 const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#b8ad8c';ctx.fillRect(0,0,256,96);ctx.strokeStyle='#665d45';ctx.lineWidth=5;ctx.strokeRect(8,8,240,80);ctx.fillStyle='#342f26';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='38px "Songti SC",serif';ctx.fillText('大厅',128,50);}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 box(leaf,new THREE.MeshStandardMaterial({map:texture,roughness:.82}),[.34,.13,.012],[.585,1.88,.067]);
 return {group,leaf,anchor:[-3.29,1.2,.45] as [number,number,number]};
}
