import{it,expect}from'vitest'
import type{Operation,StrokeOperation}from'./index'
import{dependentReadOperations,operationReadLayerIds}from'./pixelReadDependencies'
const stroke=(id:string,seq:number,layerId:string,reads:string[]=[]):StrokeOperation=>({id,seq,type:'stroke',layerId,userId:'A',timestamp:seq,tool:'digitalBrush',preset:'test',color:[0,0,0],dabs:[],...(reads.length?{brushSource:{version:1,projection:reads.map(id=>({id,opacity:1}))}}:{})})
it('separates projection reads from the layer written',()=>{expect(operationReadLayerIds(stroke('s',2,'top',['bottom','top']))).toEqual(['bottom'])})
it('follows chronological read chains, including a return to a former layer',()=>{
 const a=stroke('a',1,'L'),b=stroke('b',2,'R',['L']),c=stroke('c',3,'L',['R']),d=stroke('d',4,'T',['L'])
 expect(dependentReadOperations([d,c,a,b],[a]).map(o=>o.id)).toEqual(['b','c','d'])
})
it('does not alter reads earlier than the changed paint or unrelated layers',()=>{
 const old=stroke('old',1,'T',['L']),paint=stroke('paint',3,'L'),other=stroke('other',4,'X',['Y'])
 expect(dependentReadOperations([old,paint,other],[paint])).toEqual([])
})
it('uses the same edges for a merge or copy followed by a merged brush',()=>{
 const a=stroke('a',1,'L'),copy:Operation={id:'copy',seq:2,type:'layer_duplicate',timestamp:2,userId:'A',sourceId:'L',layerId:'R',name:'copy',sourceOpacity:1,sourceVisible:true,parentId:null,index:0},b=stroke('b',3,'T',['R'])
 expect(dependentReadOperations([a,copy,b],[a]).map(o=>o.id)).toEqual(['copy','b'])
})
