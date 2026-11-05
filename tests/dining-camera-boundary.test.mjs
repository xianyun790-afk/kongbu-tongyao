import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {readFileSync} from 'node:fs';
import {RoomCameraBoundary} from '../src/dining-loop/camera-boundary.ts';
import {officeCameraObstacles,OFFICE_MIN_DISTANCE} from '../src/dining-loop/office-camera.ts';

const manifest=JSON.parse(readFileSync(new URL('../public/models/dining-loop/office-manifest.json',import.meta.url)));
const {min,max}=manifest.interiorBounds;
const make=()=>new RoomCameraBoundary(new Vector3(...min),new Vector3(...max));
const inside=p=>p.x>=-2.38-1e-8&&p.x<=2.38+1e-8&&p.y>=.18-1e-8&&p.y<=3.12+1e-8&&p.z>=-2.28-1e-8&&p.z<=2.28+1e-8;
const shots=[manifest.opening,...manifest.interactions.map(i=>i.focus)];

test('all existing office compositions, including the door, stay unchanged',()=>{
 for(const shot of shots){
  const position=new Vector3(...shot.position),before=position.clone();
  make().constrain(position,new Vector3(...shot.target),.3,5.3,false);
  assert.ok(position.distanceTo(before)<1e-9);assert.ok(inside(position));
 }
});

test('full orbit and zoom sweeps stay inside all six room surfaces',()=>{
 let checks=0;
 for(const shot of shots.filter(s=>s.target[2]<2.28)){
  const target=new Vector3(...shot.target);
  for(let yaw=-Math.PI;yaw<Math.PI;yaw+=Math.PI/24)for(let pitch=.25;pitch<=1.48;pitch+=.1)for(const radius of [.3,1,3,5.3]){
   const direction=new Vector3(Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),Math.sin(pitch)*Math.cos(yaw));
   const position=target.clone().addScaledVector(direction,radius);
   make().constrain(position,target,.3,5.3,false);
   assert.ok(inside(position));
   assert.ok(position.clone().sub(target).normalize().dot(direction)>1-1e-9,'orbit direction changed');checks++;
  }
 }
 assert.ok(checks>10000);
});

test('turning away from a wall restores the desired zoom without drifting',()=>{
 const guard=make(),target=new Vector3(...manifest.opening.target),position=new Vector3(...manifest.opening.position);
 const direction=position.clone().sub(target).normalize(),desired=position.distanceTo(target);
 guard.constrain(position,target,.3,5.3);
 for(let i=0;i<500;i++){
  const currentDistance=position.distanceTo(target);
  position.copy(target).addScaledVector(new Vector3(0,.1,-1).normalize(),currentDistance);
  guard.constrain(position,target,.3,5.3);assert.ok(inside(position));
  const shortened=position.distanceTo(target);assert.ok(shortened<desired);
  position.copy(target).addScaledVector(direction,shortened);
  guard.constrain(position,target,.3,5.3);assert.ok(Math.abs(position.distanceTo(target)-desired)<1e-8);
 }
});

test('user zoom still works while the camera is close to a wall',()=>{
 const guard=make(),target=new Vector3(...manifest.opening.target),position=new Vector3(...manifest.opening.position);
 const direction=position.clone().sub(target).normalize(),desired=position.distanceTo(target);
 guard.constrain(position,target,.3,5.3);
 position.copy(target).addScaledVector(new Vector3(0,.1,-1).normalize(),desired);guard.constrain(position,target,.3,5.3);
 position.lerp(target,.5);guard.constrain(position,target,.3,5.3);
 const shortened=position.distanceTo(target);position.copy(target).addScaledVector(direction,shortened);guard.constrain(position,target,.3,5.3);
 assert.ok(Math.abs(position.distanceTo(target)-desired*.5)<1e-8);
});

const makeWithFurniture=()=>new RoomCameraBoundary(new Vector3(...min),new Vector3(...max),officeCameraObstacles());
const clear=p=>officeCameraObstacles().every(box=>!box.containsPoint(p));

test('furniture clearance preserves all authored compositions and camera transitions',()=>{
 for(const from of shots)for(const to of shots)for(let step=0;step<=100;step++){
  const position=new Vector3(...from.position).lerp(new Vector3(...to.position),step/100),before=position.clone();
  const target=new Vector3(...from.target).lerp(new Vector3(...to.target),step/100);
  makeWithFurniture().constrain(position,target,OFFICE_MIN_DISTANCE,5.3,false);
  assert.ok(position.distanceTo(before)<1e-9,'authored transition changed');
 }
});

test('camera inside each solid is moved clear without crossing the room',()=>{
 for(const box of officeCameraObstacles())for(const target of shots.map(shot=>new Vector3(...shot.target))){
  const position=box.getCenter(new Vector3()).clamp(new Vector3(-2.38,.18,-2.28),new Vector3(2.38,3.12,2.28));
  makeWithFurniture().constrain(position,target,.3,5.3,false);
  assert.ok(inside(position));assert.ok(clear(position));assert.ok(position.distanceTo(target)>=.3-1e-8);
 }
});

test('zooming against the monitor never shortens the camera below the control minimum',()=>{
 const guard=makeWithFurniture(),target=new Vector3(-1.65,1.05,-1.05),yaw=1.472621556,pitch=1.33;
 const direction=new Vector3(Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),Math.sin(pitch)*Math.cos(yaw)),position=target.clone().addScaledVector(direction,.3);
 for(let i=0;i<200;i++){
  const radius=Math.max(.3,position.distanceTo(target));position.copy(target).addScaledVector(direction,radius);guard.constrain(position,target,.3,5.3);
  assert.ok(position.distanceTo(target)>=.3-1e-8);assert.ok(inside(position));assert.ok(clear(position));
 }
});

test('orbit and zoom at every investigation target avoid furniture, including door target inside leaf',()=>{
 for(const shot of shots)for(let yaw=-Math.PI;yaw<Math.PI;yaw+=Math.PI/24)for(const pitch of [.25,.7,1.2,1.48])for(const radius of [.3,1,3,5.3]){
  const target=new Vector3(...shot.target),direction=new Vector3(Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),Math.sin(pitch)*Math.cos(yaw));
  const position=target.clone().addScaledVector(direction,radius);
  makeWithFurniture().constrain(position,target,.3,5.3,false);
  assert.ok(inside(position));assert.ok(clear(position));assert.ok(position.distanceTo(target)>=.3-1e-8);assert.ok(position.distanceTo(target)<=5.3+1e-8);
 }
});

test('the office manual zoom minimum keeps close orbits usable around every focus',()=>{
 for(const shot of shots)for(let yaw=-Math.PI;yaw<Math.PI;yaw+=Math.PI/48)for(let pitch=.25;pitch<=1.48;pitch+=.08){
  const target=new Vector3(...shot.target),direction=new Vector3(Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch),Math.sin(pitch)*Math.cos(yaw));
  const position=target.clone().addScaledVector(direction,OFFICE_MIN_DISTANCE);
  makeWithFurniture().constrain(position,target,OFFICE_MIN_DISTANCE,5.3,false);
  assert.ok(inside(position));assert.ok(clear(position));assert.ok(position.distanceTo(target)>=OFFICE_MIN_DISTANCE-1e-8);
 }
});

test('turning away from a cabinet restores the original zoom and retains a later zoom gesture',()=>{
 const target=new Vector3(...manifest.opening.target),position=new Vector3(...manifest.opening.position),guard=makeWithFurniture();
 const original=position.clone().sub(target).normalize(),desired=position.distanceTo(target);
 const towardsCabinet=new Vector3(-2.3,1.2,.65).sub(target).normalize();
 guard.constrain(position,target,.3,5.3);
 for(let i=0;i<200;i++){
  let radius=position.distanceTo(target);position.copy(target).addScaledVector(towardsCabinet,radius);guard.constrain(position,target,.3,5.3);
  assert.ok(clear(position));assert.ok(position.distanceTo(target)<desired);
  radius=position.distanceTo(target);position.copy(target).addScaledVector(original,radius);guard.constrain(position,target,.3,5.3);
  assert.ok(Math.abs(position.distanceTo(target)-desired)<1e-8);
 }
 position.copy(target).addScaledVector(towardsCabinet,desired);guard.constrain(position,target,.3,5.3);
 position.lerp(target,.2);guard.constrain(position,target,.3,5.3);
 const radius=position.distanceTo(target);position.copy(target).addScaledVector(original,radius);guard.constrain(position,target,.3,5.3);
 assert.ok(Math.abs(position.distanceTo(target)-desired*.8)<1e-8);
});
