import * as THREE from 'three';

/** Exterior-only details; the existing room lighting and camera stay in control. */
export function prepareOfficeWeather(room:THREE.Group,world:THREE.Group,reduced:boolean){
 room.traverse(object=>{
  if(!(object instanceof THREE.Mesh))return;
  const materials=Array.isArray(object.material)?object.material:[object.material];
  for(const material of materials){
   if(material.name.startsWith('NIGHT_BACKDROP')){
    // The photographed far layer should not inherit indoor distance fog or shadows.
    material.fog=false;object.castShadow=false;object.receiveShadow=false;
   }
   if(material.name.startsWith('NIGHT_RAIN_GLASS')){
    object.castShadow=false;object.receiveShadow=false;material.depthWrite=false;
    if(material.name.includes('远雨细丝'))object.visible=false;
   }
   if(material.name.startsWith('COFFEE_LIQUID')&&material instanceof THREE.MeshStandardMaterial){
    object.castShadow=false;material.envMapIntensity=.9;
   }
   if(material.name.startsWith('COFFEE_RESIDUE')){object.castShadow=false;material.depthWrite=false;}
  }
 });
 // Two vertices per streak; all rain remains outside the closed window.
 const count=78,positions=new Float32Array(count*6),seeds=new Float32Array(count*4);
 for(let i=0;i<count;i++){
  // Stable seed placement keeps reloads from changing the approved composition.
  seeds[i*4]=.02+((i*37%101)/101)*2.1;
  seeds[i*4+1]=((i*61%103)/103)*3.8;
  seeds[i*4+2]=-3.0-((i*43%107)/107)*3.6;
  seeds[i*4+3]=.65+((i*29%109)/109)*.65;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const material=new THREE.LineBasicMaterial({color:0x95a8bd,transparent:true,opacity:.22,depthWrite:false});
 const rain=new THREE.LineSegments(geometry,material);rain.name='OFFICE_DETAIL_runtime_rain';rain.frustumCulled=false;world.add(rain);
 function update(time:number){
  const t=reduced?0:time*.0015;
  for(let i=0;i<count;i++){
   const j=i*4,k=i*6,y=3.65-((seeds[j+1]+t*seeds[j+3])%3.8);
   positions[k]=seeds[j];positions[k+1]=y;positions[k+2]=seeds[j+2];
   positions[k+3]=seeds[j]+.012;positions[k+4]=y-.075;positions[k+5]=seeds[j+2];
  }
  geometry.attributes.position.needsUpdate=true;
 }
 update(0);return {update};
}
