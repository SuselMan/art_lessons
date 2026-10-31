import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CANONICAL_MATERIAL_PROFILE, CANONICAL_STROKE_RASTER_PROFILE, isBrushLibrary, packCanonicalMaterial, sourceImageTransformMetadata, sourcePngRasterShape,
  type CanonicalMaterialFrame, type CanonicalStrokeFrameEnvelope } from '@grafetto/shared'
import { BrushStorage, empty } from '../brushLibrary/storage.js'
import { CanonicalBrushCapabilityResolver } from './CanonicalBrushCapabilityResolver.js'
import { CanonicalStrokeAdmission } from './CanonicalStrokeAdmission.js'
import { rooms, type RoomRecord } from './roomRegistry.js'
const dirs: string[] = []
afterEach(() => { rooms.clear(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function resident(id: string, lessonId: string | null = null): RoomRecord {
  const record: RoomRecord = { room: { id, name: id, ownerId: 'teacher', paper: 'coarse', infinite: false,
    hasPassword: false, accessMode: 'anyone_with_link', createdAt: '2026-10-29T00:00:00Z', rasterVersion: 'straight-rgba8-v1' },
    lessonId, sockets: new Set(['authenticated-socket']), boards: [], assignments: [], activeAssignmentId: null,
    spotlightBoardId: null, handsRaised: new Set(), assignmentStarting: false, passwordHash: undefined,
    operations: [], participants: new Map(), nextSeq: 1, layerStateSeq: null, layerStateIds: null, coveredSeqByLayer: new Map(),
    palette: [], roomFrozen: false, frozenUserIds: new Set(), lockedLayerIds: new Set(), sharedLockedLayerIds: new Set(),
    aliveIds: new Set(['layer']), deletedIds: new Set(), operationsById: new Map(), structuralLog: [] }
  record.participants.set('teacher', { userId: 'teacher', name: 'T', role: 'owner', color: '#000000', frozen: false, boardId: id })
  record.participants.set('author', { userId: 'author', name: 'A', role: 'member', color: '#000000', frozen: false, boardId: id })
  rooms.set(id, record); return record
}
function fixture() {
  // Production-imported source descriptor; raw curves/compiled dictionary are
  // schema validated. Pixel fixture is independent small opaque gray L8 CAS.
  const imported = JSON.parse(readFileSync(new URL('../../../web/src/engine/src/presets/fixtures/sourceStrokeAuthorDescriptor.compiled.json', import.meta.url), 'utf8'))
  const bytes = Buffer.alloc(64, 127), hash = createHash('sha256').update(bytes).digest('hex'), asset = { id: `asset:${hash}`, size: 8, file: hash + '.bin' }
  const library: unknown = { schemaVersion: 1, brushes: [{ name: 'Imported', source: 'authored.kpp', warnings: [], descriptor: {
    ...imported.descriptor, tip: { ...imported.descriptor.tip, mask: asset.id },
  } }], assets: [asset], skipped: [] }
  if (!isBrushLibrary(library)) throw Error('invalid test import')
  const dir = mkdtempSync(join(tmpdir(), 'canonical-capability-')); dirs.push(dir)
  const storage = new BrushStorage(dir); storage.install('author', library, new Map([[hash, bytes]]))
  const lesson = resident('lesson'), board = resident('board', lesson.room.id)
  const identity = { roomId: board.room.id, userId: 'author' }
  const input = { layerId: 'layer', brush: `brush:${library.brushes[0].descriptor.id}@${library.brushes[0].descriptor.version}`, strokeId: 'gesture',
    pigmentRgb8: [31, 117, 203] as [number, number, number], outerResourceOpacity: .63, alphaDarken: 'creamy' as const }
  const binder = new CanonicalBrushCapabilityResolver({ storage, operator: empty, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
    alphaDarkenVariants: ['creamy'], maxGestures: 4 })
  return { binder, storage, dir, hash, library, identity, input, board, lesson }
}
describe('actual trusted board + immutable descriptor/CAS canonical binder (socket path closed)', () => {
  it('accepts authenticated runtime resources once, copies them and binds exact source crop/settings with verified CAS', () => {
    const f = fixture(), pin = vi.spyOn(f.storage, 'pin'), grant = f.binder.beginGesture(f.identity, f.input)
    expect(grant.pigmentRgb8).toEqual([31, 117, 203]); expect(grant.composition).toEqual({ mode: 'buildup', alphaDarken: 'creamy', outerBlend: 'over', outerResourceOpacity: .63 })
    expect(grant.material.assets).toEqual([{ id: `asset:${f.hash}`, size: 8, x: 2, y: 1, width: 3, height: 5 }])
    expect(grant.descriptorSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(f.binder.beginGesture(f.identity, structuredClone(f.input))).toBe(grant)
    f.input.pigmentRgb8[0] = 255; f.input.outerResourceOpacity = .1
    expect(grant.pigmentRgb8[0]).toBe(31); expect(grant.composition.outerResourceOpacity).toBe(.63)
    expect(Object.isFrozen(grant.material.assets[0])).toBe(true); expect(Object.isFrozen(grant)).toBe(true)
    expect(f.binder.resolve(f.identity, f.input)).toBe(grant)
    expect(() => f.binder.beginGesture(f.identity, f.input)).toThrow('already pinned')
    expect(pin).not.toHaveBeenCalled(); expect(f.storage.library('rooms', 'board')).toEqual(empty())
    expect(f.board.operations).toEqual([])
  })
  it('rechecks authoritative lesson/board permissions on resolve and never takes them from frame settings', () => {
    const changes: ((f: ReturnType<typeof fixture>) => void)[] = [f => { f.lesson.room.closedAt = 'now' },
      f => { f.lesson.roomFrozen = true }, f => { f.lesson.frozenUserIds.add('author') },
      f => { f.board.sharedLockedLayerIds.add('layer') }, f => { f.board.lockedLayerIds.add('layer') },
      f => { f.board.deletedIds.add('layer') }, f => { f.board.aliveIds.delete('layer') },
      f => { f.board.room.boardOwnerId = 'another-student' }, f => { f.lesson.participants.delete('author') },
      f => { f.board.room.rasterVersion = 'legacy-pm8-v1' }, _f => { rooms.delete('lesson') }]
    for (const change of changes) {
      const f = fixture(); f.binder.beginGesture(f.identity, f.input); change(f)
      expect(f.binder.resolve(f.identity, f.input)).toBeUndefined()
      expect(() => f.binder.beginGesture(f.identity, { ...f.input, strokeId: 'new-gesture' })).toThrow('permission')
      expect(f.binder.size).toBe(1)
    }
  })
  it('uses resident object epochs; same room id after replacement cannot resume an old gesture', () => {
    const f = fixture(), first = f.binder.beginGesture(f.identity, f.input)
    resident('board', 'lesson')
    expect(f.binder.resolve(f.identity, f.input)).toBeUndefined()
    f.binder.clearRoom('board')
    const next = f.binder.beginGesture(f.identity, f.input)
    expect(next.boardEpoch).toBeGreaterThan(first.boardEpoch)
    resident('lesson')
    expect(f.binder.resolve(f.identity, f.input)).toBeUndefined()
    f.binder.clearRoom('board')
    expect(f.binder.beginGesture(f.identity, f.input).boardEpoch).toBeGreaterThan(next.boardEpoch)
  })
  it('rejects unavailable versions, conflicting immutable descriptors, corrupt CAS and unsupported material before pinning state', () => {
    const f = fixture()
    expect(() => f.binder.beginGesture(f.identity, { ...f.input, brush: f.input.brush + ':variant' })).toThrow('versioned')
    expect(() => f.binder.beginGesture(f.identity, { ...f.input, brush: f.input.brush.replace(/@\d+$/, '@999') })).toThrow('unavailable')
    const conflict = structuredClone(f.library); conflict.brushes[0].descriptor.opacity = .5
    const bad = new CanonicalBrushCapabilityResolver({ storage: f.storage, operator: () => conflict, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
      alphaDarkenVariants: ['creamy'], maxGestures: 4 })
    expect(() => bad.beginGesture(f.identity, f.input)).toThrow('Immutable brush conflict')
    writeFileSync(join(f.dir, 'assets', f.hash + '.bin'), Buffer.alloc(64, 128))
    expect(() => f.binder.beginGesture(f.identity, f.input)).toThrow('Corrupt brush asset')
    expect(f.binder.size).toBe(0)
    const unsupported = fixture(); Object.assign(unsupported.library.brushes[0].descriptor.sourceStamp!.flags, { textureEnabled: true })
    // A fresh verified manifest can retain a material which this execution class cannot admit.
    const library = unsupported.library
    const other = new BrushStorage(mkdtempSync(join(tmpdir(), 'canonical-other-'))); dirs.push(other.root)
    other.install('author', library, new Map([[unsupported.hash, Buffer.alloc(64, 127)]]))
    const b = new CanonicalBrushCapabilityResolver({ storage: other, operator: empty, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
      alphaDarkenVariants: ['creamy'], maxGestures: 4 })
    expect(() => b.beginGesture(unsupported.identity, unsupported.input)).toThrow('unsupported-material-consumer')
    expect(b.size).toBe(0)
  })
  it('requires explicit whitelisted execution policy and finite authenticated begin settings', () => {
    const f = fixture()
    for (const patch of [{ alphaDarken: 'hard' }, { outerResourceOpacity: NaN }, { outerResourceOpacity: -1 },
      { pigmentRgb8: [1, 2, 256] }, { pigmentRgb8: [1, 2, .5] }, { rasterProfile: CANONICAL_STROKE_RASTER_PROFILE }]) {
      expect(() => f.binder.beginGesture(f.identity, { ...f.input, ...patch } as typeof f.input)).toThrow('settings')
    }
    expect(f.binder.resolve({ ...f.identity, userId: 'forged' }, f.input)).toBeUndefined()
    expect(f.binder.size).toBe(0)
    const both = new CanonicalBrushCapabilityResolver({ storage: f.storage, operator: empty, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
      alphaDarkenVariants: ['creamy', 'hard'], maxGestures: 1 })
    expect(both.beginGesture(f.identity, { ...f.input, alphaDarken: 'hard' }).composition.alphaDarken).toBe('hard')
    expect(() => both.beginGesture(f.identity, { ...f.input, strokeId: 'next' })).toThrow('capacity')
  })
  it('hashes the whole normalized descriptor, independently of property order, and requires retained nonidentity curves', () => {
    const f = fixture(), teacher = { ...f.identity, userId: 'teacher' }
    const bind = (library: typeof f.library) => new CanonicalBrushCapabilityResolver({ storage: f.storage, operator: () => library,
      rasterProfile: CANONICAL_STROKE_RASTER_PROFILE, alphaDarkenVariants: ['creamy'], maxGestures: 4 })
    const first = bind(f.library).beginGesture(teacher, f.input)
    const reordered = structuredClone(f.library), d = reordered.brushes[0].descriptor
    reordered.brushes[0].descriptor = Object.fromEntries(Object.entries(d).reverse()) as typeof d
    expect(bind(reordered).beginGesture(teacher, f.input).descriptorSha256).toBe(first.descriptorSha256)
    const changed = structuredClone(f.library); changed.brushes[0].descriptor.opacity = .5
    expect(bind(changed).beginGesture(teacher, f.input).descriptorSha256).not.toBe(first.descriptorSha256)
    const uncompiled = structuredClone(f.library); Object.assign(uncompiled.brushes[0].descriptor.sourceStamp!, { compiled: undefined })
    expect(() => bind(uncompiled).beginGesture(teacher, f.input)).toThrow('curve programs unavailable')
  })
  it('feeds the real admission decoder through the binder and rejects later colour/composition/static geometry claims', () => {
    const f = fixture(), grant = f.binder.beginGesture(f.identity, f.input)
    if('version' in grant.material)throw Error('Expected image fixture context')
    const admission = new CanonicalStrokeAdmission({ resolve: f.binder.resolve, maxGestures: 4, retainedFrames: 8 })
    const source = f.library.brushes[0].descriptor.sourceStamp!.brush
    const extent = sourceImageTransformMetadata(source.width, source.height, sourcePngRasterShape(source, { scale: 1, ratio: 1, rotation: 0 }), 0, 0)
    const recipe = { asset: grant.material.primaryAsset, brushScale: source.scale, brushAngle: source.angle, scale: 1,
      ratio: 1, rotation: 0, subX: 0, subY: 0, width: extent.width, height: extent.height, mirrorH: false, mirrorV: false }
    const frame: CanonicalMaterialFrame = { profile: CANONICAL_MATERIAL_PROFILE, masked: false, entry: { phase: 'between' },
      definitions: [recipe], draws: [{ definition: 0, role: 'primary', x: -3, y: 7, opacity: .4, flow: .7 }],
      fences: [{ at: 0, kind: 'segmentBegin', group: 0 }, { at: 1, kind: 'primaryEnd', group: 0 },
        { at: 1, kind: 'segmentEnd', group: 0 }, { at: 1, kind: 'gestureEnd' }] }
    const envelope: CanonicalStrokeFrameEnvelope = { version: 1, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE,
      brush: grant.brush, strokeId: grant.strokeId, frameOrdinal: 0, pigmentRgb8: grant.pigmentRgb8, composition: grant.composition,
      materialPacked: packCanonicalMaterial(frame, grant.material) }
    const candidate = { type: 'canonical_stroke' as const, id: 'op', layerId: f.input.layerId, frame: envelope }
    expect(() => admission.prepare(f.identity, { ...candidate, frame: { ...envelope, pigmentRgb8: [0, 0, 0] } })).toThrow('pinned')
    expect(() => admission.prepare(f.identity, { ...candidate, frame: { ...envelope, composition: { ...grant.composition, alphaDarken: 'hard' } } })).toThrow('pinned')
    const badStatic = { ...frame, definitions: [{ ...recipe, brushScale: .8 }] }
    const forged = packCanonicalMaterial(badStatic, { ...grant.material, preflightDefinition: () => ({ workUnits: 1000, outputBytes: recipe.width * recipe.height * 4 }) })
    expect(() => admission.prepare(f.identity, { ...candidate, frame: { ...envelope, materialPacked: forged } })).toThrow('geometry changed')
    expect(admission.size).toBe(0)
    admission.prepare(f.identity, candidate).commit()
    expect(admission.prepare(f.identity, candidate).duplicate).toBe(true)
    const image=grant.material
    expect(() => image.preflightDefinition({ asset: image.primaryAsset, brushScale: 999, brushAngle: .25, scale: 1,
      ratio: 1, rotation: 0, subX: 0, subY: 0, width: 3, height: 5, mirrorH: false, mirrorV: false }, image.assets[0])).toThrow('geometry changed')
    expect(f.board.operations).toEqual([])
  })
})


it('never turns retained mask data into an unsupported Over/erase/effect execution grant', () => {
  const f=fixture(), teacher={...f.identity,userId:'teacher'}
  const changes: ((descriptor: typeof f.library.brushes[number]['descriptor'])=>void)[] = [
    d=>{d.behavior={...d.behavior!,erase:true}},
    d=>{d.behavior!.rendering!.mode='uniformGlaze';delete d.behavior!.rendering!.accumulation},
    d=>{d.behavior!.rendering!.opacityCeiling='shape'},
    ...(['multiply','overlay','lighten','colorDodge','color'] as const).map(blendMode=>(d:typeof f.library.brushes[number]['descriptor'])=>{d.behavior!.rendering!.blendMode=blendMode}),
    d=>{d.behavior!.rendering!.wetEdges=.2},
    d=>{d.behavior!.rendering!.burntEdges=.2},
    d=>{d.behavior!.rendering!.gammaCorrect=true},
    d=>{d.behavior!.rendering!.luminance=true},
    d=>{d.tip.alphaThreshold={value:.5,softness:0}},
    d=>{d.behavior!.edgeBleed={pressure:.2,tilt:0}},
    d=>{d.behavior!.taper={start:1,end:1,size:1,opacity:1,pressure:true};delete d.behavior!.rendering!.accumulation},
  ]
  const asset=vi.spyOn(f.storage,'asset'), pin=vi.spyOn(f.storage,'pin')
  for(const [index, change] of changes.entries()){
    const library=structuredClone(f.library);change(library.brushes[0].descriptor)
    expect(isBrushLibrary(library), `schema case ${index}`).toBe(true)
    const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:()=>library,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'],maxGestures:4})
    expect(()=>binder.prepareBeginGesture(teacher,f.input)).toThrow('unsupported canonical Over execution')
    expect(binder.size).toBe(0)
    expect(binder.resolve(teacher,f.input)).toBeUndefined()
    expect(asset).not.toHaveBeenCalled();expect(pin).not.toHaveBeenCalled()
    expect(f.board.operations).toEqual([]);expect(f.board.nextSeq).toBe(1)
  }
})
it('captures closed role lists without invoking array accessors or permitting a read-only policy to enable authors',()=>{
 const f=fixture(),base={storage:f.storage,operator:empty,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'] as const,maxGestures:4,primaryImageSource:'single-inverse-gray-v2' as const}
 const get=vi.fn(()=> 'incremental-inverse-gray-v2'),getter=Array(1);Object.defineProperty(getter,'0',{get})
 for(const list of [getter,Array(1),Object.assign([],{[Symbol('x')]:0}),['unknown'],['incremental-inverse-gray-v2','incremental-inverse-gray-v2']]){
  expect(()=>Reflect.construct(CanonicalBrushCapabilityResolver,[{...base,allowedRecordedImagePipeSources:list}])).toThrow('image pipe policy')
 }
 expect(get).not.toHaveBeenCalled()
 expect(()=>new CanonicalBrushCapabilityResolver({...base,allowedRecordedImagePipeSources:[],authorImagePipeSources:['incremental-inverse-gray-v2']})).toThrow('image pipe policy')
})
it('keeps an original cached single-source pin when its operator catalog is removed or replaced',()=>{
 const f=fixture();f.storage.atomic(f.storage.path('owners','author'),empty())
 let operator=f.library
 const binder=new CanonicalBrushCapabilityResolver({storage:f.storage,operator:()=>operator,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,alphaDarkenVariants:['creamy'],maxGestures:4})
 const first=binder.beginGesture(f.identity,f.input)
 operator=empty();expect(binder.beginGesture(f.identity,f.input)).toBe(first)
 operator={...f.library,brushes:f.library.brushes.map(b=>({...b,descriptor:{...b.descriptor,flow:.125}}))}
 expect(binder.beginGesture(f.identity,f.input)).toBe(first)
 expect(first.material).not.toBeUndefined();expect(binder.size).toBe(1)
})
