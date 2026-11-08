import type{AssetId,BrushDescriptor,BrushLibrary}from'./brushes.js'
import{pair128}from'./childLightness128.testFixture.js'
export const alphas130=Array.from({length:5},(_,i)=>`asset:${('130a'+i).padEnd(64,'0')}`as AssetId),grays130=Array.from({length:5},(_,i)=>`asset:${('130b'+i).padEnd(64,'0')}`as AssetId),masks130=Array.from({length:7},(_,i)=>`asset:${('130c'+i).padEnd(64,'0')}`as AssetId),pattern130=`asset:${'130d'.padEnd(64,'0')}`as AssetId
export const assets130=[...alphas130,...grays130,...masks130,pattern130].map(id=>({id,size:4,file:id.slice(6)+'.bin'}))
export function pair130():BrushDescriptor{
 const root=pair128(),child=root.behavior!.dual!.brush;root.version=child.version=130
 root.tip.mask=alphas130[0];root.tip.animation={mode:'random',frames:[...alphas130]};root.tip.material={kind:'lightness',gray:grays130[0],grayFrames:[...grays130],strength:1}
 child.tip.mask=masks130[0];child.tip.animation={mode:'random',frames:[...masks130]}
 root.scatter={count:1,radius:.51,scale:1,sizeJitter:0,angleJitter:0,flowJitter:0};root.behavior!.scatter={countJitter:0,bothAxes:true,placement:'xyUniform'}
 root.behavior!.modulations={scatter:[{control:'pressure',minimum:0,jitter:0,curve:[[0,0],[1,1]]}],roundness:[{control:'off',minimum:0,jitter:0,curve:[[0,.68],[1,.68]]}],grainDepth:[{control:'pressure',minimum:0,jitter:0,curve:[[0,0],[1,1]]}]}
 root.behavior!.colorAdjustment={hue:{control:'random',minimum:0,jitter:0,curve:[[0,.432161],[1,.517588]]},value:{control:'pressure',minimum:0,jitter:0,curve:[[0,.5],[1,.477387]]}}
 root.texture={id:pattern130,strength:1,periodPx:4,patternSize:{width:4,height:4},application:{mode:'subtract',soft:false},offset:{x:1,y:2,randomX:true,randomY:true}}
 root.behavior!.dual!.blendMode='multiply';return root
}
export function pixels130(id:string,side=4):Uint8Array{
 const index=[...alphas130,...grays130,...masks130,pattern130].indexOf(id as AssetId);if(index<0)throw Error('Unknown130 fixture')
 return Uint8Array.from({length:side*side},(_,p)=>index<5?(p%side<side/2?255:128):index<10?(p%side*17+index*19)%256:index<17?(p%side===index%side?255:0):(p*13)%256)
}
export const library130=():BrushLibrary=>({schemaVersion:1,assets:structuredClone(assets130),skipped:[],brushes:[{name:'Own130',source:'authored.kpp',warnings:[],descriptor:pair130()}]})

/** Unique tiny CAS identities for count boundaries; no borrowed pixel fixtures needed. */
export function libraryCounts130(rootCount:number,childCount:number,side=2):BrushLibrary{
 const l=library130(),d=l.brushes[0].descriptor,c=d.behavior!.dual!.brush
 const ids=(kind:string,count:number)=>Array.from({length:count},(_,i)=>`asset:${(kind+i.toString(16).padStart(3,'0')).padEnd(64,'0')}`as AssetId)
 const a=ids('130e',rootCount),g=ids('130f',rootCount),m=ids('130a',childCount)
 d.tip.animation!.frames=a;d.tip.mask=a[0];d.tip.material!.grayFrames=g;d.tip.material!.gray=g[0];c.tip.animation!.frames=m;c.tip.mask=m[0];c.tip.imageSampling!.sourceRect={x:0,y:0,width:side,height:side}
 d.texture!.patternSize={width:side,height:side};d.texture!.periodPx=side
 l.assets=[...a,...g,...m,pattern130].map(id=>({id,size:side,file:id.slice(6)+'.bin'}));return l
}
