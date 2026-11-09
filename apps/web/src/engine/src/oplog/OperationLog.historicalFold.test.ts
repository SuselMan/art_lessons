import type {Operation,StrokeOperation} from '@grafetto/shared';
import{it,expect}from'vitest';import{OperationLog}from'./OperationLog';
const stroke=(id:string,seq:number,strokeId=id):StrokeOperation=>({id,seq,type:'stroke' as const,userId:'owner',layerId:'A',tool:'pencil' as const,preset:'HB',color:[1,0,0]as[number,number,number],timestamp:seq,dabs:[],strokeId,strokeEnd:true});
const undo={id:'UndoB',seq:283,type:'operation_undo' as const,userId:'owner',timestamp:283,targetOpId:'B'};
const redo={...undo,id:'RedoB',seq:285,type:'operation_redo' as const,targetOpId:'B'};
function incoming(op:Operation){return {op,state:'done' as const,serverSeq:op.seq}}
it('held target plus incoming Undo folds canonical metadata across page boundary',()=>{const l=new OperationLog();l.append(stroke('B',282),{serverSeq:282});l.prependHistorical([incoming(undo)],true);expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('undone');expect(l.pixelOpDoneCount('A')).toBe(0)});
it('held Undo plus incoming target folds canonical metadata across page boundary',()=>{const l=new OperationLog();l.append(undo,{serverSeq:283});l.applyUndo('B','owner');l.prependHistorical([incoming(stroke('B',282))],true);expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('undone');expect(l.pixelOpDoneCount('A')).toBe(0)});
it('a later genuine action retires that cross-page undone target',()=>{const l=new OperationLog();l.append(undo,{serverSeq:283});l.append(stroke('later',284),{serverSeq:284});l.prependHistorical([incoming(stroke('B',282))],true);expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('gone');expect(l.pixelOpDoneCount('A')).toBe(1)});
it('default prepend preserves resolved caller states and terminal intentional revoke',()=>{const l=new OperationLog();l.append(stroke('B',282),{serverSeq:282});l.revoke('B');l.prependHistorical([incoming(undo),incoming(redo)],true);expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('gone');const old=new OperationLog();old.prependHistorical([{...incoming(stroke('old',1)),state:'undone'}]);expect(old.entries[0].state).toBe('undone')});
it('pending region state and ordering survive the opt-in background fold',()=>{const l=new OperationLog();l.append(stroke('pending',284),{pending:true});l.prependHistorical([incoming(stroke('B',282)),incoming(undo)],true);expect(l.entries.at(-1)).toMatchObject({pending:true,state:'done',op:{id:'pending'}});expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('gone');expect(l.pixelOpDoneCount('A')).toBe(1)});

it('delayed Redo before a branch action recovers canonical gone without reviving local revoke',()=>{const l=new OperationLog();l.append(stroke('B',282),{serverSeq:282});l.append(undo,{serverSeq:283});l.applyUndo('B','owner');l.append(stroke('later',285),{serverSeq:285});expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('gone');l.prependHistorical([incoming({...redo,id:'Redo284',seq:284})],true);expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('done');expect(l.pixelOpDoneCount('A')).toBe(2)});

it('cross-page opacity coalescence retires the superseded identity before Undo',()=>{const l=new OperationLog();const a={id:'opacityA',seq:10,type:'layer_opacity' as const,userId:'owner',timestamp:10,layerId:'A',opacity:.2};const b={...a,id:'opacityB',seq:11,opacity:.8};l.append(a,{serverSeq:10});l.prependHistorical([incoming(b),incoming({...undo,id:'UndoOpacity',seq:12,targetOpId:b.id})],true);expect(l.entries.find(e=>e.op.id===a.id)?.state).toBe('gone');expect(l.entries.find(e=>e.op.id===b.id)?.state).toBe('undone');expect(l.doneOperations().filter(o=>o.type==='layer_opacity')).toEqual([])});
it('discarded pending Undo has no effect when another cross-page target arrives',()=>{const l=new OperationLog();l.append(stroke('B',282),{serverSeq:282});l.append(undo,{pending:true});l.applyUndo('B','owner');l.revoke(undo.id);l.applyRedo('B','owner');const otherUndo={...undo,id:'OtherUndo',userId:'other',seq:2,targetOpId:'Other'};l.append(otherUndo,{serverSeq:2});l.prependHistorical([incoming({...stroke('Other',1),userId:'other'})],true);expect(l.entries.find(e=>e.op.id==='B')?.state).toBe('done');expect(l.entries.find(e=>e.op.id===undo.id)).toMatchObject({pending:true,state:'gone'});expect(l.entries.find(e=>e.op.id==='Other')?.state).toBe('undone')});

it('history fold is invariant across finite contiguous page partitions and every page arrival order',()=>{
 const sequence=[stroke('B',282),undo,{...redo,id:'Redo284',seq:284},stroke('New285',285)];
 function fold(ops:Operation[]){const l=new OperationLog();for(const op of ops){l.append(op,{serverSeq:op.seq});if(op.type==='operation_undo')l.applyUndo(op.targetOpId,op.userId);else if(op.type==='operation_redo')l.applyRedo(op.targetOpId,op.userId)}return l}
 function permutations<T>(xs:T[]):T[][]{return xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]]}
 let scenarios=0;
 for(let length=1;length<=sequence.length;length++){
  const ops=sequence.slice(0,length);
  for(let cuts=0;cuts<2**(length-1);cuts++){
   const pages:Operation[][]=[[]];for(let i=0;i<ops.length;i++){pages.at(-1)!.push(ops[i]);if(i<ops.length-1&&(cuts&(1<<i)))pages.push([])}
   for(const order of permutations(pages)){
    scenarios++;const actual=new OperationLog(),known:Operation[]=[];
    for(const page of order){known.push(...page);const scratch=fold(page);actual.prependHistorical(scratch.entries,true);const canonical=fold([...known].sort((a,b)=>(a.seq??0)-(b.seq??0)));expect(actual.entries.map(e=>[e.op.id,e.serverSeq,e.state]),JSON.stringify(order.map(p=>p.map(o=>o.id)))).toEqual(canonical.entries.map(e=>[e.op.id,e.serverSeq,e.state]));expect(actual.pixelOpDoneCount('A')).toBe(canonical.pixelOpDoneCount('A'))}
   }
  }
 }
 expect(scenarios).toBe(64);
});
