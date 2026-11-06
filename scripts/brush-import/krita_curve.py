"""Curve paintop history paths; uses common opacity and sensor import."""
import io,math
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility


def curve_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled,numeric,size_like_controls
    if enabled(params.get('PaintOpSettings/isAirbrushing')):raise ValueError('Curve timed input is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Curve supports normal compositing only')
    if numeric(params.get('FlowValue'),1)!=1:raise ValueError('Curve nonunit flow is unsupported')
    def number(key,default,lo,hi):
        v=numeric(params.get('Curve/'+key),default)
        if not math.isfinite(v)or not lo<=v<=hi:raise ValueError('Curve setting outside bounded range: '+key)
        return v
    history=number('strokeHistorySize',12,2,128)
    if int(history)!=history:raise ValueError('Curve history must be an integer')
    width=number('lineWidth',1,.1,1000)
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    # Curve has no stamp/Size/Rotation option. Supply a harmless initialization
    # tip only for the common parser, and remove stale unrelated settings.
    for node in list(transformed):
        if node.get('name')in('brush_definition','PressureSize','PressureRotation','PressureScatter','PressureSpacing','PaintOpAction'):transformed.remove(node)
    ET.SubElement(transformed,'param',name='brush_definition').text='<Brush type="auto_brush" spacing="0.1" angle="0"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1" diameter="1"/></Brush>'
    ET.SubElement(transformed,'param',name='PaintOpAction').text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external);d=result['descriptor'];d['version']=46
    d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    for key in ('scatter','texture','wet'):d.pop(key,None)
    for key in ('rotation','scatter','spacing'):d['behavior'].pop(key,None)
    d['sizeByPressure']=[[0,1],[1,1]]
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    trace={'version':1,'history':int(history),'smoothing':enabled(params.get('Curve/smoothing')),'connect':enabled(params.get('Curve/makeConnection')),'opacity':number('curvesOpacity',1,0,1)}
    notes=[];dynamics={}
    for option,key in [('Line width','width'),('Curves opacity','opacity')]:
        if not enabled(params.get('Pressure'+option)):continue
        local=[];controls=size_like_controls(params,option,local,allow_time=True)
        if any(n['status']=='unsupported'for n in local):raise ValueError('Unsupported Curve '+option+' sensor combination')
        value=numeric(params.get(option+'Value'),1)
        if not math.isfinite(value)or not 0<=value<=1:raise ValueError('Curve option value outside0..1')
        if value!=1:controls.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,value],[1,value]]})
        if len(controls)>4:raise ValueError('Curve sensor count limit')
        if controls:dynamics[key]=controls
        notes+=local
    if dynamics:trace['dynamics']=dynamics
    d['curveTrace']=trace
    result['sourceDefaults']={'sizePx':width,'opacity':d['opacity'],'flow':1}
    ignored={'kritaEngine','standardMaskProfile','autoSpacing'}
    result['compatibility']=[n for n in result['compatibility']if n['feature']not in ignored]+notes
    result['compatibility'].append(compatibility('curveTrace','Native bounded history, quadratic midpoint or cubic one-third/two-third controls, optional connection and independent path/request opacity retained. Adaptive de Casteljau stops at0.25px flatness or256 segments; capsule AA/joins differ from Qt painter paths. Size slider controls line width.'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
