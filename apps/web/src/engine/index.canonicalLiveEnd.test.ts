import{it,expect,vi}from'vitest'
import{PencilEngine}from'./index'
import{BrushBehaviorPainter,type BehaviorScratch}from'./src/dabs/BrushBehaviorPainter'
for(const capability of ['filterSmudge147','spray146','cloneProjection149'])it(capability+' live END preserves source and uncommitted tail until durable END',()=>{
 const target={},source={capability,binding:{userId:'u',strokeId:'A'},release:vi.fn()},temporary={value:3,release:vi.fn()},scratch={canonicalSource:source,filterSmudge147State:temporary,brushBehavior:{dabSequence:3}}as unknown as BehaviorScratch
 const painter=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter,paint=vi.fn();Object.assign(painter,{bindings:new Map([[scratch,{runtime:{capability}}]]),paint})
 const finish=vi.fn((s:BehaviorScratch)=>painter.finish(s)),live={peerId:'u',strokeId:'A',layerId:'L',paintedTotal:3,committedOffset:1,ended:false},host={_smudge:{finishSecondary:vi.fn(),finishGesture:vi.fn()},_wcAsyncPeerStreams:new Map(),_peerLiveStrokes:new Map([['live',live]]),_replayRibbonChunks:new Map([['A',{target,scratch}]]),_brush:{finish},_beginCapability:()=>capability}
 expect(Reflect.apply(PencilEngine.prototype.endPeerLiveStroke,host,['u','A'])).toBe(2)
 expect(finish).not.toHaveBeenCalled();expect(source.release).not.toHaveBeenCalled();expect(temporary.release).not.toHaveBeenCalled();expect(scratch.canonicalSource).toBe(source);expect(live.ended).toBe(true)
 // The durable operation still owns two non-streamed requests. Their carried
 // device must be the same accepted prefix, rather than a fresh BEGIN device.
 temporary.value+=2;scratch.brushBehavior!.dabSequence!+=2
 expect(temporary.value).toBe(5);expect(scratch.brushBehavior!.dabSequence).toBe(5)
 if(capability!=='cloneProjection149'){
  Reflect.apply(PencilEngine.prototype['_paintDabs'],host,[target,[],'digitalBrush','medium-round',[1,0,0],'u',undefined,undefined,'A',undefined,undefined,undefined,false,true])
  expect(finish).toHaveBeenCalledTimes(1);expect(source.release).toHaveBeenCalledTimes(1);expect(temporary.release).toHaveBeenCalledTimes(1)
  painter.finish(scratch);expect(source.release).toHaveBeenCalledTimes(1)
 }
})
it('ordinary live END keeps the existing finish path',()=>{const scratch={},finish=vi.fn(),host={_smudge:{finishSecondary:vi.fn()},_wcAsyncPeerStreams:new Map(),_peerLiveStrokes:new Map([['live',{peerId:'u',strokeId:'A',layerId:'L',paintedTotal:2,committedOffset:0}]]),_replayRibbonChunks:new Map([['A',{scratch}]]),_brush:{finish}};Reflect.apply(PencilEngine.prototype.endPeerLiveStroke,host,['u','A']);expect(finish).toHaveBeenCalledWith(scratch)})
