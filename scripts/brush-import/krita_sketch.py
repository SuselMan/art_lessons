"""Independent adapter for Sketch's simple radius-neighbour connections.

Reference: pinned KDE sketch option data and paintop. Mask-selected non-simple
connections and active timed input are rejected rather than treated as a disc.
"""
import io
import math
import xml.etree.ElementTree as ET
from PIL import Image, PngImagePlugin
from brush_contract import finalize_identity,compatibility


def sketch_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled,numeric,size_like_controls
    if not enabled(params.get('Sketch/simpleMode')):raise ValueError('Sketch mask-selected connections are not implemented')
    if enabled(params.get('PaintOpSettings/isAirbrushing')):raise ValueError('Sketch timed input is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Sketch supports normal compositing only')
    if numeric(params.get('FlowValue'),1)!=1:raise ValueError('Sketch nonunit flow is unsupported')
    def number(key,default,lo,hi):
        value=numeric(params.get(key),default)
        if not math.isfinite(value) or not lo<=value<=hi:raise ValueError('Sketch setting outside bounded range: '+key)
        return value
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in transformed.findall('param'):
        if node.get('name')=='PaintOpAction':node.text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external)
    d=result['descriptor'];d['version']=44
    d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0}
    d.pop('scatter',None);d.pop('texture',None);d.pop('wet',None)
    behavior=d['behavior'];behavior.pop('rotation',None);behavior.pop('scatter',None);behavior.pop('spacing',None)
    behavior['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    d['sketch']={'version':1,'mode':'simple','width':number('Sketch/lineWidth',1,.01,1000),'offset':number('Sketch/offset',30,-1000,1000)/100,'probability':number('Sketch/probability',.5,0,1),
                 **{target:enabled(params.get('Sketch/'+source,str(default).lower())) for target,source,default in [('connect','makeConnection',True),('magnetify','magnetify',True),('randomRGB','randomRGB',False),('randomOpacity','randomOpacity',False),('distanceDensity','distanceDensity',True),('distanceOpacity','distanceOpacity',False),('antialias','antiAliasing',False)]}}
    notes=[];controls={}
    for option,key in [('Line width','width'),('Offset scale','offset'),('Density','probability')]:
        if not enabled(params.get('Pressure'+option)):continue
        local=[];values=size_like_controls(params,option,local,allow_time=True)
        if any(n['status']=='unsupported'for n in local):raise ValueError('Unsupported Sketch '+option+' sensor combination')
        value=number(option+'Value',1,0,1)
        if value!=1:values.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,value],[1,value]]})
        if len(values)>4:raise ValueError('Sketch sensor count limit')
        if values:controls[key]=values
        notes+=local
    if controls:d['sketch']['dynamics']=controls
    ignored={'autoSpacing','standardMaskProfile','radialCurveProfile','gaussianProcedural','softCurveGenerator','gihSelection','RotationComposition','RotationSensor'}
    result['compatibility']=[n for n in result['compatibility']if n['feature']not in ignored and n['feature']!='kritaEngine']+notes
    for n in result['compatibility']:
        if n['feature']=='activeDynamics':n['detail']=', '.join(v for v in n['detail'].split(', ')if v not in ('PressureLine width','PressureOffset scale','PressureDensity','PressureRotation'))
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='activeDynamics' or n['detail']]
    result['compatibility'].append(compatibility('sketch','Simple-radius connections, original author input knots, magnetify/offset, probability/distance density, binary distance opacity, random RGB/opacity and line controls retained. Retains32768 input points and at most4096 recent neighbours per request. RNG and capsule AA/line byte rounding differ from native DDA/Wu.'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
