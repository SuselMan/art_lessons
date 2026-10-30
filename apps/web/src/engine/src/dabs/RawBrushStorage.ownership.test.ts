import { expect, it, vi } from 'vitest';
import { MockGL } from '../../testing/mockGL';
import { recordingGL } from '../../testing/brushPassTestUtils';
import { ownedBrushFixture } from '../../testing/ownedBrushFixture';
import { AccumulationBuffer } from '../buffers/AccumulationBuffer';
import { attachContextStorage, snapshotContextStorage, reserveContextStorage, releaseStorageReservation, assertStorageDomain } from '../buffers/ContextStorageOwner';
import { BrushTextureCache, uploadBrushTexture, releaseUnpublishedBrushResource, distinctBrushStorageChargeBytes, publishOwnedBrushResource, allocateOwnedBrushBuffer, combineOwnedBrushResources } from './BrushTextureCache';
import { TransformedMaskPrepass, transformedMaskPrepassBudget } from './TransformedMaskPrepass';
import { CanonicalRgba8CompositePass, canonicalRgba8CompositeBudget } from './CanonicalRgba8CompositePass';
import { BrushMipCache } from './BrushMipCache';
it('validates every selected level before any GL query, allocation or promise mutation', () => {
    const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext;
    const create = vi.spyOn(mock, 'createTexture'), query = vi.spyOn(mock, 'getParameter');
    expect(() => uploadBrushTexture(gl, [new Uint8Array(16), new Uint8Array(7)], gl.LUMINANCE, gl.CLAMP_TO_EDGE)).toThrow('dimensions');
    expect(create).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(snapshotContextStorage(gl)).toMatchObject({ residentBytes: 0, reservedBytes: 0 });
    const wrong = reserveContextStorage(gl, 84, 'accum-rgba8');
    expect(() => uploadBrushTexture(gl, [new Uint8Array(16),new Uint8Array(4),new Uint8Array(1)], gl.LUMINANCE, gl.CLAMP_TO_EDGE, false, undefined, wrong)).toThrow('domain');
    expect(query).not.toHaveBeenCalled();
    releaseStorageReservation(wrong);
});
it('retains only attempted level charges when failed cleanup leaves unknown storage and preserves external promise', () => {
    const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, ticket = reserveContextStorage(gl, 84, 'brush-texture-rgba-equivalent');
    const primary = new Error('level1 allocation'), original = mock.texImage2D.bind(mock);
    vi.spyOn(mock, 'texImage2D').mockImplementationOnce(original).mockImplementationOnce(() => { throw primary; });
    vi.spyOn(mock, 'deleteTexture').mockImplementationOnce(() => { throw new Error('delete secondary'); });
    expect(() => uploadBrushTexture(gl, [new Uint8Array(16), new Uint8Array(4), new Uint8Array(1)], gl.LUMINANCE, gl.CLAMP_TO_EDGE, false, undefined, ticket)).toThrow(primary);
    expect(snapshotContextStorage(gl)).toMatchObject({ residentBytes: 80, orphanBytes: 80, reservedBytes: 84 });
    assertStorageDomain(gl, ticket, 84, 'brush-texture-rgba-equivalent');
    releaseStorageReservation(ticket);
    AccumulationBuffer.forgetContextStorage(gl);
    expect(snapshotContextStorage(gl).residentBytes).toBe(0);
});
it('single-adopts owned uploads, cleans rejected unpublished resources and keeps two cache identities distinct', () => {
    const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, a = new BrushTextureCache(gl), b = new BrushTextureCache(gl);
    const resource = uploadBrushTexture(gl, [new Uint8Array(16)], gl.RGBA, gl.CLAMP_TO_EDGE, true, { width: 2, height: 2 });
    a.protect(['a']);
    a.putOwned('a', resource);
    releaseUnpublishedBrushResource(resource);
    expect(a.get('a')).toBe(resource.texture);
    b.protect(['b']);
    expect(() => b.putOwned('b', resource)).toThrow('unavailable');
    const rejected = ownedBrushFixture(gl, 4);
    expect(() => b.putOwned('unprotected', rejected)).toThrow('protected');
    releaseUnpublishedBrushResource(rejected);
    const other = ownedBrushFixture(gl, 8);
    b.putOwned('b', other);
    expect(snapshotContextStorage(gl).residentBytes).toBe(24);
    expect(distinctBrushStorageChargeBytes([a.storageChargeSnapshot(), a.storageChargeSnapshot(), b.storageChargeSnapshot()])).toBe(24);
    expect(AccumulationBuffer.contextStorageByteLength(gl)).toBe(0);
    a.clear();
    b.clear();
    expect(snapshotContextStorage(gl).residentBytes).toBe(0);
});
it('attempts every owned part and entry cleanup, preserves first error, and orphans only the failed texture', () => {
    const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, cache = new BrushTextureCache(gl);
    const a = ownedBrushFixture(gl, 16), b = ownedBrushFixture(gl, 8), primary = new Error('delete texture');
    cache.protect(['a', 'b']);
    cache.putOwned('a', a);
    cache.putOwned('b', b);
    const texture = vi.spyOn(mock, 'deleteTexture').mockImplementationOnce(() => { throw primary; }), buffer = vi.spyOn(mock, 'deleteBuffer');
    expect(() => cache.clear()).toThrow(primary);
    expect(texture).toHaveBeenCalledTimes(2);
    expect(buffer).toHaveBeenCalledTimes(2);
    expect(cache.bytes).toBe(0);
    expect(snapshotContextStorage(gl)).toMatchObject({ residentBytes: 4, orphanBytes: 4, reservedBytes: 0 });
    cache.clear();
    AccumulationBuffer.forgetContextStorage(gl);
    expect(snapshotContextStorage(gl).residentBytes).toBe(0);
});
it('healthy false-lost forget cannot refund live storage; actual old epoch cleanup never subtracts fresh storage', () => {
    const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, cache = new BrushTextureCache(gl);
    cache.protect(['old']);
    cache.putOwned('old', ownedBrushFixture(gl, 12));
    const deleted = vi.spyOn(mock, 'deleteTexture');
    cache.clear(true);
    expect(deleted).not.toHaveBeenCalled();
    expect(snapshotContextStorage(gl)).toMatchObject({ residentBytes: 12, orphanBytes: 12 });
    cache.protect(['stale']);
    cache.putOwned('stale', ownedBrushFixture(gl, 8));
    AccumulationBuffer.forgetContextStorage(gl);
    const fresh = ownedBrushFixture(gl, 4);
    cache.clear(true);
    expect(snapshotContextStorage(gl).residentBytes).toBe(4);
    releaseUnpublishedBrushResource(fresh);
});
it('reserves the complete prepass group before staging/GL and counts shared canonical resources once', () => {
    const { gl } = recordingGL(), cache = new BrushTextureCache(gl), cpu = new BrushMipCache(), prepass = new TransformedMaskPrepass(gl, cache, cpu, 'owner');
    attachContextStorage(gl, { limitBytes: 524287 });
    expect(() => prepass.prepare({ width: 16, height: 16, slots: 2 }, [])).toThrow('admission');
    expect(gl.createTexture).not.toHaveBeenCalled();
    expect(gl.createBuffer).not.toHaveBeenCalled();
    expect(cpu.reservedBytes).toBe(0);
    AccumulationBuffer.forgetContextStorage(gl);
    // Same epoch policy is immutable; use a separate context for the admitted group.
    const admitted = recordingGL(), shared = new BrushTextureCache(admitted.gl), hostCpu = new BrushMipCache(), mask = new TransformedMaskPrepass(admitted.gl, shared, hostCpu, 'shared'), pass = new CanonicalRgba8CompositePass(admitted.gl, shared, hostCpu, 'composite');
    const maskBudget = transformedMaskPrepassBudget({ width: 16, height: 16, slots: 2 }), passBudget = canonicalRgba8CompositeBudget({ width: 16, height: 16 });
    admitted.gl.getAttribLocation = () => 0;
    mask.prepare({ width: 16, height: 16, slots: 2 }, []);
    pass.prepare({ width: 16, height: 16 }, mask.preparedResources(), maskBudget.cpuBytes);
    const state = snapshotContextStorage(admitted.gl);
    expect(state.residentBytes).toBe(maskBudget.gpuBytes + passBudget.gpuBytes);
    expect(state.domains['brush-buffer'].residentBytes).toBe(maskBudget.vertexBytes + 48);
    expect(state.domains['accum-rgba8'].residentBytes).toBe(0);
    expect(distinctBrushStorageChargeBytes([shared.storageChargeSnapshot(), shared.storageChargeSnapshot()])).toBe(state.residentBytes);
    pass.reset();
    mask.reset();
    expect(snapshotContextStorage(admitted.gl)).toMatchObject({ residentBytes: 0, reservedBytes: 0 });
    expect(hostCpu.reservedBytes).toBe(0);
});
it('unwinds partial LUT/VBO preparation without losing primary or refunding a failed-delete buffer', () => {
    const { gl } = recordingGL(), cache = new BrushTextureCache(gl), cpu = new BrushMipCache(), prepass = new TransformedMaskPrepass(gl, cache, cpu, 'fault'), primary = new Error('bufferData primary');
    gl.bufferData.mockImplementationOnce(() => { throw primary; });
    gl.deleteBuffer.mockImplementationOnce(() => { throw new Error('delete secondary'); });
    expect(() => prepass.prepare({ width: 16, height: 16, slots: 2 }, [])).toThrow(primary);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(snapshotContextStorage(gl)).toMatchObject({ residentBytes: 16 * 72 * 4, orphanBytes: 16 * 72 * 4, reservedBytes: 0 });
    expect(cpu.reservedBytes).toBe(0);
    expect(cache.bytes).toBe(0);
    AccumulationBuffer.forgetContextStorage(gl);
});
it('real painter publication preserves adoption failure over a later unpublished deletion failure', () => {
    const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, cache = new BrushTextureCache(gl), resource = ownedBrushFixture(gl, 4);
    vi.spyOn(mock, 'deleteTexture').mockImplementationOnce(() => { throw new Error('secondary deletion'); });
    expect(() => publishOwnedBrushResource(cache, 'not-protected', resource)).toThrow('protected');
    expect(snapshotContextStorage(gl)).toMatchObject({ residentBytes: 4, orphanBytes: 4, reservedBytes: 0 });
    AccumulationBuffer.forgetContextStorage(gl);
});
it('rejects stale/fresh merges before consuming either owner and never exposes cached old-epoch handles', () => {
    const mock = new MockGL(), gl = mock as unknown as WebGLRenderingContext, stale = ownedBrushFixture(gl, 4), cache = new BrushTextureCache(gl);
    const cached = ownedBrushFixture(gl, 4);
    cache.protect(['old']);
    cache.putOwned('old', cached);
    AccumulationBuffer.forgetContextStorage(gl);
    const fresh = allocateOwnedBrushBuffer(gl, 12, (buffer, mark) => { gl.bindBuffer(gl.ARRAY_BUFFER, buffer); mark(12); gl.bufferData(gl.ARRAY_BUFFER, 12, gl.STREAM_DRAW); });
    const textureDelete = vi.spyOn(mock, 'deleteTexture'), bufferDelete = vi.spyOn(mock, 'deleteBuffer'), query = vi.spyOn(mock, 'getParameter');
    expect(() => combineOwnedBrushResources(stale, [fresh])).toThrow('companion');
    expect(cache.get('old')).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    releaseUnpublishedBrushResource(stale);
    cache.clear();
    expect(textureDelete).not.toHaveBeenCalled();
    expect(bufferDelete).not.toHaveBeenCalled();
    expect(snapshotContextStorage(gl)).toMatchObject({ residentBytes: 12, reservedBytes: 0 });
    releaseUnpublishedBrushResource(fresh);
    expect(bufferDelete).toHaveBeenCalledTimes(1);
    expect(snapshotContextStorage(gl).residentBytes).toBe(0);
});

it.each([
    { name:'unknown wrap', sizes:[4,1], wrap:123456, discrete:false },
    { name:'missing tail', sizes:[16,4], wrap:0x812f, discrete:false },
    { name:'skipped level', sizes:[16,1], wrap:0x812f, discrete:false },
    { name:'duplicate final', sizes:[4,1,1], wrap:0x812f, discrete:false },
    { name:'increasing level', sizes:[4,16,1], wrap:0x812f, discrete:false },
    { name:'NPOT mip base', sizes:[9,1], wrap:0x812f, discrete:false },
    { name:'repeated NPOT base', sizes:[9], wrap:0x2901, discrete:true },
    { name:'mirrored NPOT base', sizes:[9], wrap:0x8370, discrete:true },
    { name:'repeated rectangular plane',sizes:[15],wrap:0x2901,discrete:true,plane:{width:3,height:5} },
])('rejects $name manifest before any GL call or storage promise',({sizes,wrap,discrete,plane})=>{
    const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext;
    Object.defineProperty(mock,'MIRRORED_REPEAT',{value:0x8370});
    const repeat=wrap===0x812f?gl.CLAMP_TO_EDGE:wrap===0x2901?gl.REPEAT:wrap;
    const create=vi.spyOn(mock,'createTexture'),query=vi.spyOn(mock,'getParameter'),error=vi.spyOn(mock,'getError'),upload=vi.spyOn(mock,'texImage2D');
    expect(()=>uploadBrushTexture(gl,sizes.map(size=>new Uint8Array(size)),gl.LUMINANCE,repeat,discrete,plane)).toThrow();
    expect(create).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();
    expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:0,reservedBytes:0});
});
it('accepts complete POT edge chains, NPOT discrete clamp and the existing rectangular NPOT plane',()=>{
    const mock=new MockGL(),gl=mock as unknown as WebGLRenderingContext;
    Object.defineProperty(mock,'MIRRORED_REPEAT',{value:0x8370});
    const cases=[
        {sizes:[1],wrap:gl.REPEAT,discrete:false},
        {sizes:[16,4,1],wrap:gl.MIRRORED_REPEAT,discrete:false},
        {sizes:[9,7],wrap:gl.CLAMP_TO_EDGE,discrete:true}, // unused discrete level is intentionally not uploaded
        {sizes:[15],wrap:gl.CLAMP_TO_EDGE,discrete:false,plane:{width:3,height:5}},
    ];
    for(const row of cases){const resource=uploadBrushTexture(gl,row.sizes.map(size=>new Uint8Array(size)),gl.LUMINANCE,row.wrap,row.discrete,row.plane);releaseUnpublishedBrushResource(resource)}
    expect(snapshotContextStorage(gl)).toMatchObject({residentBytes:0,reservedBytes:0});
});
