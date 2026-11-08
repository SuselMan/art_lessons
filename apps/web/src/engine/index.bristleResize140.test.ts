import{expect,it}from'vitest'
import{packDabs,unpackDabs}from'@grafetto/shared'
import{library140}from'../../../../packages/shared/src/bristleResize140.testFixture'
import{bristle141}from'../../../../packages/shared/src/bristleInitialization141.testFixture'
import{installBrushLibrary,retainImportedBrushResources}from'./brushLibrary'
import{DabSystem}from'./src/dabs/DabSystem'
import{createTestEngine,paperReady,pointerSample}from'./testing/engineTestUtils'

it('actual author sampler records bounded initialization size through the existing codec for new140/141 and not legacy139',async()=>{
 const library=library140(),brush=library.brushes[0].descriptor,plain=bristle141()
 const old=structuredClone(brush);old.id='imported-'+ 'fa'.repeat(12);old.version=139
 if(old.bristle?.version!==2||!old.bristle.soak)throw Error('fixture')
 delete old.bristle.soak.resizePolicy
 installBrushLibrary({...library,brushes:[...library.brushes,{name:'NoInk141',source:'noink141.kpp',warnings:[],descriptor:plain},{name:'Old139',source:'old139.kpp',warnings:[],descriptor:old}]})
 const{engine}=createTestEngine()
 try{
  await paperReady(engine);engine.initLayer('L');engine.setActiveLayer('L');engine.setTool('digitalBrush');engine.setSize(48)
  for(const current of[brush,plain,old]){
   engine.setPencil(`brush:${current.id}@${current.version}`)
   const snapshot=engine['_captureAuthorStart'](pointerSample(10,20),0);if(!snapshot)throw Error('capture')
   const sampler=new DabSystem();engine['_configureAuthorSampler'](sampler,snapshot,undefined)
   const dabs=sampler.startStroke(10,20,.5,0,0,48,0,.2,0)
   expect(dabs.length).toBeGreaterThan(0)
   const encoded=unpackDabs(packDabs(dabs))
   if(current!==old){expect(sampler.captureSourceSize).toBe(true);expect(encoded.every(d=>d.sourceSize===48&&typeof d.sourceScale==='number'&&d.sourceScale>=0&&d.sourceScale<=1)).toBe(true)}
   else{expect(sampler.captureSourceSize).toBe(false);expect(encoded.every(d=>d.sourceSize===undefined&&d.sourceScale===undefined)).toBe(true)}
  }
 }finally{engine.destroy();retainImportedBrushResources([])}
})
