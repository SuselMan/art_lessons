"""Fixed-step particle spring population, independent of stamp shapes."""
import io,math
from pathlib import PurePosixPath
from PIL import Image
from brush_contract import descriptor,finalize_identity,compatibility


def particle_preset(data,root,params,name,catalog,external):
    from krita_import import enabled,numeric,preset_preview
    if enabled(params.get('EraserMode')):raise ValueError('Particle eraser is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Particle supports normal compositing only')
    if enabled(params.get('PaintOpSettings/isAirbrushing'))or enabled(params.get('AirbrushOption/isAirbrushing')):raise ValueError('Particle timed input is not implemented')
    def number(key,default,lo,hi,integer=False):
        v=numeric(params.get('Particle/'+key),default)
        if not math.isfinite(v)or not lo<=v<=hi or integer and int(v)!=v:raise ValueError('Particle setting outside bounded range: '+key)
        return int(v)if integer else v
    p={'version':1,'count':number('count',50,1,500,True),'iterations':number('iterations',10,1,200,True),'gravity':number('gravity',.989,0,1),'weight':number('weight',.2,0,1),'scaleX':number('scaleX',.3,0,2),'scaleY':number('scaleY',.3,0,2)}
    if p['count']*p['iterations']>16384:raise ValueError('Particle request exceeds16384 point budget')
    d=descriptor(data,'');d.update(version=49,model='stamp',category='line',paperInteraction=0)
    d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    d['behavior']={'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}};d['particle']=p
    note=compatibility('particle','Fixed0.00003 integration, initial absolute next-position, per-particle acceleration, gravity, axis force and iterative bilinear additive deposits retained. No native Size option; Grafetto size does not alter solver. GPU U8/bilinear rounding differs. Negative/unstable forces, airbrush timer, eraser and nonnormal composite rejected.16384 points per input request maximum.')
    im=Image.open(io.BytesIO(data));im.load()
    return{'descriptor':finalize_identity(d,data),'name':root.get('name')or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'preview':preset_preview(im),'sourceDefaults':{'sizePx':100,'opacity':1,'flow':1},'compatibility':[note],'warnings':[note['feature']+': '+note['detail']]}
