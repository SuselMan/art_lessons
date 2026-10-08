import{it,expect}from'vitest';
import{compareRebaseFields}from'./ownedMaterialRebaseGpu.mjs';
const roles=['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm'];
const fields=()=>roles.map(role=>({role,width:1024,height:1024,bytes:4194304,nonzero:4,sha:role}));
it('does not accept empty, omitted, duplicated or wrong-size field proofs',()=>{
 const a=fields();for(const bad of [[],a.slice(1),[...a.slice(1),a[1]],a.map(f=>({...f,width:1536}))])expect(()=>compareRebaseFields(a,bad,a)).toThrow();
});
it('requires changed predecessor to visibly affect source and exact all thirteen roles',()=>{
 const before=fields(),after=fields().map(f=>({...f,sha:f.role==='coverage'||f.role==='presentation'?f.sha+'changed':f.sha}));
 expect(compareRebaseFields(before,after,after)).toMatchObject({exact:true,negativeDetected:true,meaningful:true});
 expect(compareRebaseFields(before,before,before).negativeDetected).toBe(false);
 const different=after.map(f=>({...f,sha:f.role==='colourFilm'?'bad':f.sha}));expect(compareRebaseFields(before,after,different)).toMatchObject({exact:false,differences:['colourFilm']});
 expect(compareRebaseFields(before,after.map(f=>({...f,nonzero:0})),after).meaningful).toBe(false);
});
