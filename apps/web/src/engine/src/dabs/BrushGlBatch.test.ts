import {registerGlClearState,captureGlClearState,setGlClearColor} from '../raster/GlClearState'
import * as uploadTurn from './BrushGlBatch'
import { ownedBrushFixture } from '../../testing/ownedBrushFixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordingGL } from '../../testing/brushPassTestUtils'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'
import { runBrushGlTurn, type BrushGlTurn, runBrushGlBatch, type BrushGlBatchFrame, type BrushGlBatchInfo, type BrushGlBatchParticipant } from './BrushGlBatch'
function setup() {
  const { gl, snapshot } = recordingGL()
  gl.isContextLost = () => false
  const cache = new BrushTextureCache(gl), cpu = new BrushMipCache(), epoch = {}, instancing = gl.getExtension('ANGLE_instanced_arrays')
  let active: BrushGlBatchFrame | undefined
  const service: BrushGlBatchParticipant = {
    brushGlBatchInfo: () => ({ gl, cache, cpu, epoch, attributes: [0, 1, 2, 3], vertexArrays: null, instancing, resources: [] }),
    enterBrushGlBatch: frame => { if (active) throw Error('already active'); active = frame; return () => { active = undefined } },
  }
  return { gl, cache, cpu, snapshot, service }
}
afterEach(() => vi.restoreAllMocks())
describe('explicit synchronous brush GL batch', () => {
  it('captures the union once and restores fallback pointers/ANGLE, even after a later draw throws', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100)
    const s = setup(), before = s.snapshot(), queries = vi.spyOn(s.gl, 'getParameter')
    let captured: BrushGlBatchFrame | undefined
    expect(() => runBrushGlBatch({ participants: [s.service] }, frame => {
      captured = frame
      const atStart = queries.mock.calls.length
      for (let i = 0; i < 4; i++) {
        frame.assert(s.service, []); frame.beginDraw()
        s.gl.bindBuffer(s.gl.ARRAY_BUFFER, s.gl.createBuffer())
        s.gl.vertexAttribPointer(i, 2, s.gl.FLOAT, false, 8, 0)
        s.gl.getExtension('ANGLE_instanced_arrays').vertexAttribDivisorANGLE(i, 0)
      }
      expect(queries.mock.calls.length).toBe(atStart)
      throw Error('second GPU command')
    })).toThrow('second GPU command')
    expect(s.snapshot()).toEqual(before)
    expect(s.cpu.reservedBytes).toBe(0)
    expect(() => captured!.assert(s.service, [])).toThrow('Closed')
    runBrushGlBatch({ participants: [s.service] }, () => {})
  })
  it('captures before owner callbacks and restores their mutations on success/failure, rejects async/reentry', () => {
    const s = setup(), events: string[] = [], query = vi.spyOn(s.gl, 'getParameter')
    const before = s.snapshot();
    const owner = { owner: {}, lease: () => { expect(query.mock.calls.length).toBeGreaterThan(0); s.gl.activeTexture(s.gl.TEXTURE0); s.gl.bindTexture(s.gl.TEXTURE_2D, s.gl.createTexture()); events.push('acquire'); return () => { events.push('release') } } }
    expect(() => runBrushGlBatch({ participants: [s.service], owners: [owner] }, frame => {
      expect(() => runBrushGlBatch({ participants: [s.service] }, () => {})).toThrow('active')
      frame.assert(s.service, [], [owner])
      return Promise.resolve()
    })).toThrow('synchronous')
    expect(events).toEqual(['acquire', 'release'])
    expect(s.snapshot()).toEqual(before)
    query.mockClear()
    expect(() => runBrushGlBatch({ participants: [s.service], owners: [owner, { owner: {}, lease: () => { s.gl.bindFramebuffer(s.gl.FRAMEBUFFER, s.gl.createFramebuffer()); throw Error('owner failed') } }] }, () => {})).toThrow('owner failed')
    expect(events).toEqual(['acquire', 'release', 'acquire', 'release'])
    expect(s.snapshot()).toEqual(before)
    runBrushGlBatch({participants:[s.service],owners:[owner]},()=>{})
    expect(s.snapshot()).toEqual(before)
  })
  it('requires the same context/cache/epoch and all resources/owners before work', () => {
    const s = setup(), other = setup(), rogue = { owner: {}, lease: () => () => {} }
    expect(() => runBrushGlBatch({ participants: [s.service, other.service] }, () => {})).toThrow('context/cache')
    expect(() => runBrushGlBatch({ participants: [s.service], resources: [{ key: 'missing', bytes: 4 }] }, () => {})).toThrow('Unprepared')
    runBrushGlBatch({ participants: [s.service] }, frame => {
      expect(() => frame.assert(other.service, [])).toThrow('foreign')
      expect(() => frame.assert(s.service, [], [rogue])).toThrow('owner')
      const original = s.service.brushGlBatchInfo()
      s.service.brushGlBatchInfo = () => ({ ...original, epoch: {} })
      expect(() => frame.assert(s.service, [])).toThrow('epoch')
    })
  })
  it('enforces eight draws, signals soft 4ms, and cleans up groups', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0), s = setup(), released = vi.fn()
    runBrushGlBatch({ participants: [s.service] }, frame => {
      frame.holdGroup(released)
      for (let i = 0; i < 8; i++) frame.beginDraw()
      expect(frame.shouldYield).toBe(true)
      expect(() => frame.beginDraw()).toThrow('budget')
    })
    expect(released).toHaveBeenCalledOnce()
    runBrushGlBatch({ participants: [s.service] }, frame => {
      frame.beginDraw(); now.mockReturnValue(4)
      expect(frame.shouldYield).toBe(true)
      expect(() => frame.beforeWork()).not.toThrow()
    })
  })
  it('restores the caller OES VAO once without probing unrelated attribs', () => {
    const s = setup(), caller = {}, owned = {}; let current = caller
    const ext = { VERTEX_ARRAY_BINDING_OES: 9900, bindVertexArrayOES: (v: object) => { current = v } }
    const original = s.gl.getParameter
    s.gl.getParameter = (name: number) => name === ext.VERTEX_ARRAY_BINDING_OES ? current : original(name)
    const attrib = vi.spyOn(s.gl, 'getVertexAttrib')
    const info = s.service.brushGlBatchInfo()
    s.service.brushGlBatchInfo = () => ({ ...info, vertexArrays: ext } as unknown as BrushGlBatchInfo)
    runBrushGlBatch({ participants: [s.service] }, () => { ext.bindVertexArrayOES(owned) })
    expect(current).toBe(caller); expect(attrib).not.toHaveBeenCalled()
  })
})

it('finishes the paired first draw when admitted prepass work crosses the soft deadline',()=>{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=setup();
  runBrushGlBatch({participants:[s.service]},frame=>{
    frame.beginDraw(); // an earlier command, now below deadline
    const token=frame.beginGroup();
    clock.mockReturnValue(5); // preparing this already-admitted mask takes time
    expect(frame.shouldYield).toBe(true);
    expect(()=>frame.beginDraw()).not.toThrow();
    frame.endGroup(token);
    expect(()=>frame.beginGroup()).not.toThrow();
  });
});
it('refuses transient CPU overflow before acquisition and releases reservations after context loss',()=>{
  const s=setup(),acquire=vi.fn(()=>()=>{}),release=s.cpu.reserve(s.cpu.budgetBytes-4000);
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[{owner:{},lease:acquire}]},()=>{})).toThrow();
  expect(acquire).not.toHaveBeenCalled();release();
  const ownerRelease=vi.fn();
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[{owner:{},lease:()=>ownerRelease}]},frame=>{
    s.gl.isContextLost=()=>true;
    frame.beginDraw();
  })).toThrow('context lost');
  expect(ownerRelease).toHaveBeenCalledOnce();expect(s.cpu.reservedBytes).toBe(0);
  s.gl.isContextLost=()=>false;
  runBrushGlBatch({participants:[s.service]},()=>{});
});

it('signals yield after eight empty groups and after elapsed group work without a draw',()=>{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=setup();
  runBrushGlBatch({participants:[s.service]},frame=>{
    for(let i=0;i<8;i++){const token=frame.beginGroup();frame.endGroup(token)}
    expect(frame.shouldYield).toBe(true);expect(()=>frame.beginGroup()).toThrow('budget');
  });
  runBrushGlBatch({participants:[s.service]},frame=>{
    const token=frame.beginGroup();frame.endGroup(token);clock.mockReturnValue(4);
    expect(frame.shouldYield).toBe(true);
  });
});

it('admits the next full request when metadata crosses the cooperative deadline after a caller check',()=>{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=setup();
  runBrushGlBatch({participants:[s.service]},frame=>{
    frame.beginDraw();clock.mockReturnValue(3.9);
    expect(frame.shouldYield).toBe(false);
    clock.mockReturnValue(4.1); // CPU metadata of the next recorded request
    const token=frame.beginGroup();
    expect(()=>frame.beginDraw()).not.toThrow();frame.endGroup(token);
    expect(frame.shouldYield).toBe(true);
  });
});


it('preserves the draw failure while releasing every owner and group after cleanup failures', () => {
  const s = setup(), before = s.snapshot(), released: string[] = []
  const owners = ['first', 'second'].map(name => ({
    owner: {},
    lease: () => () => { released.push(name); throw Error(`release ${name}`) },
  }))
  expect(() => runBrushGlBatch({ participants: [s.service], owners }, frame => {
    frame.holdGroup(() => { released.push('group first'); throw Error('group cleanup') })
    frame.holdGroup(() => { released.push('group second') })
    s.gl.bindBuffer(s.gl.ARRAY_BUFFER, s.gl.createBuffer())
    throw Error('original draw failure')
  })).toThrow('original draw failure')
  expect(released).toEqual(['group second', 'group first', 'second', 'first'])
  expect(s.snapshot()).toEqual(before)
  expect(s.cpu.reservedBytes).toBe(0)
  runBrushGlBatch({ participants: [s.service] }, () => {})
})

it('omits sampler journal only for exact owner-attested prepared handles and still journals an external texture',()=>{
  const s=setup(),info=s.service.brushGlBatchInfo(),allocation=ownedBrushFixture(s.gl,4),owned=allocation.texture,external=s.gl.createTexture();
  s.cache.protect(['owned']);s.cache.putOwned('owned',allocation);
  s.service.brushGlBatchInfo=()=>({...info,resources:[{key:'owned',bytes:4}],ownedPointSamplers:[{key:'owned',bytes:4,texture:owned,epoch:info.epoch}]});
  s.gl.getTexParameter=vi.fn((_:number,p:number)=>p===s.gl.TEXTURE_MIN_FILTER||p===s.gl.TEXTURE_MAG_FILTER?9010:9011);
  const samplerWrites=s.gl.texParameteri.mock.calls.length,before=s.snapshot();
  runBrushGlBatch({participants:[s.service]},frame=>{
    s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,owned);
    frame.pointSampling(owned);frame.pointSampling(owned);
    expect(s.gl.getTexParameter).not.toHaveBeenCalled();expect(s.gl.texParameteri.mock.calls.length).toBe(samplerWrites);
    s.gl.bindTexture(s.gl.TEXTURE_2D,external);frame.pointSampling(external);frame.pointSampling(external);
    expect(s.gl.getTexParameter).toHaveBeenCalledTimes(4);
  });
  expect(s.gl.texParameteri.mock.calls.slice(-4).map((call:number[])=>call[2])).toEqual([9010,9010,9011,9011]);
  expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0);
});
it('rejects forged/stale owned sampler metadata and conflicting aliases before capture or ownership effects',()=>{
  const s=setup(),info=s.service.brushGlBatchInfo(),allocation=ownedBrushFixture(s.gl,4),texture=allocation.texture,other=s.gl.createTexture();
  s.cache.protect(['first','alias']);s.cache.putOwned('first',allocation);s.cache.putOwned('alias',ownedBrushFixture(s.gl,4));
  const valid={key:'first',bytes:4,texture,epoch:info.epoch},resources=[{key:'first',bytes:4},{key:'alias',bytes:4}],acquire=vi.fn(()=>()=>{});
  const query=vi.spyOn(s.gl,'getParameter');
  for(const entry of [{...valid,key:'unknown'},{...valid,bytes:8},{...valid,texture:other},{...valid,epoch:{}}]){
    s.service.brushGlBatchInfo=()=>({...info,resources,ownedPointSamplers:[entry]});
    expect(()=>runBrushGlBatch({participants:[s.service],owners:[{owner:{},lease:acquire}]},()=>{})).toThrow('owned sampler');
  }
  s.service.brushGlBatchInfo=()=>({...info,resources,ownedPointSamplers:[valid,{...valid,key:'alias'}]});
  expect(()=>runBrushGlBatch({participants:[s.service]},()=>{})).toThrow('owned sampler');
  expect(query).not.toHaveBeenCalled();expect(acquire).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(0);
});
it('rechecks sampler owner epoch at use and restores only external sampler entries after a failed command',()=>{
  const s=setup(),info=s.service.brushGlBatchInfo(),allocation=ownedBrushFixture(s.gl,4),texture=allocation.texture,external=s.gl.createTexture();
  s.cache.protect(['owned']);s.cache.putOwned('owned',allocation);
  const prepared={...info,resources:[{key:'owned',bytes:4}],ownedPointSamplers:[{key:'owned',bytes:4,texture,epoch:info.epoch}]};
  s.service.brushGlBatchInfo=()=>prepared;s.gl.getTexParameter=vi.fn(()=>9010);
  const before=s.snapshot();
  expect(()=>runBrushGlBatch({participants:[s.service]},frame=>{
    s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,texture);frame.pointSampling(texture);
    s.gl.bindTexture(s.gl.TEXTURE_2D,external);frame.pointSampling(external);
    s.service.brushGlBatchInfo=()=>({...prepared,epoch:{}});
    frame.pointSampling(texture);
  })).toThrow('epoch/residency');
  expect(s.gl.getTexParameter).toHaveBeenCalledTimes(4);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0);
});


describe('one owned synchronous preparation/draw capture',()=>{
  it('captures once before preparation and shares one4096base reservation through inner and outer restoration',()=>{
    const s=setup(), before=s.snapshot(), query=vi.spyOn(s.gl,'getParameter'), cpu=new BrushMipCache(4500), info=s.service.brushGlBatchInfo();
    s.service.brushGlBatchInfo=()=>({...info,cpu});
    let queries=0;
    const release=vi.fn(()=>{expect(s.snapshot()).toEqual(before);s.gl.activeTexture(s.gl.TEXTURE0+2);s.gl.disable(s.gl.BLEND)});
    runBrushGlTurn({participants:[s.service]},turn=>{
      expect(cpu.reservedBytes).toBe(4096);queries=query.mock.calls.length;expect(queries).toBeGreaterThan(0);
      // Target allocation/copy callbacks are covered by the capture too.
      s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer());s.gl.bindBuffer(s.gl.ARRAY_BUFFER,s.gl.createBuffer());
      s.gl.vertexAttribPointer(0,2,s.gl.FLOAT,false,8,0);
      runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>release}]},frame=>{
        expect(cpu.reservedBytes).toBe(4096+256+128);frame.beginDraw();s.gl.colorMask(true,true,true,true);
        expect(query.mock.calls.length).toBe(queries);
      });
      expect(cpu.reservedBytes).toBe(4096);expect(release).toHaveBeenCalledOnce();
      s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer()); // preparation finally/cleanup mutation
    });
    expect(query.mock.calls.length).toBe(queries);expect(s.snapshot()).toEqual(before);expect(cpu.reservedBytes).toBe(0);
  });
  it('rejects unknown, expired, double-use and nested authority before GL or participant acquisition',()=>{
    const s=setup(),foreign=setup(), query=vi.spyOn(s.gl,'getParameter'), otherQuery=vi.spyOn(foreign.gl,'getParameter');
    const info=vi.spyOn(s.service,'brushGlBatchInfo'),acquire=vi.spyOn(s.service,'enterBrushGlBatch');let retained:BrushGlTurn|undefined;
    expect(()=>runBrushGlBatch({turn:{} as BrushGlTurn,participants:[s.service]},()=>{})).toThrow('Unknown');
    expect(info).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
    runBrushGlTurn({participants:[s.service]},turn=>{
      retained=turn;query.mockClear();info.mockClear();
      expect(()=>runBrushGlTurn({participants:[s.service]},()=>{})).toThrow('Nested');
      expect(()=>runBrushGlBatch({participants:[s.service]},()=>{})).toThrow('requires its owned turn');
      expect(()=>runBrushGlBatch({turn,participants:[foreign.service]},()=>{})).toThrow('Foreign');
      expect(query).not.toHaveBeenCalled();expect(otherQuery).not.toHaveBeenCalled();expect(acquire).not.toHaveBeenCalled();
      runBrushGlBatch({turn,participants:[s.service]},frame=>frame.beginDraw());
      query.mockClear();info.mockClear();
      expect(()=>runBrushGlBatch({turn,participants:[s.service]},()=>{})).toThrow('reused');
      expect(info).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
    });
    query.mockClear();info.mockClear();
    expect(()=>runBrushGlBatch({turn:retained!,participants:[s.service]},()=>{})).toThrow('Unknown');
    expect(info).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(0);
  });
  it('rejects participant, epoch and declared-attribute drift before owner callbacks or another capture',()=>{
    for(const field of ['epoch','attributes','vertexArrays'] as const){
      const s=setup(),original=s.service.brushGlBatchInfo(),query=vi.spyOn(s.gl,'getParameter'),acquire=vi.fn(()=>()=>{});
      runBrushGlTurn({participants:[s.service]},turn=>{
        query.mockClear();
        s.service.brushGlBatchInfo=()=>({...original,...(field==='epoch'?{epoch:{}}:field==='attributes'?{attributes:[0,1]}:{vertexArrays:{} as OES_vertex_array_object})});
        expect(()=>runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:acquire}]},()=>{})).toThrow('changed');
        expect(acquire).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
      });
      expect(s.cpu.reservedBytes).toBe(0);
    }
  });
  it('rechecks declared state after owner acquisition before opening pixel work',()=>{
    const s=setup(),original=s.service.brushGlBatchInfo(),draw=vi.fn(),release=vi.fn();
    expect(()=>runBrushGlTurn({participants:[s.service]},turn=>runBrushGlBatch({turn,participants:[s.service],
      owners:[{owner:{},lease:()=>{s.service.brushGlBatchInfo=()=>({...original,attributes:[0]});return release}}]},()=>draw()))).toThrow('changed during acquisition');
    expect(draw).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();expect(s.cpu.reservedBytes).toBe(0);
  });
  it('restores target preparation failures and refuses a reentrant target rebuild without leaking authority',()=>{
    const s=setup(),before=s.snapshot(),draw=vi.fn();let retained:BrushGlTurn|undefined;
    expect(()=>runBrushGlTurn({participants:[s.service]},turn=>{
      retained=turn;s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer());
      // A canonical history rebuild cannot silently acquire a second owner.
      runBrushGlTurn({participants:[s.service]},()=>draw());
    })).toThrow('Nested');
    expect(draw).not.toHaveBeenCalled();expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0);
    expect(()=>runBrushGlBatch({turn:retained!,participants:[s.service]},()=>{})).toThrow('Unknown');
    runBrushGlTurn({participants:[s.service]},turn=>runBrushGlBatch({turn,participants:[s.service]},()=>{}));
    expect(s.snapshot()).toEqual(before);
  });
  it('preserves primary draw failure through group/owner/first-restore failures and still restores outer state',()=>{
    const s=setup(),before=s.snapshot(),primary=new Error('primary draw'),group=vi.fn(()=>{throw Error('group cleanup')}),owner=vi.fn(()=>{s.gl.disable(s.gl.BLEND);throw Error('owner cleanup')});
    const store=s.gl.pixelStorei;let thrown=false;
    s.gl.pixelStorei=(p:number,v:number)=>{store(p,v);if(!thrown&&v===before.unpack){thrown=true;throw Error('first restore')}};
    let received:unknown;
    try{runBrushGlTurn({participants:[s.service]},turn=>{
      runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>owner}]},frame=>{
        frame.holdGroup(group);frame.beginDraw();s.gl.viewport(0,0,1,1);throw primary;
      });
    })}catch(error){received=error}
    expect(received).toBe(primary);expect(group).toHaveBeenCalledOnce();expect(owner).toHaveBeenCalledOnce();
    expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0);
  });
  it('does not restore lost GL, releases all reservations, rejects async authority and permits a new healthy turn',()=>{
    const s=setup(),release=vi.fn(),restore=vi.spyOn(s.gl,'useProgram');let retained:BrushGlTurn|undefined;
    expect(()=>runBrushGlTurn({participants:[s.service]},turn=>{
      retained=turn;runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>release}]},frame=>{
        s.gl.isContextLost=()=>true;frame.beginDraw();
      });
    })).toThrow('context lost');
    expect(restore).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();expect(s.cpu.reservedBytes).toBe(0);
    s.gl.isContextLost=()=>false;
    expect(()=>runBrushGlBatch({turn:retained!,participants:[s.service]},()=>{})).toThrow('Unknown');
    expect(()=>runBrushGlTurn({participants:[s.service]},()=>Promise.resolve())).toThrow('synchronous');
    runBrushGlTurn({participants:[s.service]},()=>{});expect(s.cpu.reservedBytes).toBe(0);
  });
  it('refuses outer CPU overflow before capture and attempts every external sampler restore after a setter failure',()=>{
    const s=setup(),query=vi.spyOn(s.gl,'getParameter'),release=s.cpu.reserve(s.cpu.budgetBytes-4000);
    expect(()=>runBrushGlTurn({participants:[s.service]},()=>{})).toThrow('budget');expect(query).not.toHaveBeenCalled();release();
    const before=s.snapshot(),primary=new Error('draw'),textureA=s.gl.createTexture(),textureB=s.gl.createTexture();s.gl.getTexParameter=()=>9900;
    let cleanup=false;const set=s.gl.texParameteri;
    s.gl.texParameteri=vi.fn((target:number,p:number,value:number)=>{if(cleanup&&p===s.gl.TEXTURE_MIN_FILTER)throw Error('sampler restore');set(target,p,value)});
    let received:unknown;
    try{runBrushGlTurn({participants:[s.service]},turn=>runBrushGlBatch({turn,participants:[s.service]},frame=>{
      s.gl.activeTexture(s.gl.TEXTURE0);for(const texture of [textureA,textureB]){s.gl.bindTexture(s.gl.TEXTURE_2D,texture);frame.pointSampling(texture)}
      frame.beginDraw();cleanup=true;throw primary;
    }))}catch(error){received=error}
    expect(received).toBe(primary);
    expect(s.gl.texParameteri.mock.calls.filter((c:unknown[])=>c[2]===9900)).toHaveLength(8);
    expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0);
  });
});

function externalPointOwner(s:ReturnType<typeof setup>){
  const epoch={alive:true},source={texture:s.gl.createTexture(),gl:s.gl},released=vi.fn(),lease=vi.fn(()=>released)
  return{owner:epoch,ownedPointSampler:{texture:source.texture,source,epoch},lease,released,source}
}
it('borrows an exact lifetime-owned point sampler without querying it, while preserving foreign sampler restoration',()=>{
  const s=setup(),o=externalPointOwner(s),foreign=s.gl.createTexture(),before=s.snapshot();s.gl.getTexParameter=vi.fn(()=>9011)
  const writes=s.gl.texParameteri.mock.calls.length
  runBrushGlBatch({participants:[s.service],owners:[o]},frame=>{
    s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,o.source.texture)
    frame.pointSampling(o.source.texture);frame.pointSampling(o.source.texture)
    expect(s.gl.getTexParameter).not.toHaveBeenCalled();expect(s.gl.texParameteri.mock.calls.length).toBe(writes)
    s.gl.bindTexture(s.gl.TEXTURE_2D,foreign);frame.pointSampling(foreign)
    expect(s.gl.getTexParameter).toHaveBeenCalledTimes(4)
  })
  expect(o.lease).toHaveBeenCalledTimes(1);expect(o.released).toHaveBeenCalledTimes(1)
  expect(s.gl.texParameteri.mock.calls.slice(-4).map((a:number[])=>a[2])).toEqual([9011,9011,9011,9011])
  expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects stale, forged or conflicting lifetime point metadata before ownership effects',()=>{
  const s=setup(),o=externalPointOwner(s),valid=o.ownedPointSampler,query=vi.spyOn(s.gl,'getParameter')
  for(const bad of [{...valid,epoch:{alive:true}},{...valid,texture:s.gl.createTexture()},{...valid,source:null},null]){
    expect(()=>runBrushGlBatch({participants:[s.service],owners:[{...o,ownedPointSampler:bad} as never]},()=>{})).toThrow(/owned sampler/)
  }
  o.owner.alive=false;expect(()=>runBrushGlBatch({participants:[s.service],owners:[o]},()=>{})).toThrow(/owned sampler/);o.owner.alive=true
  const other={...o,owner:{alive:true}};other.ownedPointSampler={...valid,epoch:other.owner}
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o,other]},()=>{})).toThrow(/owned sampler/)
  expect(o.lease).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(0)
})
for(const mutation of ['epoch','texture','declaration'] as const)it(`rejects ${mutation} drift caused by owner acquisition and releases every acquired owner`,()=>{
  const s=setup(),o=externalPointOwner(s),before=s.snapshot(),execute=vi.fn()
  o.lease.mockImplementation(()=>{s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer());if(mutation==='epoch')o.owner.alive=false;else if(mutation==='texture')o.source.texture=s.gl.createTexture();else o.ownedPointSampler={...o.ownedPointSampler};return o.released})
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o]},execute)).toThrow(/owned sampler/)
  expect(execute).not.toHaveBeenCalled();expect(o.released).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('refuses a foreign-context buffer promise before acquiring its owner',()=>{
  const s=setup(),o=externalPointOwner(s);o.source.gl=recordingGL().gl
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o]},()=>{})).toThrow(/owned sampler/)
  expect(o.lease).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(0)
})
it('rechecks lifetime epoch and buffer texture identity at each owned sampler use',()=>{
  const s=setup(),o=externalPointOwner(s),foreign=s.gl.createTexture(),before=s.snapshot();s.gl.getTexParameter=vi.fn(()=>9010)
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o]},frame=>{
    s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,o.source.texture);frame.pointSampling(o.source.texture)
    s.gl.bindTexture(s.gl.TEXTURE_2D,foreign);frame.pointSampling(foreign)
    o.source.texture=foreign;frame.pointSampling(o.ownedPointSampler.texture)
  })).toThrow(/owned sampler/)
  expect(s.gl.getTexParameter).toHaveBeenCalledTimes(4);expect(o.released).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('preserves the first owner failure, rejects reentry and does not use an owned sampler after context loss',()=>{
  const s=setup(),o=externalPointOwner(s),before=s.snapshot(),failure=Error('owner acquire failed'),laterRelease=vi.fn(()=>{throw Error('cleanup failed')})
  o.lease.mockImplementation(()=>{expect(()=>runBrushGlBatch({participants:[s.service]},()=>{})).toThrow(/active/);return laterRelease})
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o,{owner:{},lease:()=>{throw failure}}]},()=>{})).toThrow(failure)
  expect(laterRelease).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
  let lost=false;s.gl.isContextLost=()=>lost;o.lease.mockImplementation(()=>{lost=true;return o.released})
  const execute=vi.fn();expect(()=>runBrushGlBatch({participants:[s.service],owners:[o]},execute)).toThrow(/context lost/)
  expect(execute).not.toHaveBeenCalled();expect(o.released).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes).toBe(0)
})

function fixedFramebufferOwner(s:ReturnType<typeof setup>){
  const certificate=Object.freeze({gl:s.gl,texture:s.gl.createTexture(),framebuffer:s.gl.createFramebuffer(),width:4,height:4})
  const source:{verifiedFramebufferLayout:typeof certificate|undefined}={verifiedFramebufferLayout:certificate},owner={},released=vi.fn(),lease=vi.fn(()=>released)
  const declaration:{source:typeof source;certificate:typeof certificate;originX:number;originY:number}=Object.freeze({source,certificate,originX:8,originY:12})
  const lifetime={owner,ownedFramebufferLayouts:Object.freeze([declaration]),lease}
  const target={texture:certificate.texture,framebuffer:certificate.framebuffer,width:4,height:4,originX:8,originY:12,lifetime}
  return{source,certificate,lifetime,target,released,lease}
}
it('uses an exact cold-certified fixed target and keeps hardware guards for a foreign target',()=>{
  const s=setup(),o=fixedFramebufferOwner(s),foreign={texture:s.gl.createTexture(),framebuffer:s.gl.createFramebuffer(),width:4,height:4,originX:8,originY:12}
  const attachments=new Map([[o.target.framebuffer,o.target.texture],[foreign.framebuffer,foreign.texture]])
  s.gl.getFramebufferAttachmentParameter=vi.fn(()=>attachments.get(s.gl.getParameter(s.gl.FRAMEBUFFER_BINDING)))
  const status=vi.spyOn(s.gl,'checkFramebufferStatus'),before=s.snapshot()
  runBrushGlBatch({participants:[s.service],owners:[o.lifetime]},frame=>{
    frame.bindTarget(o.target);frame.bindTarget(o.target)
    expect(status).not.toHaveBeenCalled();expect(s.gl.getFramebufferAttachmentParameter).not.toHaveBeenCalled()
    frame.bindTarget(foreign);expect(status).toHaveBeenCalledTimes(1);expect(s.gl.getFramebufferAttachmentParameter).toHaveBeenCalledTimes(1)
  })
  expect(o.lease).toHaveBeenCalledTimes(1);expect(o.released).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before)
  attachments.set(foreign.framebuffer,o.target.texture)
  expect(()=>runBrushGlBatch({participants:[s.service]},frame=>frame.bindTarget(foreign))).toThrow(/attachment/)
  expect(status).toHaveBeenCalledTimes(2);expect(s.cpu.reservedBytes).toBe(0)
})
for(const drift of ['certificate','list','geometry','context'] as const)it(`refuses fixed target ${drift} drift before ownership`,()=>{
  const s=setup(),o=fixedFramebufferOwner(s),query=vi.spyOn(s.gl,'getParameter')
  const d=o.lifetime.ownedFramebufferLayouts[0]
  if(drift==='certificate')o.source.verifiedFramebufferLayout=undefined
  else if(drift==='list')o.lifetime.ownedFramebufferLayouts=null as never
  else if(drift==='geometry')o.lifetime.ownedFramebufferLayouts=[{...d,originX:NaN}]
  else{o.source.verifiedFramebufferLayout=Object.freeze({...o.certificate,gl:recordingGL().gl});o.lifetime.ownedFramebufferLayouts=[{...d,certificate:o.source.verifiedFramebufferLayout}]}
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o.lifetime]},()=>{})).toThrow(/framebuffer/)
  expect(o.lease).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(0)
})
it('rechecks fixed certificates after acquisition and before each bind without leaking owners',()=>{
  const s=setup(),o=fixedFramebufferOwner(s),before=s.snapshot(),work=vi.fn()
  o.lease.mockImplementation(()=>{o.source.verifiedFramebufferLayout=undefined;return o.released})
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o.lifetime]},work)).toThrow(/framebuffer/)
  expect(work).not.toHaveBeenCalled();expect(o.released).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before)
  o.source.verifiedFramebufferLayout=o.certificate;o.lease.mockImplementation(()=>o.released)
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o.lifetime]},frame=>{frame.bindTarget(o.target);o.source.verifiedFramebufferLayout=undefined;frame.bindTarget(o.target)})).toThrow(/framebuffer/)
  expect(o.released).toHaveBeenCalledTimes(2);expect(s.cpu.reservedBytes).toBe(0)
})
it('does not grant fixed framebuffer authority to another lifetime or target geometry',()=>{
  const s=setup(),o=fixedFramebufferOwner(s)
  for(const bad of [{...o.target,lifetime:{owner:{},lease:()=>()=>{}}},{...o.target,width:3},{...o.target,texture:s.gl.createTexture()}])
    expect(()=>runBrushGlBatch({participants:[s.service],owners:[o.lifetime]},frame=>frame.bindTarget(bad))).toThrow(/framebuffer|identity/)
  expect(o.released).toHaveBeenCalledTimes(3);expect(s.cpu.reservedBytes).toBe(0)
})

for(const drift of ['epoch','list-size'] as const)it(`rejects fixed framebuffer ${drift} drift after owner acquisition`,()=>{
  const s=setup(),o=fixedFramebufferOwner(s),before=s.snapshot()
  o.lifetime.ownedFramebufferLayouts=[...o.lifetime.ownedFramebufferLayouts]
  o.lease.mockImplementation(()=>{if(drift==='epoch')o.lifetime.owner={};else Reflect.apply(Array.prototype.push,o.lifetime.ownedFramebufferLayouts,[o.lifetime.ownedFramebufferLayouts[0]]);return o.released})
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[o.lifetime]},()=>{})).toThrow(/framebuffer/)
  expect(o.released).toHaveBeenCalledTimes(1);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('charges each unique admitted fixed framebuffer in the existing frame metadata allowance',()=>{
  const s=setup(),o=fixedFramebufferOwner(s)
  runBrushGlBatch({participants:[s.service],owners:[o.lifetime,o.lifetime]},()=>{expect(s.cpu.reservedBytes).toBe(4096+256+128+96)})
  expect(o.lease).toHaveBeenCalledTimes(1);expect(o.released).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes).toBe(0)
})

it('borrows narrow upload restoration only from a genuine opted turn and still admits its one inner batch',()=>{
 const s=setup();s.gl.UNPACK_FLIP_Y_WEBGL=9401;s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL=9402
 const parameters=s.gl.getParameter,store=s.gl.pixelStorei,flags=new Map([[9401,true],[9402,true]])
 s.gl.getParameter=(key:number)=>flags.has(key)?flags.get(key):parameters(key)
 s.gl.pixelStorei=(key:number,value:number|boolean)=>flags.has(key)?flags.set(key,!!value):store(key,value)
 expect(typeof uploadTurn.borrowBrushGlTurnAutoUploadRestore).toBe('function')
 runBrushGlTurn({participants:[s.service]},turn=>expect(()=>uploadTurn.borrowBrushGlTurnAutoUploadRestore(turn,s.service)).toThrow())
 let retained:BrushGlTurn|undefined
 const before=s.snapshot()
 runBrushGlTurn({participants:[s.service],captureAutoUploadUnpack:true},turn=>{
  retained=turn;const restore=uploadTurn.borrowBrushGlTurnAutoUploadRestore(turn,s.service)
  s.gl.pixelStorei(9401,false);s.gl.pixelStorei(9402,false);s.gl.activeTexture(s.gl.TEXTURE0)
  restore();expect(s.snapshot()).toEqual(before);expect(flags.get(9401)).toBe(true);expect(flags.get(9402)).toBe(true)
  expect(()=>uploadTurn.borrowBrushGlTurnAutoUploadRestore(turn,s.service)).toThrow()
  runBrushGlBatch({turn,participants:[s.service]},()=>{})
 })
 expect(()=>uploadTurn.borrowBrushGlTurnAutoUploadRestore(retained!,s.service)).toThrow()
 expect(s.cpu.reservedBytes).toBe(0)
})


describe('resource-owned GL turn mutation barriers',()=>{
 it('releases participant barriers only AFTER GL restore and releases every barrier',()=>{const s=setup(),before=s.snapshot(),order:string[]=[],other={...s.service};s.service.enterBrushGlTurn=()=>{order.push('a+');return()=>{expect(s.snapshot()).toEqual(before);order.push('a-')}};other.enterBrushGlTurn=()=>{order.push('b+');return()=>{expect(s.snapshot()).toEqual(before);order.push('b-')}};runBrushGlTurn({participants:[s.service,other]},()=>{s.gl.activeTexture(s.gl.TEXTURE1);order.push('body')});expect(order).toEqual(['a+','b+','body','b-','a-']);expect(s.cpu.reservedBytes).toBe(0)})
 it('unwinds acquired barriers if a later acquisition throws and preserves undefined primary error',()=>{const s=setup(),released=vi.fn(()=>{throw Error('cleanup')}),other={...s.service};s.service.enterBrushGlTurn=()=>released;other.enterBrushGlTurn=()=>{throw undefined};let threw=false,caught:unknown;try{runBrushGlTurn({participants:[s.service,other]},()=>{throw Error('must not run')})}catch(error){threw=true;caught=error}expect(threw).toBe(true);expect(caught).toBeUndefined();expect(released).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes).toBe(0)})
})


it.each(['turn','batch','borrowed'] as const)('reports cleanup failure separately without replacing the SAME primary in %s',kind=>{
 const s=setup(),primary=Error('actual body'),cleanup=Error('actual release'),observed=vi.fn()
 const owner={owner:{},lease:()=>()=>{throw cleanup}}
 let caught:unknown
 try{
  if(kind==='turn'){
   s.service.enterBrushGlTurn=()=>()=>{throw cleanup}
   runBrushGlTurn({participants:[s.service],onCleanupFailure:observed},()=>{throw primary})
  }else if(kind==='batch')runBrushGlBatch({participants:[s.service],owners:[owner],onCleanupFailure:observed},()=>{throw primary})
  else runBrushGlTurn({participants:[s.service],onCleanupFailure:observed},turn=>runBrushGlBatch({turn,participants:[s.service],owners:[owner]},()=>{throw primary}))
 }catch(error){caught=error}
 expect(caught).toBe(primary);expect(observed).toHaveBeenCalledOnce();expect(observed).toHaveBeenCalledWith(cleanup)
 expect(s.cpu.reservedBytes).toBe(0)
 runBrushGlBatch({participants:[s.service]},()=>{})
})
it('does not report a body failure when actual cleanup succeeded, and observes a swallowed borrowed cleanup',()=>{
 const s=setup(),primary=Error('body'),cleanup=Error('release'),observed=vi.fn()
 expect(()=>runBrushGlTurn({participants:[s.service],onCleanupFailure:observed},()=>{throw primary})).toThrow(primary)
 expect(observed).not.toHaveBeenCalled()
 runBrushGlTurn({participants:[s.service],onCleanupFailure:observed},turn=>{
  try{runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>()=>{throw cleanup}}]},()=>{})}catch(error){expect(error).toBe(cleanup)}
 })
 expect(observed).toHaveBeenCalledOnce();expect(observed).toHaveBeenCalledWith(cleanup)
 expect(s.cpu.reservedBytes).toBe(0)
})
it('preserves undefined legacy primary despite cleanup diagnostics',()=>{
 const s=setup(),cleanup=Error('release'),observed=vi.fn();s.service.enterBrushGlTurn=()=>()=>{throw cleanup}
 let threw=false,caught:unknown='not thrown'
 try{runBrushGlTurn({participants:[s.service],onCleanupFailure:observed},()=>{throw undefined})}catch(error){threw=true;caught=error}
 expect(threw).toBe(true);expect(caught).toBeUndefined();expect(observed).toHaveBeenCalledWith(cleanup)
 expect(s.cpu.reservedBytes).toBe(0)
})

import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import * as accumOwner from '../buffers/AccumulationBuffer'
import {createBrushGlContextOwner} from './BrushGlState'
it('native saved accumulation texture skips inner and outer validity queries with identical restored state',()=>{
 const s=setup(),buffer=new AccumulationBuffer(s.gl,4,4),texture=buffer.texture
 const context=createBrushGlContextOwner(s.gl,{bufferIsCurrent:()=>false,textureIsCurrent:t=>accumOwner.ownsCurrentAccumulationTexture?.(s.gl,t)??false})
 const service={...s.service,brushGlBatchInfo:()=>({...s.service.brushGlBatchInfo(),contextOwner:context.owner})}
 s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,texture);const before=s.snapshot(),query=vi.spyOn(s.gl,'isTexture')
 try{runBrushGlTurn({callbackScope:context.callbackScope,participants:[service]},turn=>runBrushGlBatch({turn,participants:[service]},()=>{s.gl.bindTexture(s.gl.TEXTURE_2D,null)}));expect(query.mock.calls.filter(([t])=>t===texture)).toHaveLength(0);expect(s.snapshot()).toEqual(before)}finally{buffer.destroy()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('native saved accumulation texture remains foreign under an unknown owner and after destruction between restores',()=>{
 const s=setup(),buffer=new AccumulationBuffer(s.gl,4,4),texture=buffer.texture
 const context=createBrushGlContextOwner(s.gl,{bufferIsCurrent:()=>false,textureIsCurrent:t=>accumOwner.ownsCurrentAccumulationTexture?.(s.gl,t)??false})
 const service={...s.service,brushGlBatchInfo:()=>({...s.service.brushGlBatchInfo(),contextOwner:context.owner})}
 s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,texture);const query=vi.spyOn(s.gl,'isTexture')
 try{
  runBrushGlTurn({callbackScope:context.callbackScope,participants:[service]},turn=>runBrushGlBatch({turn,participants:[service],owners:[{owner:{},lease:()=>()=>{buffer.destroy()}}]},()=>{}))
  expect(query.mock.calls.filter(([t])=>t===texture).length).toBeGreaterThan(0);expect(accumOwner.ownsCurrentAccumulationTexture?.(s.gl,texture)??false).toBe(false)
 }finally{buffer.destroy()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('native accumulation texture destruction between restores re-enables outer validation and binds null',()=>{
 const s=setup(),buffer=new AccumulationBuffer(s.gl,4,4),texture=buffer.texture
 const context=createBrushGlContextOwner(s.gl,{bufferIsCurrent:()=>false,textureIsCurrent:t=>accumOwner.ownsCurrentAccumulationTexture?.(s.gl,t)??false})
 const query=vi.spyOn(s.gl,'isTexture');let released=false
 const service={brushGlBatchInfo:()=>({...s.service.brushGlBatchInfo(),contextOwner:context.owner}),enterBrushGlBatch:(frame:BrushGlBatchFrame)=>{const release=s.service.enterBrushGlBatch(frame);return()=>{
  expect(query.mock.calls.filter(([t])=>t===texture)).toHaveLength(0)
  buffer.destroy();released=true;release()
 }}}
 s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,texture)
 try{
  runBrushGlTurn({callbackScope:context.callbackScope,participants:[service]},turn=>runBrushGlBatch({turn,participants:[service]},()=>{s.gl.bindTexture(s.gl.TEXTURE_2D,null)}))
  expect(released).toBe(true);expect(query.mock.calls.filter(([t])=>t===texture).length).toBeGreaterThan(0)
  s.gl.activeTexture(s.gl.TEXTURE0);expect(s.gl.getParameter(s.gl.TEXTURE_BINDING_2D)).toBeNull()
 }finally{buffer.destroy()}
 expect(s.cpu.reservedBytes).toBe(0)
})

it('warm sequence restores one entry snapshot between fresh child tokens and final cleanup',()=>{
 const s=setup(),before=s.snapshot(),queries=vi.spyOn(s.gl,'getParameter');let old:BrushGlTurn|undefined
 uploadTurn.runBrushGlSequence({participants:[s.service]},sequence=>{
  for(let i=0;i<3;i++)sequence.step(turn=>{
   if(old)expect(()=>runBrushGlBatch({turn:old,participants:[s.service]},()=>{})).toThrow()
   expect(s.snapshot()).toEqual(before)
   runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>()=>s.gl.viewport(1,2,3,4)}]},frame=>{frame.beginDraw();s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer())})
   old=turn
  })
 })
 expect(queries.mock.calls.filter(([name])=>name===s.gl.VIEWPORT)).toHaveLength(1)
 expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
 expect(()=>runBrushGlBatch({turn:old,participants:[s.service]},()=>{})).toThrow()
})
it('warm sequence latches a caught valid child throw undefined and attempts all cleanup',()=>{
 const s=setup(),before=s.snapshot();let rejected=false,primary:unknown='unset',second=false
 try{uploadTurn.runBrushGlSequence({participants:[s.service]},sequence=>{
  try{sequence.step(turn=>{try{runBrushGlBatch({turn,participants:[s.service]},()=>{throw undefined})}catch{}})}catch{}
  try{sequence.step(()=>{second=true})}catch{}
 })}catch(error){rejected=true;primary=error}
 expect(rejected).toBe(true);expect(primary).toBeUndefined();expect(second).toBe(false)
 expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})

it('warm sequence latches actual CPU reserve failure before batch frame creation',()=>{
 const s=setup();let second=false,rejected=false,primary:unknown='unset'
 try{uploadTurn.runBrushGlSequence({participants:[s.service]},sequence=>{
  const reserve=vi.spyOn(s.cpu,'reserve').mockImplementationOnce(()=>{throw undefined})
  try{sequence.step(turn=>{try{runBrushGlBatch({turn,participants:[s.service]},()=>{})}catch{}})}catch{}
  reserve.mockRestore()
  try{sequence.step(()=>{second=true})}catch{}
 })}catch(error){rejected=true;primary=error}
 expect(rejected).toBe(true);expect(primary).toBeUndefined();expect(second).toBe(false);expect(s.cpu.reservedBytes).toBe(0)
})

it('warm sequence preserves original undefined batch primary across later native-step cleanup failure',()=>{
 const s=setup();let second=false,rejected=false,primary:unknown='unset'
 try{uploadTurn.runBrushGlSequence({participants:[s.service]},sequence=>{
  // oxlint-disable-next-line no-unsafe-finally -- Intentional cleanup fault verifies preservation of the original undefined failure.
  try{sequence.step(turn=>{try{runBrushGlBatch({turn,participants:[s.service]},()=>{throw undefined})}finally{throw new Error('secondary native cleanup')}})}catch{}
  try{sequence.step(()=>{second=true})}catch{}
 })}catch(error){rejected=true;primary=error}
 expect(rejected).toBe(true);expect(primary).toBeUndefined();expect(second).toBe(false);expect(s.cpu.reservedBytes).toBe(0)
})


it('upload sequence latches a recognized child prelude undefined before caller cleanup replaces it',()=>{
 const s=setup(),next=vi.fn();s.gl.UNPACK_FLIP_Y_WEBGL=9401;s.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL=9402
 const parameters=s.gl.getParameter.bind(s.gl),store=s.gl.pixelStorei.bind(s.gl),flags=new Map([[9401,true],[9402,true]])
 s.gl.getParameter=(key:number)=>flags.has(key)?flags.get(key):parameters(key)
 s.gl.pixelStorei=(key:number,value:number|boolean)=>flags.has(key)?flags.set(key,!!value):store(key,value)
 const before=s.snapshot();let caught:unknown,threw=false
 try{
  uploadTurn.runBrushGlSequence({participants:[s.service],captureAutoUploadUnpack:true,allowAutoUpload:true},sequence=>{
   try{sequence.step(turn=>{
    try{uploadTurn.withBrushGlTurnAutoUploadRestore(turn,s.service,()=>{throw undefined})}
    finally{
     // oxlint-disable-next-line no-unsafe-finally -- Intentional secondary cleanup fault verifies the first undefined failure.
     throw Error('secondary cleanup')
    }
   })}catch{/* The sequence must still remember the actual first failure. */}
   expect(()=>sequence.step(next)).toThrow();expect(next).not.toHaveBeenCalled()
  })
 }catch(error){threw=true;caught=error}
 expect(threw).toBe(true);expect(caught).toBeUndefined();expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('ordinary warm sequence still denies upload without adding upload-unpack queries',()=>{
 const s=setup(),query=vi.spyOn(s.gl,'getParameter')
 runBrushGlTurn({participants:[s.service]},()=>{});const baseline=query.mock.calls.length;query.mockClear()
 uploadTurn.runBrushGlSequence({participants:[s.service]},sequence=>sequence.step(turn=>expect(()=>uploadTurn.borrowBrushGlTurnAutoUploadRestore(turn,s.service)).toThrow('Warm sequence')))
 expect(query.mock.calls).toHaveLength(baseline);expect(s.cpu.reservedBytes).toBe(0)
})


it('closed native sequence removes only the terminal outer restore after native releases',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=setup(),before=s.snapshot(),viewport=vi.spyOn(s.gl,'viewport');let calls=0,old:BrushGlTurn|undefined
 try{
  uploadTurn.runBrushGlClosedNativeSequence({participants:[s.service],started:0},turn=>{
   expect(s.snapshot()).toEqual(before)
   if(old)expect(()=>runBrushGlBatch({turn:old,participants:[s.service]},()=>{})).toThrow()
   runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>()=>s.gl.viewport(7,8,9,10)}]},frame=>{frame.beginDraw();s.gl.bindFramebuffer(s.gl.FRAMEBUFFER,s.gl.createFramebuffer())})
   old=turn;return ++calls<3
  })
  // Each child: batch restore + owner mutation + final child restore. No +1 outer.
  expect(viewport.mock.calls).toHaveLength(9);expect(calls).toBe(3);expect(s.snapshot()).toEqual(before)
  expect(()=>runBrushGlBatch({turn:old,participants:[s.service]},()=>{})).toThrow();expect(s.cpu.reservedBytes).toBe(0)
 }finally{clock.mockRestore()}
})
it('generic sequence still restores arbitrary GL postlude and never accepts a terminal receipt',()=>{
 const s=setup(),before=s.snapshot(),viewport=vi.spyOn(s.gl,'viewport')
 uploadTurn.runBrushGlSequence({participants:[s.service]},sequence=>{
  sequence.step(turn=>runBrushGlBatch({turn,participants:[s.service]},()=>{}))
  s.gl.viewport(5,6,7,8)
 })
 expect(viewport.mock.calls).toHaveLength(4);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('closed sequence checks the deadline after restore and preserves the first indivisible draw',()=>{
 let now=0;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now),s=setup(),original=s.gl.viewport.bind(s.gl);let calls=0
 const view=vi.spyOn(s.gl,'viewport').mockImplementation((...args)=>{original(...args);now=5})
 try{
  uploadTurn.runBrushGlClosedNativeSequence({participants:[s.service],started:0},turn=>{calls++;runBrushGlBatch({turn,participants:[s.service]},frame=>frame.beginDraw());return true})
  expect(calls).toBe(1);expect(view).toHaveBeenCalledTimes(2);expect(s.cpu.reservedBytes).toBe(0)
 }finally{clock.mockRestore()}
})
it('closed sequence rejects escaped/reentered children and preserves an undefined primary across cleanup',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=setup(),before=s.snapshot();let failed=false,value:unknown='unset',saved:BrushGlTurn|undefined
 try{
  try{uploadTurn.runBrushGlClosedNativeSequence({participants:[s.service],started:0},turn=>{
   saved=turn;expect(()=>uploadTurn.runBrushGlClosedNativeSequence({participants:[s.service],started:0},()=>false)).toThrow('Nested')
   try{runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>()=>{throw Error('secondary release')}}]},()=>{throw undefined})}catch{}
   return false
  })}catch(error){failed=true;value=error}
  expect(failed).toBe(true);expect(value).toBeUndefined();expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
  expect(()=>runBrushGlBatch({turn:saved,participants:[s.service]},()=>{})).toThrow()
 }finally{clock.mockRestore()}
})
it('closed sequence rejects nonboolean results without inspecting a foreign then getter',()=>{
 const s=setup(),before=s.snapshot(),get=vi.fn(()=>{s.gl.viewport(1,2,3,4);return undefined})
 const callback=(()=>Object.defineProperty({},'then',{get})) as unknown as (turn:BrushGlTurn)=>boolean
 expect(()=>uploadTurn.runBrushGlClosedNativeSequence({participants:[s.service],started:performance.now()},callback)).toThrow('boolean')
 expect(get).not.toHaveBeenCalled();expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('closed native sequence keeps hard32 children and abandons receipts when restore fails',()=>{
 const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=setup();let calls=0
 try{
  uploadTurn.runBrushGlClosedNativeSequence({participants:[s.service],started:0},turn=>{calls++;runBrushGlBatch({turn,participants:[s.service]},()=>{});return true})
  expect(calls).toBe(32);expect(s.cpu.reservedBytes).toBe(0)
  const viewport=s.gl.viewport.bind(s.gl);let restores=0
  vi.spyOn(s.gl,'viewport').mockImplementation((...args)=>{viewport(...args);if(++restores===2)throw undefined})
  let failed=false,value:unknown='unset';try{uploadTurn.runBrushGlClosedNativeSequence({participants:[s.service],started:0},turn=>{runBrushGlBatch({turn,participants:[s.service]},()=>{});return false})}catch(error){failed=true;value=error}
  expect(failed).toBe(true);expect(value).toBeUndefined();expect(restores).toBe(3);expect(s.cpu.reservedBytes).toBe(0)
 }finally{clock.mockRestore()}
})


describe('registered clear state across generic batch boundaries',()=>{
 it('reads foreign participant getters inside a genuine borrowed turn without using stale mirrored fields',()=>{
  const s=setup(),registration=registerGlClearState(s.gl,{},()=>true)
  const native=createBrushGlContextOwner(s.gl,{bufferIsCurrent:()=>true,textureIsCurrent:()=>true})
  let observe=false,observations=0
  const service:BrushGlBatchParticipant={
   brushGlBatchInfo(){if(observe){s.gl.clearColor(1,0,0,1);expect(captureGlClearState(s.gl).color).toEqual([1,0,0,1]);observations++}return {...s.service.brushGlBatchInfo(),contextOwner:native.owner}},
   enterBrushGlBatch:frame=>s.service.enterBrushGlBatch(frame),
  }
  try{runBrushGlTurn({participants:[service],callbackScope:native.callbackScope},turn=>{
   setGlClearColor(s.gl,0,0,0,0);observe=true
   runBrushGlBatch({participants:[service],turn},()=>{})
   observe=false
  });expect(observations).toBeGreaterThan(0)}finally{registration.release()}
 })
 it('invalidates after foreign lease release writes following restoration, including throw undefined',()=>{
  const s=setup(),registration=registerGlClearState(s.gl,{},()=>true)
  const owner={owner:{},lease:()=>()=>{s.gl.clearColor(0,1,0,1);throw undefined}}
  let caught=false
  try{try{runBrushGlBatch({participants:[s.service],owners:[owner]},()=>{setGlClearColor(s.gl,1,0,0,1)})}catch(error){caught=true;expect(error).toBeUndefined()}
   expect(caught).toBe(true);expect(captureGlClearState(s.gl).color).toEqual([0,1,0,1])
  }finally{registration.release()}
 })
})
