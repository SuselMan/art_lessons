"""World-anchored hatching mask; common tip/dynamics remain in the stamp path."""
import io,math
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import finalize_identity,compatibility


def hatching_preset(data,root,params,name,catalog,external):
    from krita_import import preset,enabled,numeric,size_like_controls
    if enabled(params.get('Hatching/bool_opaquebackground')):raise ValueError('Hatching opaque background requires a captured background colour')
    if enabled(params.get('PaintOpSettings/isAirbrushing')):raise ValueError('Hatching timed input is not implemented')
    if params.get('CompositeOp','normal')!='normal':raise ValueError('Hatching supports normal compositing only')
    if numeric(params.get('FlowValue'),1)!=1:raise ValueError('Hatching nonunit flow is unsupported')
    transformed=ET.fromstring(ET.tostring(root));transformed.set('paintopid','paintbrush')
    for node in transformed.findall('param'):
        if node.get('name')=='PaintOpAction':node.text='1'
    im=Image.open(io.BytesIO(data));im.load();meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(transformed,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta)
    result=preset(out.getvalue(),name,catalog,external);d=result['descriptor'];d['version']=47
    for key in ('scatter','texture','wet'):d.pop(key,None)
    for key in ('scatter','rotation'):d['behavior'].pop(key,None)
    d['behavior']['rendering']={'mode':'buildUp','blendMode':'normal','accumulation':'directOver','wetEdges':0,'burntEdges':0,'burntEdgesMode':'multiply'}
    def number(key,default,lo,hi):
        value=numeric(params.get('Hatching/'+key),default)
        if not math.isfinite(value)or not lo<=value<=hi:raise ValueError('Hatching setting outside bounded range: '+key)
        return value
    style='none'
    if not enabled(params.get('Hatching/bool_nocrosshatching','true')):
        for key,value in [('perpendicular','perpendicular'),('minusthenplus','minusPlus'),('plusthenminus','plusMinus'),('moirepattern','moire')]:
            if enabled(params.get('Hatching/bool_'+key)):style=value;break
    intervals=number('separationintervals',2,2,7)
    if int(intervals)!=intervals:raise ValueError('Hatching separation intervals must be integer')
    h={'version':1,'angle':number('angle',-60,-360,360),'separation':number('separation',6,.1,10000),'thickness':number('thickness',1,.1,1000),'origin':[number('origin_x',50,-1e9,1e9),number('origin_y',50,-1e9,1e9)],'style':style,'intervals':int(intervals),'antialias':enabled(params.get('Hatching/bool_antialias')),'subpixel':enabled(params.get('Hatching/bool_subpixelprecision'))}
    notes=[];dynamics={}
    for option,key in [('Angle','angle'),('Crosshatching','cross'),('Separation','separation'),('Thickness','thickness')]:
        if not enabled(params.get('Pressure'+option)):continue
        local=[];controls=size_like_controls(params,option,local,allow_time=True)
        if any(n['status']=='unsupported'for n in local):raise ValueError('Unsupported Hatching '+option+' sensors')
        v=numeric(params.get(option+'Value'),1)
        if not math.isfinite(v)or not 0<=v<=1:raise ValueError('Hatching option value outside0..1')
        if v!=1:controls.append({'control':'off','minimum':0,'jitter':0,'curve':[[0,v],[1,v]]})
        if len(controls)>4:raise ValueError('Hatching sensor count limit')
        # Presence carries native checked state even when its result is1.
        dynamics[key]=controls;notes+=local
    if dynamics:h['dynamics']=dynamics
    d['hatching']=h
    result['compatibility']=[n for n in result['compatibility']if n['feature']!='kritaEngine']+notes
    result['compatibility'].append(compatibility('hatching','World origin, separation bins, integer thickness, crosshatch order/thresholds, moire and checked angle sensors retained. Procedural infinite lines clipped by the common tip replace native clipped DDA strokes. Pixel rounding/joins and non-subpixel endpoint rounding differ; opaque background rejected.'))
    result['warnings']=[n['feature']+': '+n['detail']for n in result['compatibility']if n['status']!='supported']
    result['descriptor']=finalize_identity(d,data)
    return result
