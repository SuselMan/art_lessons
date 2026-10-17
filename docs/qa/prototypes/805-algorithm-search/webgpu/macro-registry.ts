import {create as implicit} from './macro-implicit'
import {create as darcy} from './macro-darcy'
/** Explicit new research registry. Existing index/defaults are untouched. */
export const macroDefinitions=[
 {id:'wgsl-macro-implicit',label:'Неявный перенос по мокрой области',create:implicit,configs:[
  {grid:256,cycles:2,sigma:64,mobile:1,paperDrag:.5,concentration:0},
  {grid:256,cycles:2,sigma:112,mobile:1,paperDrag:.5,concentration:0},
  {grid:128,cycles:3,sigma:160,mobile:1,paperDrag:.5,concentration:1}
 ]},
 {id:'wgsl-macro-darcy',label:'Связанный перенос воды и пигмента',create:darcy,configs:[
  {grid:128,steps:128,flow:.2,mixing:.2,paperHead:.2,solutalPressure:.5,mobile:1},
  {grid:64,steps:96,flow:.2,mixing:.2,paperHead:.2,solutalPressure:.5,mobile:1},
  {grid:128,steps:256,flow:.2,mixing:.24,paperHead:.1,solutalPressure:1,mobile:1}
 ]}
]
