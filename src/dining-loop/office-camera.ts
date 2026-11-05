import {Box3,Vector3} from 'three';

// Avoid face-filling manual zoom while retaining the authored coffee close-up.
export const OFFICE_MIN_DISTANCE=.8;

/** World-space solid bounds measured from office v0.4, with camera clearance. */
export function officeCameraObstacles(){
 const bounds=[
  [[-2.51,.02,.18],[-2.097,1.944,1.12]], // Archive cabinet.
  [[-1.601364,.005,1.781201],[-1.078636,2.295,2.698799]], // Open door leaf.
  [[-2.255,.8925,-.764],[-1.665,1.2575,-.7095]], // Monitor and frame.
  [[-1.4625,.78,-.955],[-1.2575,1.23,-.585]], // Computer tower.
 ];
 return bounds.map(([min,max])=>new Box3(new Vector3(...min),new Vector3(...max)).expandByScalar(.18));
}
