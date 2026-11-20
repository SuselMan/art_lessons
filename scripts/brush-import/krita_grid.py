"""Grid cell geometry and point colour pickup; no stamp-mask fallback."""
from native_timing195 import clock_enabled
import io,math
from pathlib import PurePosixPath
from PIL import Image
from brush_contract import descriptor,finalize_identity,compatibility


def grid_preset(data,root,params,name,catalog,external):
    from krita_import import enabled,numeric,preset_preview
    native_wash=params.get('PaintOpAction','1')=='2'
    if native_wash and any(clock_enabled(params, k)for k in('Krita/erase','PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):raise ValueError('Grid Wash137 eraser/timed input unsupported')
    if enabled(params.get('EraserMode')):raise ValueError('Grid eraser composition is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Grid supports normal compositing only')
    if clock_enabled(params, 'PaintOpSettings/isAirbrushing'):raise ValueError('Grid timed input is not implemented')
    def number(key,default,lo,hi):
        v=numeric(params.get('Grid/'+key),default)
        if not math.isfinite(v)or not lo<=v<=hi:raise ValueError('Grid setting outside bounded range: '+key)
        return v
    width=number('gridWidth',25,1,1024);height=number('gridHeight',25,1,1024);scale=number('scale',1,.01,10);division=number('divisionLevel',2,0,16)
    if int(division)!=division:raise ValueError('Grid division must be integer')
    diameter=numeric(params.get('Grid/diameter'),width)or width
    if not math.isfinite(diameter)or not 1<=diameter<=1000:raise ValueError('Grid diameter outside1..1000')
    shape=numeric(params.get('GridShape/shape'),0)
    if not math.isfinite(shape)or shape!=int(shape)or not 0<=shape<=4:raise ValueError('Unknown Grid shape')
    sample=enabled(params.get('ColorOption/sampleInputColor'))
    d=descriptor(data,'');d.update(version=48,model='mixer',category='wet'if sample else'paint',paperInteraction=0)
    d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    d['mixer']={'load':0 if sample else 1,'initialLoad':0,'pickup':1 if sample else 0,'strength':1}
    if sample:d['mixer']['source']='previousCanvas'
    d['behavior']={'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}}
    d['grid']={'version':1,'width':width,'height':height,'scale':scale,'offset':[number('horizontalOffset',0,-1e9,1e9),number('verticalOffset',0,-1e9,1e9)],'division':int(division),'pressureDivision':enabled(params.get('Grid/pressureDivision')),'border':[number('verticalBorder',0,0,1000),number('horizontalBorder',0,0,1000)],'randomBorder':enabled(params.get('Grid/randomBorder')),'shape':int(shape),'sampleInput':sample,'colorPerCell':enabled(params.get('ColorOption/colorPerParticle')),'randomOpacity':enabled(params.get('ColorOption/useRandomOpacity'))}
    for key,native in [('fillBackground','fillBackground'),('mixBackground','mixBgColor')]:
        if enabled(params.get('ColorOption/'+native)):d['grid'][key]=True
    if enabled(params.get('ColorOption/useRandomHSV')):
        hsv={}
        for key,divisor in [('hue',180),('saturation',100),('value',100)]:
            raw=numeric(params.get('ColorOption/'+key))
            if not math.isfinite(raw)or not -divisor<=raw<=divisor:raise ValueError('Grid HSV outside bounded range: '+key)
            hsv[key]=raw/divisor
        d['grid']['hsv']=hsv
    if any(key in d['grid']for key in ('fillBackground','mixBackground','hsv')):d['version']=70
    note=compatibility('grid','Fixed world grid, pressure subdivision, borders, five shapes and per-cell/per-request point colour retained. Source is gathered once before each request, with512px bounded sampling and4096 cell admission. Uses current pre-request canvas rather than a native transaction-old image. GPU edge/line rounding and random streams differ. Captured brush background fill/mix and per-request/cell HSV use deterministic Grafetto streams. Timer/eraser remain rejected.')
    if native_wash:
        from grid_wash137 import grid_wash137_scope
        d['version']=137;d['grid']['sourcePolicy']='canonical-begin-v1'
        d['behavior']['rendering']['accumulation']='alphaDarken'
        # Native Grid has no Flow/Opacity option application. Keep its unit
        # response; captured operation opacity belongs to the final Wash only.
        if not grid_wash137_scope(d):raise ValueError('Grid Wash137 requires closed root sampled rectangle canonical-BEGIN scope')
        note=compatibility('gridWash','Canonical-BEGIN source policy with one captured gesture identity; point sampling and per-request RGBA accumulation use native Grid geometry with unit Flow/Opacity response. External captured operation opacity is applied once. Canonical concurrency ordering, GPU cell-edge/point sampling and native pixel identity are qualified; runtime host/source readiness is required before enabling this staged capability.')
    im=Image.open(io.BytesIO(data));im.load()
    return {'descriptor':finalize_identity(d,data),'name':root.get('name')or PurePosixPath(name).stem,'source':PurePosixPath(name).name,'preview':preset_preview(im),'sourceDefaults':{'sizePx':diameter*scale,'opacity':1,'flow':1},'compatibility':[note],'warnings':[note['feature']+': '+note['detail']]}
