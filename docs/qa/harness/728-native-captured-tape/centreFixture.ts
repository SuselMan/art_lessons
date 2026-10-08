import {createCanonicalSceneSession,type CanonicalSceneSession} from '../../../../apps/web/src/engine/src/webgpuCanonical/sceneFactory'
import type {Operation} from '@grafetto/shared'
let session:CanonicalSceneSession|null=null,pigment=0,tape:Operation[]=[],status=''
/** A second REAL PointerInput UI fixture. Root drives pen input via CDP, or a
 * human draws; this helper never invents procedural dabs or modifies the tape. */
export async function prepareCentrePointerFixture(){
 if(session)throw new Error('Dispose previous centre fixture')
 const mount=document.querySelector('#surface')!,canvas=document.createElement('canvas');canvas.style.width='640px';canvas.style.height='640px';mount.replaceChildren(canvas);tape=[];pigment=0
 session=await createCanonicalSceneSession(canvas,{onStatus:message=>{status=message},onOperation:op=>tape.push(op)})
 session.attach(()=>({tool:'watercolor',preset:`normal:100:${pigment}:PB29:round`,size:100,opacity:1,color:[.4,.2,.6],nibAngle:{angle:0,anchor:'canvas'},tiltResponse:'smooth'}))
 const b=canvas.getBoundingClientRect(),client=(x:number,y:number)=>({x:b.left+x/1024*b.width,y:b.top+y/1024*b.height})
 return{settings:{size:100,water:100,pigment:0,color:[.4,.2,.6],nib:'round'},waterStart:client(256,512),waterEnd:client(768,512),pigmentCentre:client(512,512),world:{waterY:512,pigment:[512,512]},input:'actual sceneFactory PointerInput → DabSystem → recorded Operations'}
}
export async function drainCentrePointerFixture(){if(!session)throw new Error('No centre fixture');await session.runner.drain();return{status,operations:tape.length,idle:session.isIdle}}
export function setCentreFixturePigment(value:number){if(!session||!session.isIdle)throw new Error('Centre fixture not ready');if(value!==0&&value!==100)throw new Error('Centre fixture expects water0 or pigment100');pigment=value;return{preset:`normal:100:${pigment}:PB29:round`,size:100,water:100,pigment}}
export async function takeCentreFixtureTape(){if(!session)throw new Error('No centre fixture');await session.runner.drain();const result=structuredClone(tape);await session.runner.retire();session.destroy();session=null;document.querySelector('#surface')!.replaceChildren();return result}
Object.assign(window,{prepareCentrePointerFixture,drainCentrePointerFixture,setCentreFixturePigment,takeCentreFixtureTape})
