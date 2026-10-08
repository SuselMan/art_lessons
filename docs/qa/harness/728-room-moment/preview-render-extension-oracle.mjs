import assert from 'node:assert/strict';
// Candidate visual-only coverage; scalar material support deliberately not water.
const extend=(old,p,c)=>{
 const result=[...old];
 // P.B and C are independent; require observable optical record, no C<=P.B.
 const material=p[2]>0&&c[3]>0&&Math.max(...c.slice(0,3))>0;
 if(!material)return result;
 const a=Math.max(old[3],255); // explicit full-support diagnostic, not dose/physics.
 if(old[3]>.004*255){result[0]=Math.round(old[0]*a/old[3]);result[1]=Math.round(old[1]*a/old[3])}
 else{result[0]=Math.round(a*.5);result[1]=0}
 result[2]=old[2];result[3]=a;return result;
};
const old=[0,0,0,0],wet=[255,0,0,255],clearC=[0,0,0,0];
assert.deepEqual(extend(old,wet,clearC),old); // water positive is insufficient.
assert.deepEqual(extend(old,[255,0,1,255],[0,0,0,1]),old); // zero optical depth white guard.
const outside=extend(old,[255,0,1,255],[1,0,0,1]);assert(outside[3]/255>.004);assert.equal(outside[0],128);assert.equal(outside[1],0);assert.equal(outside[2],0);
const inside=[80,40,230,160],saved=[...inside],expanded=extend(inside,[255,0,170,255],[180,20,10,200]);
assert.deepEqual(inside,saved);assert.equal(expanded[2],230);
assert(Math.abs(expanded[0]/expanded[3]-inside[0]/inside[3])<=.5/255);
assert(Math.abs(expanded[1]/expanded[3]-inside[1]/inside[3])<=.5/255);
assert.deepEqual(extend(inside,wet,clearC),inside);
console.log(JSON.stringify({pass:true,waterOnlyNoWhitePaint:true,zeroOpticalDepthNoExtension:true,sourceUntouched:true,outsideAcrossNeutral:true,standingPreserved:true,scope:'candidate mask only; actual radial proof pending'}));
