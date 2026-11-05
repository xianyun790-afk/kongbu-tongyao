import {Box3,Vector3} from 'three';

/** A short camera arm keeps an orbit inside a room, without changing its direction. */
export class RoomCameraBoundary{
 private box:Box3;
 private direction=new Vector3();
 private lastTarget=new Vector3();
 private requestedDistance:number|null=null;
 private previousDistance=0;
 private obstacles:Box3[];
 constructor(min:Vector3,max:Vector3,obstacles:Box3[]=[]){
  this.obstacles=obstacles;
  const clearance=new Vector3(.22,.18,.22);
  this.box=new Box3(min.clone().add(clearance),max.clone().sub(clearance));
 }
 reset(){this.requestedDistance=null;this.previousDistance=0;}
 constrain(position:Vector3,target:Vector3,minDistance:number,maxDistance:number,trackZoom=true){
  const before=position.clone();this.direction.subVectors(position,target);const distance=this.direction.length();
  if(distance<1e-8)return false;
  // OrbitControls operates on the shortened arm. Keep the desired zoom so turning
  // away from a wall restores the previous distance instead of ratcheting inward.
  if(!trackZoom||this.requestedDistance===null||this.previousDistance<1e-8||this.lastTarget.distanceToSquared(target)>1e-10)this.requestedDistance=distance;
  else this.requestedDistance*=distance/this.previousDistance;
  this.requestedDistance=Math.max(minDistance,Math.min(maxDistance,this.requestedDistance));
  this.direction.multiplyScalar(1/distance);
  let entry=0,exit=Infinity;
  for(const axis of ['x','y','z'] as const){
   const component=this.direction[axis],origin=target[axis];
   if(Math.abs(component)<1e-10){if(origin<this.box.min[axis]||origin>this.box.max[axis]){entry=Infinity;break;}continue;}
   const a=(this.box.min[axis]-origin)/component,b=(this.box.max[axis]-origin)/component;
   entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  }
  if(entry<=exit&&exit>0){
   // Subtract solid furniture from the available camera positions along this
   // direction. A sight line may cross furniture; only the camera needs clearance.
   let ranges:[number,number][]=[[Math.max(entry,minDistance),Math.min(exit,maxDistance)]];
   for(const obstacle of this.obstacles){
    const blocked=this.rayInterval(target,obstacle);if(!blocked)continue;
    ranges=ranges.flatMap(([start,end])=>{
     if(blocked[1]<start||blocked[0]>end)return [[start,end] as [number,number]];
     const next:[number,number][]=[];
     if(blocked[0]>start)next.push([start,blocked[0]-1e-5]);
     if(blocked[1]<end)next.push([blocked[1]+1e-5,end]);
     return next;
    });
   }
   let safeDistance=NaN,best=Infinity;
   for(const[start,end]of ranges){
    if(end<start)continue;
    const candidate=Math.max(start,Math.min(end,this.requestedDistance)),delta=Math.abs(candidate-this.requestedDistance);
    if(delta<best){best=delta;safeDistance=candidate;}
   }
   position.copy(target).addScaledVector(this.direction,Number.isFinite(safeDistance)?safeDistance:Math.max(entry,Math.min(exit,this.requestedDistance)));
  }else position.clamp(this.box.min,this.box.max);
  // At the doorway the orbit target can itself be inside the open door. If no
  // radial position fits, slide to a free face rather than trapping the camera.
  this.clearFurniture(position,target,minDistance,maxDistance);
  this.previousDistance=position.distanceTo(target);this.lastTarget.copy(target);
  return position.distanceToSquared(before)>1e-14;
 }
 private rayInterval(origin:Vector3,box:Box3):[number,number]|null{
  let entry=-Infinity,exit=Infinity;
  for(const axis of ['x','y','z'] as const){
   const component=this.direction[axis];
   if(Math.abs(component)<1e-10){if(origin[axis]<box.min[axis]||origin[axis]>box.max[axis])return null;continue;}
   const a=(box.min[axis]-origin[axis])/component,b=(box.max[axis]-origin[axis])/component;
   entry=Math.max(entry,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
  }
  return entry<=exit?[entry,exit]:null;
 }
 private clearFurniture(position:Vector3,target:Vector3,minDistance:number,maxDistance:number){
  const free=(candidate:Vector3)=>this.box.containsPoint(candidate)&&!this.obstacles.some(box=>box.containsPoint(candidate))&&candidate.distanceTo(target)>=minDistance-1e-8&&candidate.distanceTo(target)<=maxDistance+1e-8;
  if(free(position))return;
  let closest:Vector3|null=null,best=Infinity;
  const consider=(candidate:Vector3)=>{
   candidate.clamp(this.box.min,this.box.max);if(!free(candidate))return;
   const distance=candidate.distanceToSquared(position);if(distance<best){best=distance;closest=candidate;}
  };
  for(const obstacle of [this.box,...this.obstacles])for(const axis of ['x','y','z'] as const)for(const edge of [obstacle.min[axis]-1e-5,obstacle.max[axis]+1e-5]){
   const candidate=position.clone();candidate[axis]=edge;consider(candidate);
  }
  for(const axis of ['x','y','z'] as const)for(const sign of [-1,1]){
   const candidate=target.clone();candidate[axis]+=sign*(minDistance+1e-5);consider(candidate);
  }
  if(closest)position.copy(closest);
 }
}
