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
