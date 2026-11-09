"""Current-data deformation through the shared canvas sampling contract."""
import io,math
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility


def deform_preset(data,root,params,name,catalog,external,*,timed_input=False):
    from krita_import import preset,enabled,numeric
    if enabled(params.get('EraserMode')):raise ValueError('Deform eraser is unsupported')
    composite=params.get('CompositeOp','copy')
    if composite not in ('copy','normal'):raise ValueError('Unsupported Deform composition')
    old_data=enabled(params.get('Deform/useOldData'))
    timer=enabled(params.get('PaintOpSettings/isAirbrushing'))
    if any(enabled(params.get(k))for k in ('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):
        if not timed_input:raise ValueError('Deform timed input requires closed160 opt-in')
        if not timer or not old_data or enabled(params.get('PressureRate'))or enabled(params.get('PaintOpSettings/ignoreSpacing'))or enabled(params.get('Krita/erase')):raise ValueError('Deform160 requires static canonical checked timer and OLD source')
        rate=numeric(params.get('PaintOpSettings/rate'),20)
        if not math.isfinite(rate)or not 0<rate<=1000:raise ValueError('Deform160 rate outside0..1000')
    def number(key,default,lo,hi):
        value=numeric(params.get(key),default)
        if not math.isfinite(value)or not lo<=value<=hi:raise ValueError('Deform setting outside bounded range: '+key)
        return value
    diameter=number('Brush/diameter',80,1,1000);scale=number('Brush/scale',1,.01,10);aspect=number('Brush/aspect',1,.01,1)
    spacing=number('Brush/spacing',.15,.001,10)/(2*scale)
    if spacing>100:raise ValueError('Deform spacing exceeds common sampler bound')
    mode=number('Deform/deformAction',1,1,8)
    if mode!=int(mode):raise ValueError('Deform mode must be integer')
    angle=number('Brush/rotation',0,-360,360)
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in list(transformed):
        if node.get('name')in('brush_definition','CompositeOp','PaintOpAction','paintop')or(timer and node.get('name')in('PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing')):transformed.remove(node)
    ET.SubElement(transformed,'param',name='CompositeOp').text='normal'
    ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    ET.SubElement(transformed,'param',name='brush_definition').text=f'<Brush type="auto_brush" spacing="0.1" angle="{angle}"><MaskGenerator type="circle" ratio="{aspect}" hfade="1" vfade="1" diameter="{diameter*scale}"/></Brush>'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external,timed_input=timer,_allow_texture_material=False);d=result['descriptor']
    d.update(version=51,model='mixer',category='wet',paperInteraction=0,flow=1)
    d['flowByPressure']=[[0,1],[1,1]]
    d['tip'].pop('profile',None);d['tip']['kind']='round'
    for key in ('scatter','texture','wet'):d.pop(key,None)
    d['mixer']={'load':0,'initialLoad':0,'pickup':1,'strength':1,'source':'previousCanvas','smearAlpha':composite=='copy'}
    b=d['behavior'];b['spacing']={'mode':'diameter','coefficient':spacing,'isotropic':True}
    b['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    d['deform']={'version':1,'mode':int(mode),'amount':number('Deform/deformAmount',.05,0,1),'counter':enabled(params.get('Deform/useCounter')),'bilinear':enabled(params.get('Deform/bilinear')),'density':min(1,number('Brush/density',1,0,100)),'jitter':number('Brush/jitterMovement',0,0,10)if enabled(params.get('Brush/jitterMovementEnabled'))else 0,'baseScale':scale}
    if old_data:
        d['version']=145
        d['deform']['sourcePolicy']='canonical-begin-v1'
    if timer:
        from deform_timer160 import deform_timer160_scope
        d['version']=160;b['timing']={'version':1,'rate':rate,'ignoreDistanceSpacing':False}
        if not deform_timer160_scope(d):raise ValueError('Deform160 outside closed root scope')
    result['sourceDefaults']={'sizePx':diameter*scale,'opacity':d['opacity'],'flow':1}
    note=compatibility('deform','Squared elliptical distance, Grow/Shrink, swirl, Move, lenses, colour displacement and COPY transparency retained. Current pre-request source only. Sampling capped at512px and2048 world pixels; singular/oversized requests skipped. Native rounding, density RNG and rotation details differ. Frozen transaction source and timers rejected.')
    if old_data:
        note=compatibility('deform','Frozen canonical stroke-BEGIN source. Current destination COPY/OVER remains per request. Sampling capped at512px and2048 world pixels; singular/oversized requests skipped. Native rounding, density RNG and rotation details remain functionally qualified; timers rejected.')
    if timer:note=compatibility('deformTimer160','Existing canonical-BEGIN OLD source; static native Airbrush uses common81 F64 author distance/time requests and constructor spacing independent of pressure Size. Moving and stationary requests share accumulators; replay never retimes. Native RNG/U8 identity remains qualified.','supported')
    result['compatibility']=[n for n in result['compatibility']if n['feature']not in ('kritaEngine','standardMaskProfile','autoSpacing')]+[note]
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
