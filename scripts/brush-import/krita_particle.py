"""Fixed-step particle spring population, independent of stamp shapes."""
import io,math
from pathlib import PurePosixPath
from PIL import Image
from brush_contract import descriptor,finalize_identity,compatibility


def particle_preset(data,root,params,name,catalog,external,*,timed_input=False):
    from krita_import import enabled,numeric,preset_preview
    if enabled(params.get('EraserMode')):raise ValueError('Particle eraser is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Particle supports normal compositing only')
    timer=enabled(params.get('PaintOpSettings/isAirbrushing'));rate_controls=[]
    if (timer or enabled(params.get('AirbrushOption/isAirbrushing')))and not timed_input:raise ValueError('Particle timed input requires explicit closed157 opt-in')
    if timed_input and (timer or enabled(params.get('AirbrushOption/isAirbrushing'))):
        if not timer or params.get('PaintOpAction','1')!='1'or enabled(params.get('PaintOpSettings/ignoreSpacing'))or enabled(params.get('Krita/erase')):raise ValueError('Particle157 requires root directOver static native timer')
        from native_pressure_rate import native_pressure_rate
        timing=native_pressure_rate(params);rate_controls=timing.get('rateDynamics',[])
    def number(key,default,lo,hi,integer=False):
        v=numeric(params.get('Particle/'+key),default)
        if not math.isfinite(v)or not lo<=v<=hi or integer and int(v)!=v:raise ValueError('Particle setting outside bounded range: '+key)
        return int(v)if integer else v
    p={'version':1,'count':number('count',50,1,500,True),'iterations':number('iterations',10,1,200,True),'gravity':number('gravity',.989,0,1),'weight':number('weight',.2,0,1),'scaleX':number('scaleX',.3,0,2),'scaleY':number('scaleY',.3,0,2)}
    if p['count']*p['iterations']>16384:raise ValueError('Particle request exceeds16384 point budget')
    d=descriptor(data,'');d.update(version=49,model='stamp',category='line',paperInteraction=0)
    d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    d['behavior']={'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}};d['particle']=p
    if params.get('PaintOpAction','1')=='2':
        if enabled(params.get('Krita/erase')):raise ValueError('Particle Wash134 eraser is not implemented')
        from particle_wash134 import particle_wash134_scope
        d['version']=134;d['behavior']['rendering']['accumulation']='alphaDarken'
        if not particle_wash134_scope(d):raise ValueError('Particle Wash134 combination is outside the closed root scope')
    if timer:
        from particle_timer157 import particle_timer157_scope
        d['version']=163 if rate_controls else 157;d['behavior']['timing']=timing
        if not particle_timer157_scope(d):raise ValueError('Particle157 outside closed scope')
    note=compatibility('particle','Fixed0.00003 integration, initial absolute next-position, per-particle acceleration, gravity, axis force and iterative bilinear additive deposits retained. No native Size option; Grafetto size does not alter solver. GPU U8/bilinear rounding differs. Negative/unstable forces, airbrush timer, eraser and nonnormal composite rejected.16384 points per input request maximum.')
    if d['version']==134:note=compatibility('particleWash','Existing additive bilinear solver output is grouped once per logical request, then creamy Wash at unit request opacity; captured external gesture opacity projects once. Native solver/RNG/U8 identity is not claimed.','approximate')
    if d['version']==157:note=compatibility('particleTimer157','Static root native Particle timer uses existing author F64 clock; moving inputs remain one native solver request, stationary inputs use elapsed81 timing. Replay consumes recorded requests without retiming. Source-time/RNG order is functionally qualified, not native sequence identity.','supported')
    if d['version']==163:note=compatibility('particleRate163','Checked native Rate pressure/constant factors and strength use existing author clock81 interval=(1000/baseRate)/factor; zero factor disables painting until native periodic timing refresh. Moving Particle inputs remain one request and do not refresh/spend/reset stationary timing; recorded F64 requests replay without retiming. No fuzzy/combined sensors or native sequence identity claim.','supported')
    im=Image.open(io.BytesIO(data));im.load()
    return{'descriptor':finalize_identity(d,data),'name':root.get('name')or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'preview':preset_preview(im),'sourceDefaults':{'sizePx':100,'opacity':1,'flow':1},'compatibility':[note],'warnings':[note['feature']+': '+note['detail']]}
