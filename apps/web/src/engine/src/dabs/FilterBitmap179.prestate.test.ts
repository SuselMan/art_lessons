import{brushPreparationPlan,brushPreparationResources}from'./BrushPreparation'
import{filter147}from'../../../../../../packages/shared/src/filterSmudge147.testFixture'
import{it,expect,vi}from'vitest'
import{BrushPainter}from'./BrushPainter'
import{BrushBehaviorPainter}from'./BrushBehaviorPainter'
import{filter179,kinds179}from'../../../../../../packages/shared/src/filterBitmap179.testFixture'
const filter169=()=>filter179('desaturate')
it('malformed169 preparation fails before GL/program/owner',()=>{const p=Object.create(BrushBehaviorPainter.prototype)as BrushBehaviorPainter,b=filter169();b.version=147;Object.defineProperty(p,'ctx',{get(){throw Error('GL accessed')}});expect(()=>p.prepareFilterSmudge147(b)).toThrow('Invalid Filter169 bitmap scope')})
it('unprepared ordinary bitmap bank fails before actual BEGIN owner callback',()=>{const p=Object.create(BrushPainter.prototype)as BrushPainter,owner=vi.fn(()=>{throw Error('owner touched')}),b=filter169();Object.assign(p,{recordedStampResources:()=>[{painter:'stamp',id:b.tip.mask,grain:false}],hasPreparedTexture:()=>false,behavior:{prepareFilterBeginGesture:owner}});expect(()=>p.prepareFilterBeginGesture({}as never,{size:8}as never,'u','s',{brush:b,pressure:{size:false,opacity:false}},undefined,{}as never,{}as never)).toThrow('Filter169 mask bank is not prepared');expect(owner).not.toHaveBeenCalled()})
it('prepared union reaches SAME existing BEGIN facade without allocating alternative owner',()=>{const p=Object.create(BrushPainter.prototype)as BrushPainter,owner=vi.fn(()=>({kind:'ready' as const})),b=filter169();Object.assign(p,{recordedStampResources:()=>[{painter:'stamp',id:b.tip.mask,grain:false}],hasPreparedTexture:()=>true,behavior:{prepareFilterBeginGesture:owner}});expect(p.prepareFilterBeginGesture({}as never,{size:8}as never,'u','s',{brush:b,pressure:{size:false,opacity:false}},undefined,{}as never,{}as never)).toEqual({kind:'ready'});expect(owner).toHaveBeenCalledTimes(1)})

it('selected169 union equals actual stamp consumer union with no WET duplicate; old147 remains WET',()=>{const b=filter169(),plan=brushPreparationPlan(b),actual=brushPreparationResources({...b,model:'stamp'});expect(plan.resources).toEqual(actual);expect(plan.resources.some(r=>r.id===b.tip.mask&&r.painter==='stamp')).toBe(true);expect(plan.resources.some(r=>r.painter==='wet')).toBe(false);expect(brushPreparationPlan(filter147()).resources.every(r=>r.painter==='wet')).toBe(true)})

it.each(kinds179)('all179 selected masks use SAME stamp union %s',kind=>{const b=filter179(kind),plan=brushPreparationPlan(b);expect(plan.resources).toEqual(brushPreparationResources({...b,model:'stamp'}));expect(plan.resources.some(r=>r.painter==='wet')).toBe(false)})
