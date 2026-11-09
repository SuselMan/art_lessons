import {copyBrushPattern,type BrushAsset} from '@grafetto/shared'
import {currentBrushRoom,publishBrushPresets,loadBrushLibrary,prepareBrushPresets} from './brushLibrary'
import {useRoomStore} from '../../stores/roomStore'
import type {TranslationKey} from '../../i18n/core/en'
let ticket=0
export class CanvasPatternError extends Error {
 readonly translationKey: TranslationKey
 constructor(key:TranslationKey){super(key);this.translationKey=key}
}
export function clearCanvasBrushPattern():void{
 ticket++
 useRoomStore.getState().setCanvasPatternSelection({room:currentBrushRoom(),pattern:copyBrushPattern({version:1,kind:'none'}),name:''})
}
/** Selected metadata lives in roomStore. Pixel ownership stays in existing room assets. */
export async function selectCanvasBrushPattern(file:File):Promise<void>{
 const selection=useRoomStore.getState().canvasPatternSelection,room=currentBrushRoom(),generation=++ticket
 const current=()=>generation===ticket&&room===currentBrushRoom()&&selection===useRoomStore.getState().canvasPatternSelection
 if(file.type!=='image/png'||file.size>4*1024*1024)throw new CanvasPatternError('canvasPattern.invalidPng')
 const header=new DataView(await file.slice(0,24).arrayBuffer())
 if(header.byteLength!==24||header.getUint32(0)!==0x89504e47||header.getUint32(4)!==0x0d0a1a0a||header.getUint32(12)!==0x49484452||header.getUint32(16)<1||header.getUint32(20)<1||header.getUint32(16)>512||header.getUint32(20)>512)throw new CanvasPatternError('canvasPattern.invalidPng')
 if(!room)throw new CanvasPatternError('canvasPattern.roomRequired')
 if(!current())return
 const bitmap=await createImageBitmap(file),width=bitmap.width,height=bitmap.height
 let rgba:Uint8ClampedArray
 try{
  if(width!==header.getUint32(16)||height!==header.getUint32(20)||width<1||height<1||width>512||height>512)throw new CanvasPatternError('canvasPattern.invalidPng')
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new CanvasPatternError('canvasPattern.loadFailed')
  context.drawImage(bitmap,0,0);rgba=context.getImageData(0,0,width,height).data
 }finally{bitmap.close()}
 const side=Math.max(2,2**Math.ceil(Math.log2(Math.max(width,height)))),x=Math.floor((side-width)/2),y=Math.floor((side-height)/2),channels=[3,0,1,2],ids:`asset:${string}`[]=[],assets:BrushAsset[]=[],payloads:Record<string,string>={}
 for(const channel of channels){
  const pixels=new Uint8Array(side*side)
  for(let row=0;row<height;row++)for(let col=0;col<width;col++)pixels[(row+y)*side+col+x]=rgba[(row*width+col)*4+channel]
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(v=>v.toString(16).padStart(2,'0')).join(''),id=`asset:${hash}` as const
  ids.push(id)
  if(!payloads[hash]){let encoded='';for(const byte of pixels)encoded+=String.fromCharCode(byte);payloads[hash]=btoa(encoded);assets.push({id,size:side,file:hash+'.bin'})}
 }
 const pattern=copyBrushPattern({version:1,kind:'rgba',alpha:ids[0],planes:[ids[1],ids[2],ids[3]],side,sourceRect:{x,y,width,height},sampling:'world-repeat-nearest-v1'})
 if(!current())return
 await publishBrushPresets(room,[],{pattern,assets,payloads})
 if(!current())return
 await loadBrushLibrary()
 if(!current())return
 const pending=prepareBrushPresets([],[{version:1,pattern}]);if(pending)await pending
 if(!current())return
 useRoomStore.getState().setCanvasPatternSelection({room,pattern,name:file.name})
}
