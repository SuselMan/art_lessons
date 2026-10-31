import ts from 'typescript'
import path from 'node:path'
/** QA-only memory transform: class identity/prototype and original bodies stay
 * intact. No file write or GL call is performed by instrumentation. */
export function instrumentColdModule(file:string,source:string){
 const basename=path.basename(file),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
 const edits:{start:number;end:number;text:string}[]=[],patches:string[]=[]
 const emit=`\nfunction __qaColdEmit(event:string,name:string,elapsed:number){try{const report=Reflect.get(globalThis,'__qaColdReport');if(typeof report==='function')report(event,name,elapsed)}catch{/* QA must never replace a primary failure. */}}\n`
 if(basename==='BrushGlState.ts'){
  const functions=ast.statements.filter((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&n.name?.text==='saveBrushGlState')
  if(functions.length!==1)throw Error('Expected one GL state capture function')
  const fn=functions[0],name=fn.name!,exported=fn.modifiers?.find(m=>m.kind===ts.SyntaxKind.ExportKeyword)
  if(!fn.body||!exported)throw Error('Unexpected GL state capture shape')
  edits.push({start:name.getStart(ast),end:name.end,text:'__qaColdSaveOriginal'},{start:exported.getStart(ast),end:exported.end,text:''})
  edits.push({start:source.length,end:source.length,text:emit+`
export function saveBrushGlState(...args:Parameters<typeof __qaColdSaveOriginal>):ReturnType<typeof __qaColdSaveOriginal>{
 const at=performance.now();__qaColdEmit('enter','stateCapture',0)
 let restore:ReturnType<typeof __qaColdSaveOriginal>
 try{restore=__qaColdSaveOriginal(...args)}finally{__qaColdEmit('exit','stateCapture',performance.now()-at)}
 return ()=>{const at=performance.now();__qaColdEmit('enter','stateRestore',0);try{return restore()}finally{__qaColdEmit('exit','stateRestore',performance.now()-at)}}
}
`})
  patches.push('saveBrushGlState capture/restore wrapper')
 }else if(basename==='AccumulationBuffer.ts'){
  const klass=ast.statements.find((n):n is ts.ClassDeclaration=>ts.isClassDeclaration(n)&&n.name?.text==='AccumulationBuffer')
  if(!klass)throw Error('Expected actual AccumulationBuffer class')
  for(const [method,tag]of [['constructor','allocationConstructor'],['_checkColdError','coldErrorCheck'],['clear','clear']]as const){
   const members=klass.members.filter(m=>method==='constructor'?ts.isConstructorDeclaration(m):ts.isMethodDeclaration(m)&&m.name.getText(ast)===method)
   if(members.length!==1)throw Error('Unexpected instrumented method count '+method)
   const member=members[0] as ts.ConstructorDeclaration|ts.MethodDeclaration,body=member.body
   if(!body)throw Error('Missing actual method body '+method)
   const start=body.getStart(ast)+1,end=body.end-1
   edits.push({start,end,text:`\nconst __qaAt=performance.now();__qaColdEmit('enter','${tag}',0);try{${source.slice(start,end)}\n}finally{__qaColdEmit('exit','${tag}',performance.now()-__qaAt)}\n`})
   patches.push('AccumulationBuffer.'+method+' body timing only')
  }
  edits.push({start:source.length,end:source.length,text:emit})
 }else return undefined
 let contents=source
 for(const edit of edits.sort((a,b)=>b.start-a.start))contents=contents.slice(0,edit.start)+edit.text+contents.slice(edit.end)
 return {contents,patches}
}
