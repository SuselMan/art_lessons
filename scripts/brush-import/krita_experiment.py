"""Nonincremental closed shape with optional native-inspired deformation."""
import io,math
from pathlib import PurePosixPath
from PIL import Image
from brush_contract import descriptor,finalize_identity,compatibility


def experiment_preset(data,root,params,name,catalog,external):
    from krita_import import enabled,numeric,preset_preview
    if enabled(params.get('EraserMode')):raise ValueError('Experiment eraser is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Experiment supports normal compositing only')
    fill=numeric(params.get('Experiment/fillType'),0)
    if fill not in (0,1):raise ValueError('Unsupported Experiment fill type')
    if enabled(params.get('PaintOpSettings/isAirbrushing')):raise ValueError('Experiment timed input is not implemented')
    def number(key,default,lo,hi):
        v=numeric(params.get('Experiment/'+key),default)
        if not math.isfinite(v)or not lo<=v<=hi:raise ValueError('Experiment setting outside bounded range: '+key)
        return v
    d=descriptor(data,'');d.update(version=158 if fill==1 else 50,model='stamp',category='paint',paperInteraction=0);d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    d['behavior']={'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}}
    d['experiment']={'version':1,'displaceEnabled':enabled(params.get('Experiment/displacementEnabled')),'displace':number('displacement',50,0,100),'speedEnabled':enabled(params.get('Experiment/speedEnabled')),'speed':number('speed',50,0,100),'smoothingEnabled':enabled(params.get('Experiment/smoothing')),'smoothing':number('smoothingValue',20,0,1000),'winding':enabled(params.get('Experiment/windingFill')),'hardEdge':enabled(params.get('Experiment/hardEdge'))}
    if fill==1:d['experiment'].update(fill='canvasPattern',patternPolicy='captured-world-repeat-v1')
    note=compatibility('experiment','Evolving closed shape, nonincremental coverage replacement, winding/parity, speed correction, smoothing and radial displacement retained.8-bit stencil winding is modulo256, soft edges use four subpixel samples. Flattened deformation and8192-point deterministic decimation differ from Qt curves/simplification. Canvas Pattern158 captures actual selected canvas CAS with identity world-repeat phase; absent pattern emits no ink. Nonidentity transforms/timer/eraser/nonnormal composite rejected. Native NoSize: size does not alter shape.') if fill==1 else compatibility('experiment','Evolving closed shape, nonincremental coverage replacement, winding/parity, speed correction, smoothing and radial displacement retained.8-bit stencil winding is modulo256, soft edges use four subpixel samples. Flattened deformation and8192-point deterministic decimation differ from Qt curves/simplification. Pattern fill/timer/eraser/nonnormal composite rejected. Native NoSize: size does not alter shape.')
    im=Image.open(io.BytesIO(data));im.load()
    return{'descriptor':finalize_identity(d,data),'name':root.get('name')or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'preview':preset_preview(im),'sourceDefaults':{'sizePx':100,'opacity':1,'flow':1},'compatibility':[note],'warnings':[note['feature']+': '+note['detail']]}
